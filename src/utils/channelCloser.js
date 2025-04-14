const { PermissionsBitField, ChannelType } = require('discord.js');
const Channel = require('../models/Channel');

/**
 * Verifica canais agendados para fechamento e remove permissões de everyone
 * @param {Object} client - Instância do cliente Discord.js
 */
async function checkScheduledChannels(client) {
  try {
    // Obter data atual
    const now = new Date();
    console.log(`[ChannelCloser] Verificando canais agendados em ${now.toISOString()} (${now.getTime()})`);
    
    // Buscar todos os canais agendados para diagnóstico
    const allChannels = await Channel.find({});
    console.log(`[ChannelCloser] Total de canais agendados: ${allChannels.length}`);
    
    if (allChannels.length === 0) {
      return; // Não há canais agendados, sair imediatamente
    }
    
    // Mostrar detalhes de cada canal para diagnóstico
    for (const channel of allChannels) {
      if (channel.scheduledClose) {
        // Verificar hora de fechamento usando timestamps (mais preciso)
        const channelTimestamp = channel.scheduledClose.getTime();
        const nowTimestamp = now.getTime();
        const diffMinutes = Math.round((channelTimestamp - nowTimestamp) / 60000);
        const shouldClose = channelTimestamp <= nowTimestamp;
        
        console.log(`[ChannelCloser] Canal: ${channel.channelId}, Data: ${channel.scheduledClose.toISOString()}`);
        console.log(`[ChannelCloser] Timestamp canal: ${channelTimestamp}, Timestamp atual: ${nowTimestamp}`);
        console.log(`[ChannelCloser] Diferença: ${diffMinutes} minutos, Deve fechar: ${shouldClose}`);
        
        // Se está no horário ou já passou, fechar imediatamente
        if (diffMinutes <= 0) {
          console.log(`[ChannelCloser] URGENTE: Canal ${channel.channelId} deve ser fechado AGORA! Diferença: ${diffMinutes} minutos`);
          await forceCloseChannel(client, channel);
        }
      } else {
        console.log(`[ChannelCloser] Canal: ${channel.channelId} sem data de fechamento definida`);
      }
    }
    
    // Buscar novamente para garantir que nenhum canal foi perdido após processamento
    const channelsToProcess = await Channel.find({});
    
    // Verificar novamente se há canais para fechar
    for (const channel of channelsToProcess) {
      if (channel.scheduledClose && channel.scheduledClose.getTime() <= now.getTime()) {
        console.log(`[ChannelCloser] Canal encontrado para fechamento na segunda verificação: ${channel.channelId}`);
        await forceCloseChannel(client, channel);
      }
    }
  } catch (error) {
    console.error('[ChannelCloser] Erro ao verificar canais agendados:', error);
  }
}

/**
 * Força o fechamento de um canal específico
 * @param {Object} client - Instância do cliente Discord.js
 * @param {Object} channelConfig - Configuração do canal
 */
async function forceCloseChannel(client, channelConfig) {
  const { guildId, channelId } = channelConfig;
  
  console.log(`[ChannelCloser] Forçando fechamento do canal ${channelId}`);
  
  try {
    // Obter referências ao servidor e canal
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.log(`[ChannelCloser] Servidor não encontrado: ${guildId}`);
      await Channel.findOneAndDelete({ channelId });
      return;
    }
    
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      console.log(`[ChannelCloser] Canal não encontrado: ${channelId}`);
      await Channel.findOneAndDelete({ channelId });
      return;
    }
    
    console.log(`[ChannelCloser] Canal encontrado: ${channel.name} (${channel.type})`);
    
    try {
      // Remover permissões de @everyone - agora remove a permissão de visualizar
      const everyoneRole = guild.roles.everyone;
      
      console.log(`[ChannelCloser] Modificando permissões do everyone para o canal ${channel.name}`);
      
      await channel.permissionOverwrites.edit(everyoneRole, {
        ViewChannel: false
      });
      
      // Formatar data para exibição amigável
      let formattedDate = 'agendado';
      if (channelConfig.scheduledClose) {
        const date = channelConfig.scheduledClose;
        formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      }
      
      // Anunciar no canal que ele foi fechado (só vai ser visível para quem tem permissão)
      await channel.send({
        content: `🔒 **Canal Fechado Automaticamente**\n\nEste canal foi fechado conforme agendamento. Somente usuários com permissões específicas podem ver este canal agora.\nHorário configurado: ${formattedDate}`
      });
      
      console.log(`[ChannelCloser] Canal fechado: ${channel.name} (${channelId})`);
      
      // Remover da base de dados após processamento
      await Channel.findOneAndDelete({ channelId });
      console.log(`[ChannelCloser] Configuração removida para o canal ${channelId}`);
      
    } catch (innerError) {
      console.error(`[ChannelCloser] Erro ao modificar permissões do canal ${channelId}:`, innerError);
    }
  } catch (error) {
    console.error(`[ChannelCloser] Erro ao fechar canal ${channelId}:`, error);
  }
}

/**
 * Inicia o verificador de canais agendados
 * @param {Object} client - Instância do cliente Discord.js
 * @param {number} interval - Intervalo em millisegundos para verificação (padrão: 1 minuto)
 */
function startChannelCloser(client, interval = 60000) {
  console.log(`[ChannelCloser] Iniciando verificador de canais com intervalo de ${interval}ms`);
  
  // Verificar imediatamente
  checkScheduledChannels(client).catch(err => 
    console.error('[ChannelCloser] Erro na verificação imediata:', err)
  );
  
  // Configurar verificação periódica
  const intervalId = setInterval(() => {
    console.log('[ChannelCloser] Executando verificação periódica');
    checkScheduledChannels(client).catch(err => 
      console.error('[ChannelCloser] Erro na verificação periódica:', err)
    );
  }, interval);
  
  return intervalId;
}

// Função para fechar um canal específico manualmente
async function closeChannel(client, channelId) {
  try {
    const channelConfig = await Channel.findOne({ channelId });
    
    if (!channelConfig) {
      return { success: false, message: 'Canal não encontrado na base de dados' };
    }
    
    await forceCloseChannel(client, channelConfig);
    return { success: true, message: 'Canal fechado com sucesso' };
    
  } catch (error) {
    console.error(`[ChannelCloser] Erro ao fechar canal ${channelId}:`, error);
    return { success: false, message: `Erro: ${error.message}` };
  }
}

module.exports = {
  startChannelCloser,
  checkScheduledChannels,
  closeChannel,
  forceCloseChannel
}; 