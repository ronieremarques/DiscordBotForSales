const { forceCloseChannel } = require('./channelCloser');
const Channel = require('../models/Channel');

// Armazenar os temporizadores ativos
const activeTimers = new Map();

/**
 * Agenda um temporizador para fechar um canal no horário exato
 * @param {Object} client - Cliente Discord
 * @param {Object} channelConfig - Configuração do canal
 */
async function scheduleChannelClose(client, channelConfig) {
  const { channelId, scheduledClose } = channelConfig;
  
  // Verificar se já existe um temporizador para este canal
  if (activeTimers.has(channelId)) {
    clearTimeout(activeTimers.get(channelId));
    activeTimers.delete(channelId);
  }
  
  if (!scheduledClose) return;
  
  // Calcular o tempo até o fechamento em milissegundos
  const now = new Date();
  const closeTime = scheduledClose.getTime();
  const timeToClose = closeTime - now.getTime();
  
  // Se já passou do horário, fechar imediatamente
  if (timeToClose <= 0) {
    console.log(`[ChannelTimer] Horário de fechamento já passou para o canal ${channelId}. Fechando imediatamente.`);
    try {
      await forceCloseChannel(client, channelConfig);
    } catch (error) {
      console.error(`[ChannelTimer] Erro ao fechar canal ${channelId}:`, error);
    }
    return;
  }
  
  // Se o horário é no futuro, programar um temporizador preciso
  console.log(`[ChannelTimer] Agendando fechamento do canal ${channelId} para ${scheduledClose.toISOString()}`);
  console.log(`[ChannelTimer] Tempo restante: ${Math.floor(timeToClose / 1000)} segundos (${Math.floor(timeToClose / 60000)} minutos)`);
  
  // Criar o temporizador
  const timerId = setTimeout(async () => {
    console.log(`[ChannelTimer] EXECUTANDO FECHAMENTO AGENDADO para canal ${channelId}`);
    try {
      // Verificar se o canal ainda existe e deve ser fechado
      const updatedConfig = await Channel.findOne({ channelId });
      if (!updatedConfig) {
        console.log(`[ChannelTimer] Canal ${channelId} não existe mais na base de dados`);
        return;
      }
      
      // Fechar o canal
      await forceCloseChannel(client, updatedConfig);
      console.log(`[ChannelTimer] Canal ${channelId} fechado com sucesso pelo temporizador exato`);
    } catch (error) {
      console.error(`[ChannelTimer] Erro no fechamento programado do canal ${channelId}:`, error);
    } finally {
      // Remover da lista de temporizadores ativos
      activeTimers.delete(channelId);
    }
  }, timeToClose);
  
  // Armazenar o ID do temporizador
  activeTimers.set(channelId, timerId);
}

/**
 * Configura todos os temporizadores com base nos canais agendados
 * @param {Object} client - Cliente Discord
 */
async function setupAllChannelTimers(client) {
  try {
    // Limpar todos os temporizadores existentes
    for (const timerId of activeTimers.values()) {
      clearTimeout(timerId);
    }
    activeTimers.clear();
    
    // Buscar todos os canais agendados
    const channels = await Channel.find({});
    console.log(`[ChannelTimer] Configurando temporizadores para ${channels.length} canais`);
    
    // Configurar um temporizador para cada canal
    for (const channel of channels) {
      await scheduleChannelClose(client, channel);
    }
    
    console.log(`[ChannelTimer] ${activeTimers.size} temporizadores configurados com sucesso`);
  } catch (error) {
    console.error('[ChannelTimer] Erro ao configurar temporizadores:', error);
  }
}

/**
 * Adiciona ou atualiza um temporizador para um canal específico
 * @param {Object} client - Cliente Discord
 * @param {string} channelId - ID do canal
 */
async function updateChannelTimer(client, channelId) {
  try {
    const channelConfig = await Channel.findOne({ channelId });
    if (channelConfig) {
      await scheduleChannelClose(client, channelConfig);
    } else if (activeTimers.has(channelId)) {
      // Se o canal não existe mais na base de dados mas tem um temporizador ativo
      clearTimeout(activeTimers.get(channelId));
      activeTimers.delete(channelId);
    }
  } catch (error) {
    console.error(`[ChannelTimer] Erro ao atualizar temporizador para canal ${channelId}:`, error);
  }
}

/**
 * Remove um temporizador para um canal específico
 * @param {string} channelId - ID do canal
 */
function removeChannelTimer(channelId) {
  if (activeTimers.has(channelId)) {
    clearTimeout(activeTimers.get(channelId));
    activeTimers.delete(channelId);
    console.log(`[ChannelTimer] Temporizador removido para canal ${channelId}`);
  }
}

/**
 * Obtém a lista de temporizadores ativos
 * @returns {Array} Lista de canais com temporizadores ativos
 */
function getActiveTimers() {
  return Array.from(activeTimers.keys());
}

module.exports = {
  scheduleChannelClose,
  setupAllChannelTimers,
  updateChannelTimer,
  removeChannelTimer,
  getActiveTimers
}; 