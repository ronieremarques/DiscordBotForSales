const { Events, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'create_ticket') return;

    try {
      const ticket = await Ticket.findOne({ messageId: interaction.message.id });
      
      if (!ticket) {
        return interaction.reply({
          content: '❌ Configuração não encontrada.',
          ephemeral: true
        });
      }

      const existingThread = interaction.channel.threads.cache.find(
        thread => thread.name === `ticket-${interaction.user.username}`
      );

      if (existingThread) {
        const isVendas = ticket.ticketType === 'vendas';
        return interaction.reply({
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
          ] : [],
          ephemeral: true
        });
      }

      const thread = await interaction.channel.threads.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.PrivateThread
      });

      ticket.threadId = thread.id;
      ticket.status = 'open';
      await ticket.save();

      await thread.members.add(interaction.user.id);

      // Get selected option if it's a menu interaction
      let selectedOption = null;
      if (interaction.isStringSelectMenu()) {
        selectedOption = ticket.embedSettings.menuOptions.find(
          opt => opt.value === interaction.values[0]
        );
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

      // Atualizar a função do collector
      const proofCollector = thread.createMessageCollector({
        filter: m => {
          // Verifica apenas anexos
          if (m.attachments.size > 0) {
            const attachment = m.attachments.first();
            const fileName = attachment.name.toLowerCase();
            
            // Verifica nome do arquivo ou extensão
            return fileName.includes('comprovante') || 
                   fileName.includes('comprov') || 
                   fileName.includes('payment') || 
                   fileName.includes('pix') ||
                   ['.png', '.jpg', '.jpeg', '.pdf'].some(ext => fileName.endsWith(ext));
          }
          return false; // Ignora mensagens sem anexos
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
              .setLabel('CONFIRMAR PAGAMENTO')
              .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(validationButton);

            // Enviar mensagem com botão de validação
            await thread.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle('Possivel Comprovante de Pagamento')
                  .setColor('Green')
                  .setDescription(`Comprovante enviado por ${message.author}!\n-# Agurarde a validação do pagamento.`)
                  .setImage(attachment.url)
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

      await interaction.reply({
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
        ] : [],
        ephemeral: true
      });

    } catch (error) {
      console.error('Erro:', error);
      await interaction.reply({
        content: '❌ Erro ao criar ticket.',
        ephemeral: true
      });
    }
  }
};