const { Events, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Ticket = require('../models/Ticket');
const { createWorker } = require('tesseract.js');
const pdf = require('pdf-parse');
const fetch = require('node-fetch');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');

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

        const message = interaction.message
        message.edit();
        // Find product in database
        const product = await Product.findOne({
          ticketId: ticket.messageId,
          optionId: selectedValue
        });

        // Check if product exists and has stock
        if (!product || product.stock <= 0) {
          // Criar um botão para notificação de estoque
          const notifyButton = new ButtonBuilder()
            .setCustomId(`notify_stock_${selectedValue}`)
            .setLabel('Receber notificação')
            .setEmoji('🔔')
            .setStyle(ButtonStyle.Secondary);
            
          const row = new ActionRowBuilder().addComponents(notifyButton);
          
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#242429')
                .setTitle('Produto sem estoque')
                .setDescription(`Desculpe, este produto está sem estoque no momento. Você pode receber uma notificação quando ele estiver disponível.`)
            ],
            components: [row],
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
      let selectedProduct = null;
      if (interaction.isStringSelectMenu()) {
        const selectedValue = interaction.values[0];
        selectedOption = ticket.embedSettings.menuOptions.find(
          opt => opt.value === selectedValue
        );
        ticket.selectedOption = selectedValue; // Store selected option value
        
        // Buscar o produto no banco de dados
        selectedProduct = await Product.findOne({
          ticketId: ticket.messageId,
          optionId: selectedValue
        });
        
        // Inicializa o carrinho
        if (selectedProduct) {
          ticket.cart = {
            productId: selectedValue,
            quantity: 1,
            totalPrice: selectedProduct.price
          };
        }
        
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
        
        // Adicionar campo com a quantidade e valor total se um produto foi selecionado
        if (selectedProduct) {
          threadEmbed.addFields({ 
            name: 'Quantidade e Valor',
            value: `Quantidade: **${ticket.cart.quantity}**\nValor unitário: **R$ ${selectedProduct.price.toFixed(2)}**\nValor total: **R$ ${ticket.cart.totalPrice.toFixed(2)}**`
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

      // Adicionar botões de controle de quantidade se for vendas e houver produto selecionado
      if (ticket.ticketType === 'vendas' && selectedProduct) {
        buttons.unshift(
          new ButtonBuilder()
            .setCustomId('decrease_quantity')
            .setLabel('-1')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(ticket.cart.quantity <= 1), // Desabilitar se estiver no mínimo
          new ButtonBuilder()
            .setCustomId('increase_quantity')
            .setLabel('+1')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(ticket.cart.quantity >= selectedProduct.stock), // Desabilitar se estiver no máximo
          /* new ButtonBuilder()
            .setCustomId('apply_coupon')
            .setLabel('Aplicar Cupom')
            .setStyle(ButtonStyle.Primary) */
        );
      }

      // Only add PIX button if it's a sales ticket and has PIX key configured
      if (ticket.ticketType === 'vendas' && ticket.embedSettings.pixKey) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('pix_button')
            .setLabel('Chave Pix')
            .setStyle(ButtonStyle.Success)
        );
      }

      // Enviar e fixar a mensagem inicial
      const welcomeMessage = await thread.send({
        embeds: [threadEmbed],
        components: [new ActionRowBuilder().addComponents(buttons)]
      });

      // Salvar ID da mensagem do carrinho para atualizações futuras
      if (ticket.ticketType === 'vendas' && selectedProduct) {
        ticket.cart.messageId = welcomeMessage.id;
        await ticket.save();
      }

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

    // Adicione este handler para o botão apply_coupon
    if (interaction.customId === 'apply_coupon') {
      const modal = new ModalBuilder()
        .setCustomId('apply_coupon_modal')
        .setTitle('Aplicar Cupom de Desconto');

      const couponInput = new TextInputBuilder()
        .setCustomId('coupon_code')
        .setLabel('Código do Cupom')
        .setPlaceholder('Digite o código do cupom')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const actionRow = new ActionRowBuilder().addComponents(couponInput);
      modal.addComponents(actionRow);
      
      await interaction.showModal(modal);
      return;
    }

    // Adicione este handler para o modal
    if (interaction.isModalSubmit() && interaction.customId === 'apply_coupon_modal') {
      const couponCode = interaction.fields.getTextInputValue('coupon_code');
      const ticket = await Ticket.findOne({ threadId: interaction.channelId });
      
      if (!ticket) {
        await interaction.reply({
          content: '❌ Erro ao encontrar informações do ticket.',
          ephemeral: true
        });
        return;
      }
      
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), active: true });
      
      if (!coupon) {
        await interaction.reply({
          content: '❌ Cupom não encontrado.',
          ephemeral: true
        });
        return;
      }
      
      if (coupon.uses >= coupon.maxUses) {
        await interaction.reply({
          content: '❌ Este cupom atingiu o limite de uso.',
          ephemeral: true
        });
        return;
      }
      
      // Verificar valor mínimo
      const selectedProduct = await Product.findOne({
        ticketId: ticket.messageId,
        optionId: ticket.selectedOption
      });
      
      if (!selectedProduct) {
        await interaction.reply({
          content: '❌ Produto não encontrado.',
          ephemeral: true
        });
        return;
      }
      
      const totalPrice = selectedProduct.price * ticket.cart.quantity;
      
      if (totalPrice < coupon.minOrderValue) {
        await interaction.reply({
          content: `❌ Valor mínimo para usar este cupom: R$ ${coupon.minOrderValue.toFixed(2)}`,
          ephemeral: true
        });
        return;
      }
      
      if (ticket.cart.quantity < coupon.minProducts) {
        await interaction.reply({
          content: `❌ Quantidade mínima para usar este cupom: ${coupon.minProducts} produtos`,
          ephemeral: true
        });
        return;
      }
      
      // Calcular desconto
      let discount = 0;
      if (coupon.discountType === 'percentage') {
        discount = totalPrice * (coupon.discountValue / 100);
      } else {
        discount = Math.min(coupon.discountValue, totalPrice); // Não permitir desconto maior que o total
      }
      
      const finalPrice = totalPrice - discount;
      
      // Atualizar o carrinho com o cupom
      ticket.cart.coupon = {
        code: coupon.code,
        name: coupon.name,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discount: discount
      };
      
      ticket.cart.totalPrice = finalPrice;
      await ticket.save();
      
      // Atualizar a mensagem do carrinho
      const message = await interaction.channel.messages.fetch(ticket.cart.messageId);
      
      const threadEmbed = new EmbedBuilder()
        .setTitle(`Compra: ${selectedProduct.name}`)
        .setColor("#242429")
        .setDescription(`Olá ${interaction.user}, para finalizar sua compra do produto **${selectedProduct.name}**:\n\n` +
          '1. Clique no botão PIX para copiar a chave\n' +
          '2. Realize o pagamento\n' +
          '3. Envie o comprovante neste canal\n' +
          '4. Aguarde a validação do pagamento');
          
      if (selectedProduct.description) {
        threadEmbed.addFields({ 
          name: 'Detalhes do Produto', 
          value: selectedProduct.description 
        });
      }
      
      let valueText = `Quantidade: **${ticket.cart.quantity}**\n`;
      valueText += `Valor unitário: **R$ ${selectedProduct.price.toFixed(2)}**\n`;
      valueText += `Subtotal: **R$ ${totalPrice.toFixed(2)}**\n`;
      
      if (ticket.cart.coupon) {
        valueText += `Cupom: **${ticket.cart.coupon.name}**\n`;
        valueText += `Desconto: **R$ ${ticket.cart.coupon.discount.toFixed(2)}**\n`;
      }
      
      valueText += `Valor total: **R$ ${finalPrice.toFixed(2)}**`;
      
      threadEmbed.addFields({ 
        name: 'Quantidade e Valor',
        value: valueText
      });
      
      const buttons = [
        new ButtonBuilder()
          .setCustomId('decrease_quantity')
          .setLabel('-1')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(ticket.cart.quantity <= 1),
        new ButtonBuilder()
          .setCustomId('increase_quantity')
          .setLabel('+1')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(ticket.cart.quantity >= selectedProduct.stock),
        new ButtonBuilder()
          .setCustomId('apply_coupon')
          .setLabel('Aplicar Cupom')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(ticket.cart.coupon !== undefined),
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
      ];
      
      if (ticket.cart.coupon) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('remove_coupon')
            .setLabel('Remover Cupom')
            .setStyle(ButtonStyle.Danger)
        );
      }
      
      if (ticket.embedSettings.pixKey) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('pix_button')
            .setLabel('Chave Pix')
            .setStyle(ButtonStyle.Success)
        );
      }
      
      await message.edit({
        embeds: [threadEmbed],
        components: [new ActionRowBuilder().addComponents(buttons)]
      });
      
      await interaction.reply({
        content: `✅ Cupom aplicado com sucesso! Desconto: R$ ${discount.toFixed(2)}`,
        ephemeral: true
      });
      
      // Incrementar uso do cupom
      coupon.uses += 1;
      await coupon.save();
      
      return;
    }

    // Adicione este handler para remover cupom
    if (interaction.customId === 'remove_coupon') {
      const ticket = await Ticket.findOne({ threadId: interaction.channelId });
      
      if (!ticket || !ticket.cart.coupon) {
        await interaction.reply({
          content: '❌ Não há cupom aplicado.',
          ephemeral: true
        });
        return;
      }
      
      const selectedProduct = await Product.findOne({
        ticketId: ticket.messageId,
        optionId: ticket.selectedOption
      });
      
      if (!selectedProduct) {
        await interaction.reply({
          content: '❌ Produto não encontrado.',
          ephemeral: true
        });
        return;
      }
      
      // Recalcular o preço total sem o cupom
      const totalPrice = selectedProduct.price * ticket.cart.quantity;
      
      // Remover o cupom
      const cupomRemovido = ticket.cart.coupon;
      ticket.cart.coupon = undefined;
      ticket.cart.totalPrice = totalPrice;
      await ticket.save();
      
      // Atualizar a mensagem do carrinho
      const message = await interaction.channel.messages.fetch(ticket.cart.messageId);
      
      const threadEmbed = new EmbedBuilder()
        .setTitle(`Compra: ${selectedProduct.name}`)
        .setColor("#242429")
        .setDescription(`Olá ${interaction.user}, para finalizar sua compra do produto **${selectedProduct.name}**:\n\n` +
          '1. Clique no botão PIX para copiar a chave\n' +
          '2. Realize o pagamento\n' +
          '3. Envie o comprovante neste canal\n' +
          '4. Aguarde a validação do pagamento');
          
      if (selectedProduct.description) {
        threadEmbed.addFields({ 
          name: 'Detalhes do Produto', 
          value: selectedProduct.description 
        });
      }
      
      threadEmbed.addFields({ 
        name: 'Quantidade e Valor',
        value: `Quantidade: **${ticket.cart.quantity}**\nValor unitário: **R$ ${selectedProduct.price.toFixed(2)}**\nValor total: **R$ ${totalPrice.toFixed(2)}**`
      });
      
      const buttons = [
        new ButtonBuilder()
          .setCustomId('decrease_quantity')
          .setLabel('-1')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(ticket.cart.quantity <= 1),
        new ButtonBuilder()
          .setCustomId('increase_quantity')
          .setLabel('+1')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(ticket.cart.quantity >= selectedProduct.stock),
        new ButtonBuilder()
          .setCustomId('apply_coupon')
          .setLabel('Aplicar Cupom')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
      ];
      
      if (ticket.embedSettings.pixKey) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('pix_button')
            .setLabel('Chave Pix')
            .setStyle(ButtonStyle.Success)
        );
      }
      
      await message.edit({
        embeds: [threadEmbed],
        components: [new ActionRowBuilder().addComponents(buttons)]
      });
      
      await interaction.reply({
        content: `✅ Cupom "${cupomRemovido.code}" removido com sucesso!`,
        ephemeral: true
      });
      
      return;
    }
  }
};