const { Events } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || interaction.customId !== 'pix_button') return;

    const embed = interaction.message.embeds[0];
    const pixField = embed.fields?.find(field => field.name === 'Chave PIX');

    if (!pixField) {
      return interaction.reply({
        content: '❌ Nenhuma chave PIX configurada para este ticket.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: `💳 **Chave PIX:** \`${pixField.value}\``,
      ephemeral: true
    });
  }
};