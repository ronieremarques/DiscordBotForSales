const { Events, ButtonBuilder, ActionRowBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const Product = require('../models/Product');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Verificar se é um botão relacionado a notificação de estoque
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('notify_stock_') && !interaction.customId.startsWith('cancel_notify_')) return;

    // Tratar notificação de estoque
    if (interaction.customId.startsWith('notify_stock_')) {
      const productId = interaction.customId.replace('notify_stock_', '');
      
      try {
        // Buscar o produto
        const product = await Product.findOne({ optionId: productId });
        
        if (!product) {
          return interaction.reply({
            content: '❌ Produto não encontrado.',
            ephemeral: true
          });
        }
        
        // Verificar se o usuário já está na lista de notificações
        if (product.stockNotifications && product.stockNotifications.includes(interaction.user.id)) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#242429')
                .setTitle(':warning: Notificação de estoque :warning:')
                .setDescription('Você já está na lista de notificações para este produto.')
            ],
            ephemeral: true
          });
        }
        
        // Verificar se as DMs do usuário estão abertas
        try {
          // Tentar enviar uma mensagem privada para verificar se as DMs estão abertas
          await interaction.user.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#242429')
                .setTitle('Notificação de estoque')
                .setDescription(`Você será notificado quando o produto **${product.label}** estiver disponível em estoque.`)
            ],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`cancel_notify_${productId}`)
                  .setLabel('Cancelar notificação')
                  .setStyle(ButtonStyle.Secondary)
              )
            ]
          });
          
          // Se chegou aqui, as DMs estão abertas
          // Adicionar o usuário à lista de notificações
          if (!product.stockNotifications) {
            product.stockNotifications = [];
          }
          
          product.stockNotifications.push(interaction.user.id);
          await product.save();
          
          await interaction.reply({
            content: `✅ Você será notificado quando o produto **${product.label}** estiver disponível em estoque. Uma mensagem foi enviada no seu privado.`,
            ephemeral: true
          });
          
        } catch (error) {
          // Se ocorrer um erro, provavelmente as DMs estão fechadas
          await interaction.reply({
            content: '❌ Não foi possível enviar uma mensagem privada. Por favor, verifique se suas DMs estão abertas e tente novamente.',
            ephemeral: true
          });
        }
      } catch (error) {
        console.error('Erro ao configurar notificação de estoque:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao configurar a notificação de estoque.',
          ephemeral: true
        });
      }
    }
    
    // Tratar cancelamento de notificação
    if (interaction.customId.startsWith('cancel_notify_')) {
      const productId = interaction.customId.replace('cancel_notify_', '');
      
      try {
        // Buscar o produto
        const product = await Product.findOne({ optionId: productId });
        
        if (!product) {
          return interaction.reply({
            content: '❌ Produto não encontrado.',
            ephemeral: true
          });
        }
        
        // Verificar se o usuário está na lista de notificações
        if (!product.stockNotifications || !product.stockNotifications.includes(interaction.user.id)) {
          return interaction.reply({
            content: '❌ Você não está na lista de notificações para este produto.',
            ephemeral: true
          });
        }
        
        // Remover o usuário da lista de notificações
        product.stockNotifications = product.stockNotifications.filter(id => id !== interaction.user.id);
        await product.save();
        
        await interaction.reply({
          content: `✅ Você não receberá mais notificações para o produto **${product.label}**.`,
          ephemeral: true
        });
        
      } catch (error) {
        console.error('Erro ao cancelar notificação de estoque:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao cancelar a notificação de estoque.',
          ephemeral: true
        });
      }
    }
  }
}; 