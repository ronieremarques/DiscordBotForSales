const { Events } = require('discord.js');
const { CartManager } = require('../utils/cartManager');
const Ticket = require('../models/Ticket');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || !['confirm_delete', 'cancel_delete'].includes(interaction.customId)) return;

    try {
      const userId = interaction.user.id;
      const selection = interaction.client.tempDeleteSelections?.get(userId);

      // Verificar se a seleção ainda é válida (menos de 5 minutos)
      if (!selection || Date.now() - selection.timestamp > 300000) {
        await interaction.reply({
          content: '❌ A seleção expirou. Por favor, selecione os produtos novamente.',
          ephemeral: true
        });
        return;
      }

      if (interaction.customId === 'cancel_delete') {
        await interaction.update({
          content: '❌ Deleção cancelada.',
          components: []
        });
        return;
      }

      // Verificar se estamos em um canal de ticket usando método aprimorado
      // 1. Primeiro buscar tickets por threadId (comportamento original)
      let ticket = await Ticket.findOne({ 
        threadId: interaction.channel.id,
        status: { $ne: 'closed' }
      });
      
      // 2. Se não for encontrado e não for thread, pode ser um canal normal
      if (!ticket && !interaction.channel.isThread()) {
        ticket = await Ticket.findOne({ 
          threadId: interaction.channel.id, 
          categoryId: { $exists: true },
          status: { $ne: 'closed' }
        });
      }
      
      // 3. Tentar encontrar pelo ID do canal como último recurso
      if (!ticket) {
        ticket = await Ticket.findOne({
          channelId: interaction.channel.id,
          status: { $ne: 'closed' }
        });
      }

      if (!ticket) {
        await interaction.reply({
          content: '❌ Este comando só pode ser usado em canais de ticket.',
          ephemeral: true
        });
        return;
      }

      // Deletar os produtos selecionados
      for (const productId of selection.productIds) {
        await CartManager.removeItem(userId, productId);
      }

      // Limpar a seleção temporária
      interaction.client.tempDeleteSelections.delete(userId);

      await interaction.update({
        content: `✅ **${selection.productIds.length} produto(s) deletado(s) com sucesso!**\n-# Seu carrinho foi atualizado.`,
        components: []
      });

      // Atualizar a mensagem do carrinho
      const cart = await CartManager.getCart(userId);
      if (cart.items.length === 0) {
        // Se o carrinho estiver vazio, atualizar o ticket
        ticket.cart = null;
        await ticket.save();
      }
    } catch (error) {
      console.error('Erro ao processar confirmação de deleção:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar sua solicitação.',
        ephemeral: true
      });
    }
  }
}; 