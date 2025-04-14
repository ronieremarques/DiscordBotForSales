const { Events } = require('discord.js');
const Ticket = require('../models/Ticket');
const { createAdditionalProductsMenu } = require('./additionalProductSelector');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'increase_quantity' && interaction.customId !== 'decrease_quantity') return;

    try {
      // Buscar o ticket relacionado à thread atual usando método aprimorado
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

      if (!ticket || !ticket.cart || !ticket.cart.productId) {
        return interaction.reply({
          content: '❌ Informações do carrinho não encontradas.',
          ephemeral: true
        });
      }

      // Redirecionar para o novo formato de IDs para compatibilidade com o novo sistema
      if (interaction.customId === 'increase_quantity') {
        // Criar uma nova interação com o formato correto
        interaction.customId = `increase_${ticket.cart.productId}`;
      } else if (interaction.customId === 'decrease_quantity') {
        // Criar uma nova interação com o formato correto
        interaction.customId = `decrease_${ticket.cart.productId}`;
      }

      // O resto do processamento será feito pelo additionalProductEvents.js
      
    } catch (error) {
      console.error('Erro ao processar botão de quantidade:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao atualizar a quantidade.',
        ephemeral: true
      });
    }
  }
}; 