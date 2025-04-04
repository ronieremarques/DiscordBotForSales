const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../../models/Config');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurações do sistema (Apenas para o dono)'),

  async execute(interaction) {
    if (interaction.user.id !== config.ownerId) {
      return interaction.reply({
        content: '❌ Este comando é restrito ao dono do bot!',
        ephemeral: true
      });
    }

    const existingConfig = await Config.findOne({ guildId: interaction.guild.id });
    const voiceChannels = interaction.guild.channels.cache.filter(c => c.type === 2); // Tipo 2 = GUILD_VOICE

    // Verifica se o bot já está em um canal de voz
    const botVoiceChannel = interaction.guild.members.me?.voice?.channel;

    if (botVoiceChannel) {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔊 Status do Canal de Voz')
        .setDescription(`O bot já está conectado em um canal de voz`)
        .addFields(
          { name: 'Canal Atual', value: `${botVoiceChannel}`, inline: true },
          { name: 'Configuração Atual', value: existingConfig?.voiceChannel ? `<#${existingConfig.voiceChannel}>` : 'Não configurado', inline: true }
        );

      const disconnectButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('disconnect_voice')
          .setLabel('Desconectar')
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        embeds: [embed],
        components: [disconnectButton],
        ephemeral: true
      });
    }

    // Se não estiver em um canal, mostra o menu de seleção
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('⚙️ Configurações do Sistema')
      .setDescription('Selecione o que deseja configurar:')
      .addFields(
        { name: 'Canal de Vendas', value: existingConfig?.salesChannel ? `<#${existingConfig.salesChannel}>` : 'Não configurado', inline: true },
        { name: 'Canal de Voz', value: existingConfig?.voiceChannel ? `<#${existingConfig.voiceChannel}>` : 'Não configurado', inline: true },
        { name: 'Chave PIX', value: existingConfig?.pixKey ? `\`${existingConfig.pixKey}\`` : 'Não configurada', inline: true }
      );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('config_menu')
      .setPlaceholder('Selecione uma opção...')
      .addOptions(
        {
          label: 'Canal de Vendas',
          description: 'Definir canal onde as vendas serão registradas',
          value: 'sales_channel'
        },
        {
          label: 'Canal de Voz',
          description: 'Conectar o bot a um canal de voz',
          value: 'voice_channel'
        },
        {
          label: 'Chave PIX',
          description: 'Configurar a chave PIX para pagamentos',
          value: 'pix_key'
        }
      );

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(selectMenu)],
      ephemeral: true
    });
  }
};