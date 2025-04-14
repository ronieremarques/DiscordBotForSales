const { Events } = require('discord.js');
const Ticket = require('../models/Ticket');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || interaction.customId !== 'pix_button') return;

    try {
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      const cartMessages = messages.filter(msg => 
        msg.content.includes('Mais produtos adicionais disponíveis')
      );
      const produtosMessages = messages.filter(msg => 
        msg.embeds[0]?.data?.type === 'rich' && 
        (msg.embeds[0]?.data?.title === '🛍️ Produto')
      );

      for (const [_, msg] of cartMessages) {
        await msg.delete().catch(err => console.error('Erro ao remover mensagem antiga:', err));
      }

      for (const [_, msg] of produtosMessages) {
        await msg.delete().catch(err => console.error('Erro ao remover mensagem antiga:', err));
      }
      // Buscar o ticket relacionado ao canal atual (thread ou canal normal)
      // 1. Primeiro buscar tickets por threadId (antigo comportamento)
      let ticket = await Ticket.findOne({ threadId: interaction.channel.id });
      
      // 2. Se não for encontrado e não for thread, pode ser um canal normal
      if (!ticket && !interaction.channel.isThread()) {
        ticket = await Ticket.findOne({ threadId: interaction.channel.id, categoryId: { $exists: true } });
      }

      if (!ticket || !ticket.embedSettings.pixKey) {
        return interaction.reply({
          content: '❌ Nenhuma chave PIX configurada para este ticket.',
          ephemeral: true
        });
      }

      await interaction.reply({
        content: `${ticket.embedSettings.pixKey}`
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