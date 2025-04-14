const { Events } = require('discord.js');
const { handleChannelSetCloseButton } = require('../components/ChannelComponents');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    try {
      // Manipular botão de definir data de fechamento do canal
      if (interaction.customId === 'channel_set_close') {
        await handleChannelSetCloseButton(interaction);
        return;
      }

      // Adicione manipuladores para outros botões aqui, conforme necessário
    } catch (error) {
      console.error(`Erro ao processar botão ${interaction.customId}:`, error);
      
      // Verificar se a interação já foi respondida
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ Ocorreu um erro ao processar sua solicitação.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar sua solicitação.',
          ephemeral: true
        });
      }
    }
  },
}; 