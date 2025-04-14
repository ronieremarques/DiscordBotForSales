const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Product = require('../../models/Product');
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deletarproduto')
    .setDescription('Deleta produtos do banco de dados (Apenas administradores)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    try {
      // Verificar se o usuário é administrador
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: '❌ Você não tem permissão para usar este comando.',
          ephemeral: true
        });
        return;
      }

      // Buscar todos os produtos
      const products = await Product.find({});
      
      if (!products || products.length === 0) {
        await interaction.reply({
          content: '❌ Não há produtos cadastrados no banco de dados.',
          ephemeral: true
        });
        return;
      }

      const PRODUCTS_PER_PAGE = 25;
      const totalPages = Math.ceil(products.length / PRODUCTS_PER_PAGE);
      const currentPage = 0;
      const startIndex = currentPage * PRODUCTS_PER_PAGE;
      const endIndex = startIndex + PRODUCTS_PER_PAGE;
      const currentProducts = products.slice(startIndex, endIndex);

      // Criar menu de seleção com os produtos
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('admin_delete_products')
        .setPlaceholder(`Selecione os produtos para deletar (Página ${currentPage + 1}/${totalPages})`)
        .setMinValues(1)
        .setMaxValues(currentProducts.length);

      currentProducts.forEach(product => {
        selectMenu.addOptions({
          label: product.label || 'Produto',
          description: `R$ ${product.price.toFixed(2)} - ${product.description?.substring(0, 50) || 'Sem descrição'}`,
          value: product.optionId,
          emoji: '🗑️'
        });
      });

      const menuRow = new ActionRowBuilder().addComponents(selectMenu);
      const navigationRow = createNavigationButtons(currentPage, totalPages);
      
      const components = [];
      if (selectMenu.options?.length > 0) {
        components.push(menuRow);
      }
      
      if (navigationRow.components.length > 0) {
        components.push(navigationRow);
      }

      await interaction.reply({
        content: '🗑️ **Selecione os produtos que deseja deletar do banco de dados:**\n-# Você pode selecionar múltiplos produtos para deletar de uma vez.',
        components: components,
        ephemeral: true
      });
    } catch (error) {
      console.error('Erro ao executar comando deletarproduto:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar sua solicitação.',
        ephemeral: true
      });
    }
  }
};

// Função auxiliar para criar botões de navegação
function createNavigationButtons(currentPage, totalPages) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder();

  // Botão para voltar ao início
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('admin_delete_reset')
      .setLabel('↩️ Voltar ao Início')
      .setStyle(ButtonStyle.Secondary)
  );

  // Botão para carregar mais produtos
  if (currentPage < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('admin_delete_more')
        .setLabel('⏩ Carregar Mais')
        .setStyle(ButtonStyle.Primary)
    );
  }

  return row;
} 