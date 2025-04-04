const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const Config = require('../../models/Config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('connect')
    .setDescription('Conecta o bot a um canal de voz')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Canal de voz para conectar')
        .addChannelTypes(ChannelType.GuildVoice) // Mostra apenas canais de voz
        .setRequired(true)),

  async execute(interaction) {
    try {
      const channel = interaction.options.getChannel('channel');

      // Verifica se o bot já está conectado em algum canal
      const existingConnection = getVoiceConnection(interaction.guild.id);
      if (existingConnection) {
        existingConnection.destroy();
      }

      // Conecta ao canal de voz
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true
      });

      // Atualiza o canal de voz no banco de dados
      await Config.findOneAndUpdate(
        { guildId: interaction.guild.id },
        { voiceChannel: channel.id },
        { upsert: true }
      );

      await interaction.reply({
        content: `✅ Conectado ao canal de voz: ${channel.name}`,
        ephemeral: true
      });

    } catch (error) {
      console.error('Erro ao conectar:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao tentar conectar ao canal de voz.',
        ephemeral: true
      });
    }
  },
};