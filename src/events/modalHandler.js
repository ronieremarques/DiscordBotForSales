const { Events } = require('discord.js');
const { handleChannelSetCloseModal } = require('../components/ChannelComponents');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isModalSubmit()) return;

    try {
      // Manipular modal de definição de data de fechamento do canal
      if (interaction.customId === 'channel_set_close_modal') {
        await handleChannelSetCloseModal(interaction);
        return;
      }

      // Adicione manipuladores para outros modais aqui, conforme necessário
    } catch (error) {
      console.error(`Erro ao processar modal ${interaction.customId}:`, error);
      
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