const { Events } = require('discord.js');
const Ticket = require('../models/Ticket');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || interaction.customId !== 'close_ticket') return;

    const channel = interaction.channel;
    
    try {
      // Buscar ticket no banco de dados
      const ticket = await Ticket.findOne({ threadId: channel.id });
      
      if (ticket) {
        // Atualizar status no banco de dados antes de excluir o canal
        ticket.status = 'closed';
        await ticket.save();
      }
      
      // Verificar o tipo de canal
      if (channel.isThread()) {
        // Para threads, usar o método delete
        await channel.delete('Ticket fechado pelo usuário.');
      } else {
        // Para canais normais, verificar permissões e então excluir
        if (channel.deletable) {
          await channel.delete('Ticket fechado pelo usuário.');
        } else {
          await interaction.reply({
            content: '❌ Não tenho permissão para excluir este canal.',
            ephemeral: true
          });
          return;
        }
      }
      
      // Se chegou aqui, não precisa de reply porque o canal foi excluído
    } catch (error) {
      console.error('Erro ao excluir ticket:', error);
      
      // Tentar enviar resposta se o erro não for relacionado ao canal já estar excluído
      try {
        await interaction.reply({
          content: '❌ Ocorreu um erro ao tentar fechar o ticket.',
          ephemeral: true
        });
      } catch (replyError) {
        console.error('Erro ao enviar resposta:', replyError);
      }
    }
  }
};