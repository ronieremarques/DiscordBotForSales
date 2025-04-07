const { Events, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');
const { createWorker } = require('tesseract.js');
const pdf = require('pdf-parse');
const fetch = require('node-fetch');
const Product = require('../models/Product');

// Função para extrair texto de PDF
async function extractTextFromPDF(buffer) {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error('Erro ao ler PDF:', error);
    return null;
  }
}

async function isPaymentProof(attachment) {
  const keywords = ['comprovante', 'comprov', 'payment', 'pix', 'transferencia', 'pagamento', 'recibo'];
  
  try {
    // Check filename first
    const filename = attachment.name.toLowerCase();
    
    // Improved filename check
    const hasKeywordInName = keywords.some(keyword => 
      filename.includes(keyword.toLowerCase())
    );
    
    if (hasKeywordInName) {
      return true;
    }

    // Get file extension
    const fileType = filename.split('.').pop().toLowerCase();
    
    // Check if file type is supported
    if (!['png', 'jpg', 'jpeg', 'pdf'].includes(fileType)) {
      return false;
    }

    // Rest of OCR logic...
    let text = '';
    const response = await fetch(attachment.url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (fileType === 'pdf') {
      const data = await pdf(buffer);
      text = data.text;
    } else {
      const worker = await createWorker('por');
      const { data } = await worker.recognize(attachment.url);
      text = data.text;
      await worker.terminate();
    }

    if (!text) return false;

    const normalizedText = text.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    
    const matchedKeywords = keywords.filter(keyword => 
      normalizedText.includes(keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    );

    return matchedKeywords.length >= 2;

  } catch (error) {
    console.error('Erro na análise do arquivo:', error);
    return false;
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'create_ticket') return;

    try {
      await interaction.deferReply({ ephemeral: true });

      const ticket = await Ticket.findOne({ messageId: interaction.message.id });
      
      if (!ticket) {
        return interaction.editReply({
          content: '❌ Configuração não encontrada.'
        });
      }

      // Check stock if it's a menu selection
      if (interaction.isStringSelectMenu()) {
        const selectedValue = interaction.values[0];
        const selectedOption = ticket.embedSettings.menuOptions.find(
          opt => opt.value === selectedValue
        );

        // Find product in database
        const product = await Product.findOne({
          ticketId: ticket.messageId,
          optionId: selectedValue
        });

        // Check if product exists and has stock
        if (!product || product.stock <= 0) {
          return interaction.editReply({
            content: '❌ Desculpe, este produto está sem estoque no momento.',
            ephemeral: true
          });
        }
      }

      const existingThread = interaction.channel.threads.cache.find(
        thread => thread.name === `${interaction.user.username}`
      );

      if (existingThread) {
        const isVendas = ticket.ticketType === 'vendas';
        return interaction.editReply({
          content: isVendas ? 
            '❌ Você já possui um carrinho aberto!' : 
            '❌ Você já possui um ticket aberto!',
          components: isVendas ? [
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setLabel('Ir para o carrinho')
                  .setStyle(ButtonStyle.Link)
                  .setURL(`https://discord.com/channels/${interaction.guild.id}/${existingThread.id}`)
              )
          ] : []
        });
      }

      const thread = await interaction.channel.threads.create({
        name: `${interaction.user.username}`,
        type: ChannelType.PrivateThread
      });

      // Pingar o vendedor
      if (ticket) {
        // Enviar mensagem com ping para o vendedor
        await thread.send({
          content: `||<@${ticket.userId}><@${interaction.user.id}>||`,
          allowedMentions: { users: [ticket.userId] }
        });
      }

      ticket.threadId = thread.id;
      ticket.status = 'open';
      await ticket.save();

      await thread.members.add(interaction.user.id);

      // Get selected option if it's a menu interaction
      let selectedOption = null;
      if (interaction.isStringSelectMenu()) {
        const selectedValue = interaction.values[0];
        selectedOption = ticket.embedSettings.menuOptions.find(
          opt => opt.value === selectedValue
        );
        ticket.selectedOption = selectedValue; // Store selected option value
        await ticket.save();
      }

      const threadEmbed = new EmbedBuilder();

      if (ticket.ticketType === 'vendas') {
        threadEmbed
          .setTitle(selectedOption ? `Compra: ${selectedOption.label}` : ticket.embedSettings.title)
          .setColor("#242429")
          .setDescription(`Olá ${interaction.user}, para finalizar sua compra${selectedOption ? ` do produto **${selectedOption.label}**` : ''}:\n\n` +
            '1. Clique no botão PIX para copiar a chave\n' +
            '2. Realize o pagamento\n' +
            '3. Envie o comprovante neste canal\n' +
            '4. Aguarde a validação do pagamento');

        if (selectedOption?.description) {
          threadEmbed.addFields({ 
            name: 'Detalhes do Produto', 
            value: selectedOption.description 
          });
        }
      } else {
        threadEmbed
          .setTitle(selectedOption ? `Ticket: ${selectedOption.label}` : 'Ticket Aberto')
          .setColor("#242429")
          .setDescription(`Olá ${interaction.user}, obrigado por abrir um ticket${selectedOption ? ` sobre **${selectedOption.label}**` : ''}!\nComo podemos ajudar?`);
      }

      const buttons = [
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
      ];

      // Only add PIX button if it's a sales ticket and has PIX key configured
      if (ticket.ticketType === 'vendas' && ticket.embedSettings.pixKey) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('pix_button')
            .setLabel('Pix')
            .setStyle(ButtonStyle.Success)
        );
      }

      // Enviar e fixar a mensagem inicial
      const welcomeMessage = await thread.send({
        embeds: [threadEmbed],
        components: [new ActionRowBuilder().addComponents(buttons)]
      });

      // Fixar a mensagem
      await welcomeMessage.pin('Mensagem inicial do ticket');

      // Modificar o collector para usar a nova função
      const proofCollector = thread.createMessageCollector({
        filter: async m => {
          if (m.attachments.size > 0) {
            const attachment = m.attachments.first();
            
            const isProof = await isPaymentProof(attachment);
            
            return isProof;
          }
          return false;
        }
      });

      proofCollector.on('collect', async message => {
        try {
          const attachment = message.attachments.first();
          
          const fileName = attachment.name.toLowerCase();
          
          // Verifica se é um comprovante válido
          const isProof = fileName.includes('comprovante') || 
                          fileName.includes('comprov') || 
                          fileName.includes('payment') || 
                          fileName.includes('pix') ||
                          ['.png', '.jpg', '.jpeg', '.pdf'].some(ext => fileName.endsWith(ext));

          if (isProof) {
            // Criar botão de validação apenas para administradores
            const validationButton = new ButtonBuilder()
              .setCustomId('validate_payment')
              .setLabel('JÁ FIZ A ENTREGA!')
              .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(validationButton);

            // Enviar mensagem com botão de validação
            await thread.send({
              content: `||<@${ticket.userId}>||`,
              embeds: [
                new EmbedBuilder()
                  .setTitle('Possivel Comprovante de Pagamento')
                  .setColor('Green')
                  .setDescription(`Comprovante enviado por ${message.author}!\n-# Agurarde a validação do pagamento, por um administrador.\n-# Administradores, só cliquem no botão abaixo se já tiver feito a entrega do produto.\n-# Caso contrário, não cliquem.\nAdministradores, sempre verifiquem se o pagamento foi recebido no seu banco e se o comprovante é válido, antes de fazer a entrega, cuidado com comprovante fake, sempre verifique seu banco se caiu o valor.`)
              ],
              components: [row]
            });

            // Armazenar informações do comprovante no ticket
            await Ticket.findOneAndUpdate(
              { threadId: thread.id },
              { 
                'deliveryStatus.proofImage': attachment.url,
                'deliveryStatus.buyerId': message.author.id
              }
            );
          }
        } catch (error) {
          console.error('Erro ao processar comprovante:', error);
          await thread.send('❌ Ocorreu um erro ao processar o comprovante.');
        }
      });

      // Adicionar tratamento de erro mais robusto
      proofCollector.on('error', error => {
        console.error('Erro no collector:', error);
        thread.send('❌ Ocorreu um erro ao processar o arquivo. Por favor, tente novamente.');
      });

      // Adicionar tratamento de erro para o collector
      proofCollector.on('end', async collected => {
        try {
          // Check if thread still exists before sending message
          const threadExists = await interaction.client.channels.fetch(thread.id)
            .catch(() => null);
            
          if (threadExists && collected.size === 0) {
            await thread.send('⚠️ Nenhum comprovante detectado ainda. Por favor, envie o comprovante de pagamento.')
              .catch(console.error);
          }
        } catch (error) {
          console.error('Erro ao verificar thread:', error);
        }
      });

      // Final success message
      await interaction.editReply({
        content: ticket.ticketType === 'vendas' ? 
          '🛒 Carrinho criado com sucesso!' : 
          '✅ Ticket criado com sucesso!',
        components: ticket.ticketType === 'vendas' ? [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setLabel('Ir para o carrinho')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${interaction.guild.id}/${thread.id}`)
            )
        ] : []
      });

    } catch (error) {
      console.error('Erro:', error);
      // If there's an error, edit the deferred reply
      await interaction.editReply({
        content: '❌ Erro ao criar ticket.'
      });
    }
  }
};