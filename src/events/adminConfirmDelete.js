const { Events, PermissionFlagsBits } = require('discord.js');
const Product = require('../models/Product');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || !['admin_confirm_delete', 'admin_cancel_delete'].includes(interaction.customId)) return;

    try {
      // Verificar se o usuário é administrador
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: '❌ Você não tem permissão para usar este comando.',
          ephemeral: true
        });
        return;
      }

      const userId = interaction.user.id;
      const selection = interaction.client.tempAdminDeleteSelections?.get(userId);

      // Verificar se a seleção ainda é válida (menos de 5 minutos)
      if (!selection || Date.now() - selection.timestamp > 300000) {
        await interaction.reply({
          content: '❌ A seleção expirou. Por favor, selecione os produtos novamente.',
          ephemeral: true
        });
        return;
      }

      if (interaction.customId === 'admin_cancel_delete') {
        await interaction.update({
          content: '❌ Deleção cancelada.',
          components: []
        });
        return;
      }

      // Deletar os produtos selecionados do banco de dados
      for (const productId of selection.productIds) {
        await Product.findOneAndDelete({ optionId: productId });
      }

      // Limpar a seleção temporária
      interaction.client.tempAdminDeleteSelections.delete(userId);

      await interaction.update({
        content: `✅ **${selection.productIds.length} produto(s) deletado(s) do banco de dados com sucesso!**`,
        components: []
      });
    } catch (error) {
      console.error('Erro ao processar confirmação de deleção:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar sua solicitação.',
        ephemeral: true
      });
    }
  }
}; 