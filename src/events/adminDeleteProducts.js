const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Product = require('../models/Product');
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
    if (!['admin_delete_products', 'admin_delete_more', 'admin_delete_reset'].includes(interaction.customId)) return;

    try {
      // Verificar se o usuário é administrador
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: '❌ Você não tem permissão para usar este comando.',
          ephemeral: true
        });
        return;
      }

      if (interaction.isStringSelectMenu()) {
        const selectedProductIds = interaction.values;

        // Criar botões de confirmação
        const confirmButton = new ButtonBuilder()
          .setCustomId('admin_confirm_delete')
          .setLabel('Confirmar Deleção')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('✅');

        const cancelButton = new ButtonBuilder()
          .setCustomId('admin_cancel_delete')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌');

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        // Armazenar os IDs selecionados temporariamente
        interaction.client.tempAdminDeleteSelections = interaction.client.tempAdminDeleteSelections || new Map();
        interaction.client.tempAdminDeleteSelections.set(interaction.user.id, {
          productIds: selectedProductIds,
          timestamp: Date.now()
        });

        await interaction.reply({
          content: `⚠️ **Você está prestes a deletar ${selectedProductIds.length} produto(s) do banco de dados.**\n-# Esta ação não pode ser desfeita. Confirme para continuar.`,
          components: [row],
          ephemeral: true
        });
      } else if (interaction.isButton()) {
        const products = await Product.find({});
        const PRODUCTS_PER_PAGE = 25;
        const totalPages = Math.ceil(products.length / PRODUCTS_PER_PAGE);
        
        let currentPage = 0;
        if (interaction.customId === 'admin_delete_more') {
          // Extrair a página atual da mensagem
          const currentPageMatch = interaction.message.components[0].components[0].placeholder.match(/Página (\d+)/);
          currentPage = parseInt(currentPageMatch[1]) - 1;
          currentPage++;
        }

        const startIndex = currentPage * PRODUCTS_PER_PAGE;
        const endIndex = startIndex + PRODUCTS_PER_PAGE;
        const currentProducts = products.slice(startIndex, endIndex);

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

        await interaction.update({
          content: '🗑️ **Selecione os produtos que deseja deletar do banco de dados:**\n-# Você pode selecionar múltiplos produtos para deletar de uma vez.',
          components: components
        });
      }
    } catch (error) {
      console.error('Erro ao processar seleção de produtos para deletar:', error);
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