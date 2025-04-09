const { Events } = require('discord.js');
const Ticket = require('../models/Ticket');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || interaction.customId !== 'pix_button') return;

    try {
      // Buscar o ticket relacionado à thread atual
      const ticket = await Ticket.findOne({ threadId: interaction.channel.id });

      if (!ticket || !ticket.embedSettings.pixKey) {
        return interaction.reply({
          content: '❌ Nenhuma chave PIX configurada para este ticket.',
          ephemeral: true
        });
      }

      await interaction.reply({
        content: `${ticket.embedSettings.pixKey}`,
        ephemeral: true
      });
      
    } catch (error) {
      console.error('Erro ao buscar chave PIX:', error);
      await interaction.reply({
        content: '❌ Erro ao buscar a chave PIX.',
        ephemeral: true
      });
    }
  }
};