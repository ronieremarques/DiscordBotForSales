const { Events } = require('discord.js');
const Channel = require('../models/Channel');
const { removeChannelTimer } = require('../utils/channelTimerManager');

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    try {
      const channelId = channel.id;
      
      // Verificar se o canal tinha um agendamento
      const channelConfig = await Channel.findOne({ channelId });
      
      if (channelConfig) {
        console.log(`[ChannelEvents] Canal ${channelId} foi excluído. Removendo agendamento.`);
        
        // Remover da base de dados
        await Channel.findOneAndDelete({ channelId });
        
        // Remover temporizador
        removeChannelTimer(channelId);
        
        console.log(`[ChannelEvents] Agendamento removido para o canal ${channelId}`);
      }
    } catch (error) {
      console.error('[ChannelEvents] Erro ao processar exclusão de canal:', error);
    }
  }
}; 