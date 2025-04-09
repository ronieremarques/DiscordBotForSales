const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Ticket = require('../models/Ticket');
const Product = require('../models/Product');
const Review = require('../models/Review');
const { updateProductEmbed } = require('../utils/embedUtils');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Verificar se é uma interação que devemos tratar
    if (!interaction.customId?.startsWith('review_') && 
        interaction.customId !== 'validate_payment') return;

    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    // Quando o pagamento é validado, enviar mensagem para avaliar
    if (interaction.customId === 'validate_payment') {
      try {
        const ticket = await Ticket.findOne({ threadId: interaction.channel.id });
        if (!ticket || !ticket.selectedOption) return;

        // Verificar se existe canal de avaliações configurado
        if (!ticket.reviewChannelId) return;

        // Buscar o produto
        const product = await Product.findOne({
          optionId: ticket.selectedOption
        });

        if (!product) return;

        console.log('Debug - Validate Payment:', {
          ticketId: ticket.threadId,
          productId: ticket.selectedOption,
          reviewChannelId: ticket.reviewChannelId
        });

        // Tentar enviar mensagem privada para o comprador
        try {
          const buyer = await interaction.client.users.fetch(ticket.deliveryStatus.buyerId);
          const reviewButton = new ButtonBuilder()
            .setCustomId(`review_${ticket.selectedOption}_${ticket.threadId}_${ticket.reviewChannelId}`)
            .setLabel('Avaliar Produto')
            .setEmoji('⭐')
            .setStyle(ButtonStyle.Secondary);

          await buyer.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#242429')
                .setTitle('Avalie sua compra!')
                .setDescription(`Produto: ${product.label}\nPreço: R$ ${product.price.toFixed(2)}\nQuantidade: ${ticket.cart.quantity}\n\nSua avaliação é muito importante para nós!`)
            ],
            components: [new ActionRowBuilder().addComponents(reviewButton)]
          });
        } catch (error) {
          console.error('Erro ao enviar mensagem de avaliação:', error);
        }
      } catch (error) {
        console.error('Erro ao processar avaliação:', error);
      }
      return;
    }

    // Quando o botão de avaliar é clicado
    if (interaction.isButton() && interaction.customId.startsWith('review_')) {
      try {
        // Primeiro, pega a string completa após 'review_'
        const fullString = interaction.customId.substring('review_'.length);
        // Depois divide pelos underscores restantes
        const parts = fullString.split('_');
        
        // O optionId será as duas primeiras partes juntas (option_XXXXX)
        const optionId = parts[0] + '_' + parts[1];
        const threadId = parts[2];
        const channelId = parts[3];
        
        console.log('Debug - Review Button:', {
          optionId,
          threadId,
          channelId
        });

        // Buscar o produto usando o optionId completo
        const product = await Product.findOne({ optionId: optionId });
        
        console.log('Debug - Produto encontrado:', product);
        
        if (!product) {
          await interaction.reply({
            content: '❌ Produto não encontrado.',
            ephemeral: true
          });
          return;
        }

        // Verificar se o canal de avaliações existe
        if (!channelId) {
          await interaction.reply({
            content: '❌ Canal de avaliações não configurado.',
            ephemeral: true
          });
          return;
        }

        // Criar modal de avaliação
        const modal = new ModalBuilder()
          .setCustomId(`review_modal_${optionId}_${threadId}_${channelId}`)
          .setTitle('Avaliar Produto');

        const ratingInput = new TextInputBuilder()
          .setCustomId('rating')
          .setLabel('Nota (1 a 5 estrelas)')
          .setPlaceholder('Digite um número de 1 a 5')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1);

        const descriptionInput = new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Sua avaliação')
          .setPlaceholder('Conte-nos o que achou do produto...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(1000);

        modal.addComponents(
          new ActionRowBuilder().addComponents(ratingInput),
          new ActionRowBuilder().addComponents(descriptionInput)
        );

        await interaction.showModal(modal);
      } catch (error) {
        console.error('Erro ao mostrar modal de avaliação:', error);
        await interaction.reply({
          content: '❌ Erro ao processar avaliação.',
          ephemeral: true
        });
      }
      return;
    }

    // Quando o modal de avaliação é enviado
    if (interaction.isModalSubmit() && interaction.customId.startsWith('review_modal_')) {
      try {
        await interaction.deferReply({ ephemeral: true });

        // Primeiro, pega a string completa após 'review_modal_'
        const fullString = interaction.customId.substring('review_modal_'.length);
        // Depois divide pelos underscores restantes
        const parts = fullString.split('_');
        
        // O optionId será as duas primeiras partes juntas (option_XXXXX)
        const optionId = parts[0] + '_' + parts[1];
        const threadId = parts[2];
        const channelId = parts[3];
        
        console.log('Debug - Modal Submit:', {
          optionId,
          threadId,
          channelId
        });

        const rating = parseInt(interaction.fields.getTextInputValue('rating'));
        const description = interaction.fields.getTextInputValue('description');

        // Validar nota
        if (isNaN(rating) || rating < 1 || rating > 5) {
          await interaction.editReply({
            content: '❌ A nota deve ser um número entre 1 e 5.'
          });
          return;
        }

        // Buscar o produto
        const product = await Product.findOne({ optionId: optionId });
        
        console.log('Debug - Modal - Produto encontrado:', product);
        
        if (!product) {
          await interaction.editReply({
            content: '❌ Produto não encontrado.'
          });
          return;
        }

        // Criar a avaliação
        const review = await Review.create({
          userId: interaction.user.id,
          productId: optionId,
          purchaseId: threadId,
          rating: rating,
          description: description,
          purchaseQuantity: 1,
          purchasePrice: product.price
        });

        // Criar embed da avaliação
        const reviewEmbed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('⭐ Nova Avaliação')
          .setDescription(`**Produto:** ${product.label}\n**Preço:** R$ ${product.price.toFixed(2)}`)
          .addFields(
            { name: 'Avaliação', value: '⭐'.repeat(rating), inline: true },
            { name: 'Cliente', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Comentário', value: `\`\`\`${description}\`\`\`` }
          )
          .setTimestamp();

        // Enviar a avaliação no canal configurado
        try {
          const reviewChannel = await interaction.client.channels.fetch(channelId);
          if (reviewChannel) {
            await reviewChannel.send({ 
              embeds: [reviewEmbed]
            });
            console.log('Avaliação enviada com sucesso para o canal:', channelId);
          }
        } catch (error) {
          console.error('Erro ao enviar avaliação para o canal:', error);
        }

        // Desabilitar o botão na mensagem privada original
        try {
          const dmChannel = await interaction.user.createDM();
          const messages = await dmChannel.messages.fetch({ limit: 50 });
          const reviewMessage = messages.find(m => 
            m.components?.[0]?.components?.[0]?.customId === `review_${optionId}_${threadId}_${channelId}`
          );

          if (reviewMessage) {
            const disabledButton = new ButtonBuilder()
              .setCustomId(`review_${optionId}_${threadId}_${channelId}`)
              .setLabel('Avaliação Enviada')
              .setEmoji('⭐')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true);

            await reviewMessage.edit({
              content: reviewMessage.content,
              components: [new ActionRowBuilder().addComponents(disabledButton)]
            });
            console.log('Botão desabilitado com sucesso na DM');
          } else {
            console.log('Mensagem de avaliação não encontrada na DM');
          }
        } catch (error) {
          console.error('Erro ao atualizar botão na DM:', error);
        }

        await interaction.editReply({
          content: '✅ Obrigado por avaliar o produto!'
        });

      } catch (error) {
        console.error('Erro ao processar avaliação:', error);
        await interaction.editReply({
          content: '❌ Erro ao processar sua avaliação.'
        });
      }
    }
  }
}; 