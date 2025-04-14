const { 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  ActionRowBuilder,
  PermissionsBitField,
  EmbedBuilder 
} = require('discord.js');
const Channel = require('../models/Channel');
const { updateChannelTimer } = require('../utils/channelTimerManager');

/**
 * Gerencia o botão de definir data e hora de fechamento do canal
 */
async function handleChannelSetCloseButton(interaction) {
  // Verificar permissões de administrador
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({
      content: '❌ Apenas administradores podem definir a data de fechamento do canal.',
      ephemeral: true
    });
  }

  try {
    // Criar modal para preenchimento da data
    const modal = new ModalBuilder()
      .setCustomId('channel_set_close_modal')
      .setTitle('Definir Fechamento do Canal');

    // Input para a data de fechamento (formato: DD/MM/AAAA HH:MM)
    const dateInput = new TextInputBuilder()
      .setCustomId('close_date')
      .setLabel('Data e Hora (DD/MM/AAAA HH:MM)')
      .setPlaceholder('Ex: 31/12/2023 23:59')
      .setRequired(true)
      .setStyle(TextInputStyle.Short);

    const firstRow = new ActionRowBuilder().addComponents(dateInput);
    modal.addComponents(firstRow);

    // Exibir o modal
    await interaction.showModal(modal);
  } catch (error) {
    console.error('Erro ao exibir modal de fechamento de canal:', error);
    await interaction.reply({
      content: '❌ Ocorreu um erro ao processar sua solicitação.',
      ephemeral: true
    });
  }
}

/**
 * Processa o envio do modal de fechamento de canal
 */
async function handleChannelSetCloseModal(interaction) {
  try {
    // Verificar permissões de administrador
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Apenas administradores podem definir a data de fechamento do canal.',
        ephemeral: true
      });
    }

    // Obter dados do formulário
    const dateString = interaction.fields.getTextInputValue('close_date');
    console.log(`[ChannelModal] Data recebida: ${dateString}`);
    
    // Validar e converter a data
    const [datePart, timePart] = dateString.split(' ');
    
    if (!datePart || !timePart) {
      return interaction.reply({
        content: '❌ Formato de data inválido. Use o formato DD/MM/AAAA HH:MM.',
        ephemeral: true
      });
    }
    
    const [day, month, year] = datePart.split('/');
    const [hour, minute] = timePart.split(':');
    
    // Verificar se os campos são números
    if (!day || !month || !year || !hour || !minute ||
        isNaN(parseInt(day)) || isNaN(parseInt(month)) || isNaN(parseInt(year)) ||
        isNaN(parseInt(hour)) || isNaN(parseInt(minute))) {
      return interaction.reply({
        content: '❌ Formato de data inválido. Use o formato DD/MM/AAAA HH:MM com valores numéricos.',
        ephemeral: true
      });
    }
    
    // Criar objeto de data mantendo o horário exato especificado
    // Nota: não estamos mais ajustando para UTC
    const numericDay = parseInt(day);
    const numericMonth = parseInt(month) - 1; // Convert to 0-indexed
    const numericYear = parseInt(year);
    const numericHour = parseInt(hour);
    const numericMinute = parseInt(minute);
    
    console.log(`[ChannelModal] Valores parsedados: ano=${numericYear}, mês=${numericMonth}, dia=${numericDay}, hora=${numericHour}, minuto=${numericMinute}`);
    
    // Usar o construtor de Date sem ajuste de fuso horário
    const closeDate = new Date(numericYear, numericMonth, numericDay, numericHour, numericMinute);
    
    console.log(`[ChannelModal] Data criada sem ajuste UTC: ${closeDate.toISOString()} (${closeDate.getTime()})`);
    
    // Verificar se a data é válida
    if (isNaN(closeDate.getTime())) {
      return interaction.reply({
        content: '❌ Data inválida. Verifique os valores informados.',
        ephemeral: true
      });
    }
    
    // Verificar se a data está no futuro (comparando timestamps)
    const now = new Date();
    console.log(`[ChannelModal] Hora atual: ${now.toISOString()} (${now.getTime()})`);
    console.log(`[ChannelModal] Deve fechar no futuro? ${closeDate.getTime() > now.getTime()}`);
    
    if (closeDate.getTime() <= now.getTime()) {
      return interaction.reply({
        content: '❌ A data de fechamento deve ser no futuro.',
        ephemeral: true
      });
    }

    const channelId = interaction.channelId;
    const guildId = interaction.guildId;
    
    console.log(`[ChannelModal] Salvando configuração para canal ${channelId} com fechamento em ${closeDate.toISOString()}`);
    
    // Atualizar ou criar configuração de canal
    const savedConfig = await Channel.findOneAndUpdate(
      { channelId },
      { 
        guildId,
        channelId,
        scheduledClose: closeDate
      },
      { upsert: true, new: true }
    );
    
    console.log(`[ChannelModal] Configuração salva: ${JSON.stringify(savedConfig)}`);
    
    // Calcular timestamp para exibição formatada no Discord
    const timestamp = Math.floor(closeDate.getTime() / 1000);
    
    // Calcular tempo restante em minutos e segundos para exibição
    const timeToClose = closeDate.getTime() - now.getTime();
    const minutesToClose = Math.floor(timeToClose / 60000);
    const secondsToClose = Math.floor((timeToClose % 60000) / 1000);
    
    // Configurar temporizador para fechar o canal exatamente no horário programado
    await updateChannelTimer(interaction.client, channelId);
    console.log(`[ChannelModal] Temporizador configurado para canal ${channelId}`);

    // Responder ao usuário com o horário exato que foi configurado
    const embed = new EmbedBuilder()
      .setTitle('Fechamento de Canal Agendado')
      .setColor('#0099ff')
      .setDescription(`O canal <#${channelId}> será fechado automaticamente em <t:${timestamp}:F> (<t:${timestamp}:R>).`)
      .addFields(
        { name: 'Canal', value: `<#${channelId}>` },
        { name: 'ID do Canal', value: channelId },
        { name: 'Data e hora configurada', value: `${day}/${month}/${year} ${hour}:${minute}` },
        { name: 'Tempo restante', value: `${minutesToClose} minutos e ${secondsToClose} segundos` },
        { name: 'Temporizador', value: '✅ Ativo (o canal será fechado exatamente no horário configurado)' }
      )
      .setFooter({ text: 'Quando o horário chegar, as permissões de envio de mensagens serão removidas do cargo @everyone.' });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

  } catch (error) {
    console.error('Erro ao processar modal de fechamento de canal:', error);
    await interaction.reply({
      content: `❌ Ocorreu um erro ao processar sua solicitação.\n\`\`\`${error.message}\`\`\``,
      ephemeral: true
    });
  }
}

// Exportar todos os handlers de componentes
module.exports = {
  handleChannelSetCloseButton,
  handleChannelSetCloseModal
}; 