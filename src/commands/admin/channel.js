const { 
  SlashCommandBuilder, 
  PermissionsBitField, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const Channel = require('../../models/Channel');
const { getActiveTimers } = require('../../utils/channelTimerManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Gerencia configurações do canal atual')
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Mostra informações sobre o canal atual')),

  async execute(interaction) {
    // Verificar se o usuário é administrador
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Apenas administradores podem usar este comando.',
        ephemeral: true
      });
    }

    const channelId = interaction.channelId;
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    try {
      // Buscar configuração do canal
      let channelConfig = await Channel.findOne({ channelId });
      
      // Executar o subcomando apropriado
      if (subcommand === 'info') {
        const embed = new EmbedBuilder()
          .setTitle('Informações do Canal')
          .setColor('#0099ff')
          .addFields(
            { name: 'Canal', value: `<#${channelId}>` },
            { name: 'ID do Canal', value: channelId }
          );

        if (channelConfig && channelConfig.scheduledClose) {
          // Converter para timestamp Unix para melhor visualização
          const timestamp = Math.floor(channelConfig.scheduledClose.getTime() / 1000);
          
          // Verificar se existe um temporizador ativo para este canal
          const activeTimers = getActiveTimers();
          const hasActiveTimer = activeTimers.includes(channelId);
          
          // Formatar data para exibição amigável
          const date = channelConfig.scheduledClose;
          const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          
          // Calcular tempo restante
          const now = new Date();
          const diffMs = channelConfig.scheduledClose.getTime() - now.getTime();
          const diffMins = Math.round(diffMs / 60000);
          
          embed.addFields(
            { name: 'Fechamento Agendado', value: `<t:${timestamp}:F> (<t:${timestamp}:R>)` },
            { name: 'Data Formatada', value: formattedDate },
            { name: 'Tempo Restante', value: `${diffMins} minutos (${Math.floor(diffMs / 1000)} segundos)` },
            { name: 'Temporizador Ativo', value: hasActiveTimer ? '✅ SIM' : '❌ NÃO' }
          );
        } else {
          embed.addFields(
            { name: 'Fechamento Agendado', value: 'Nenhum agendamento configurado' }
          );
        }

        // Botão para definir data de fechamento
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('channel_set_close')
              .setLabel('Definir Data e Hora de Fechamento')
              .setStyle(ButtonStyle.Primary)
          );

        return interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Erro ao gerenciar canal:', error);
      
      return interaction.reply({
        content: '❌ Ocorreu um erro ao executar o comando.\n```' + error.message + '```',
        ephemeral: true
      });
    }
  },
}; 