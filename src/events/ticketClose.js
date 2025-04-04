const { Events } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || interaction.customId !== 'close_ticket') return;

    const thread = interaction.channel;

    // Verificar se o canal é uma thread
    if (!thread.isThread()) {
      return interaction.reply({
        content: '❌ Este comando só pode ser usado dentro de um ticket.',
        ephemeral: true
      });
    }

    // Excluir a thread
    try {
      await thread.delete('Ticket fechado pelo usuário.');
    } catch (error) {
      console.error('Erro ao excluir a thread:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao tentar fechar o ticket.',
        ephemeral: true
      });
    }
  }
};