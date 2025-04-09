const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Ticket = require('../models/Ticket');
const Product = require('../models/Product');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'increase_quantity' && interaction.customId !== 'decrease_quantity') return;

    try {
      // Buscar o ticket relacionado à thread atual
      const ticket = await Ticket.findOne({ threadId: interaction.channel.id });

      if (!ticket || !ticket.cart || !ticket.cart.productId) {
        return interaction.reply({
          content: '❌ Informações do carrinho não encontradas.',
          ephemeral: true
        });
      }

      // Buscar o produto
      const product = await Product.findOne({
        ticketId: ticket.messageId,
        optionId: ticket.cart.productId
      });

      if (!product) {
        return interaction.reply({
          content: '❌ Produto não encontrado.',
          ephemeral: true
        });
      }

      // Atualizar a quantidade com base no botão clicado
      if (interaction.customId === 'increase_quantity') {
        // Verificar se ainda há estoque disponível
        if (ticket.cart.quantity < product.stock) {
          ticket.cart.quantity += 1;
        } else {
          // Não responder à interação diretamente, apenas atualizar a embed
          // Usar deferUpdate para reconhecer a interação sem enviar resposta
          await interaction.deferUpdate();
          return;
        }
      } else if (interaction.customId === 'decrease_quantity') {
        // Verificar se não está tentando diminuir abaixo de 1
        if (ticket.cart.quantity > 1) {
          ticket.cart.quantity -= 1;
        } else {
          // Não responder à interação diretamente, apenas atualizar a embed
          // Usar deferUpdate para reconhecer a interação sem enviar resposta
          await interaction.deferUpdate();
          return;
        }
      }

      // Calcular o valor total
      ticket.cart.totalPrice = product.price * ticket.cart.quantity;

      // Salvar as alterações
      await ticket.save();

      // Buscar a mensagem original do carrinho
      const message = await interaction.channel.messages.fetch(ticket.cart.messageId);
      if (!message) {
        return interaction.reply({
          content: '❌ Mensagem do carrinho não encontrada.',
          ephemeral: true
        });
      }

      // Obter o embed original
      const originalEmbed = message.embeds[0];
      if (!originalEmbed) {
        return interaction.reply({
          content: '❌ Embed do carrinho não encontrada.',
          ephemeral: true
        });
      }

      // Criar uma nova embed mantendo as informações originais
      const newEmbed = EmbedBuilder.from(originalEmbed);

      // Atualizar ou adicionar o campo de quantidade e valor
      const fieldsToKeep = originalEmbed.fields.filter(field => field.name !== 'Quantidade e Valor');
      newEmbed.setFields(
        ...fieldsToKeep,
        {
          name: 'Quantidade e Valor',
          value: `Quantidade: **${ticket.cart.quantity}**\nValor unitário: **R$ ${product.price.toFixed(2)}**\nValor total: **R$ ${ticket.cart.totalPrice.toFixed(2)}**`
        }
      );

      // Criar novos botões com estados de desabilitado conforme necessário
      const decreaseButton = new ButtonBuilder()
        .setCustomId('decrease_quantity')
        .setLabel('-1')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(ticket.cart.quantity <= 1); // Desabilitar se estiver no mínimo

      const increaseButton = new ButtonBuilder()
        .setCustomId('increase_quantity')
        .setLabel('+1')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(ticket.cart.quantity >= product.stock); // Desabilitar se estiver no máximo

      // Obter os outros botões da mensagem original
      const otherButtons = message.components[0].components.filter(
        component => component.customId !== 'increase_quantity' && component.customId !== 'decrease_quantity'
      );

      // Criar uma nova ActionRow com os botões atualizados
      const buttonsRow = new ActionRowBuilder()
        .addComponents(decreaseButton, increaseButton, ...otherButtons);

      // Editar a mensagem com o embed atualizado e os botões atualizados
      await message.edit({
        embeds: [newEmbed],
        components: [buttonsRow]
      });

      // Usar deferUpdate para reconhecer a interação sem enviar resposta
      await interaction.deferUpdate();

    } catch (error) {
      console.error('Erro ao atualizar quantidade:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao atualizar a quantidade.',
        ephemeral: true
      });
    }
  }
}; 