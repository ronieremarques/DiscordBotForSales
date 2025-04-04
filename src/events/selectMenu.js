const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, Events } = require('discord.js');
const Config = require('../models/Config');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
    
    try {
      if (interaction.customId === 'config_menu') {
        await interaction.deferUpdate();
        await handleConfigMenu(interaction);
      }
      else if (interaction.customId === 'voice_channel_select') {
        await interaction.deferUpdate();
        await handleVoiceChannelSelect(interaction);
      }
      else if (interaction.customId === 'sales_channel_select') {
        await interaction.deferUpdate();
        await handleSalesChannelSelect(interaction);
      }
      else if (interaction.customId === 'disconnect_voice') {
        await interaction.deferUpdate();
        await handleDisconnect(interaction);
      }
    } catch (error) {
      console.error('Erro no handler:', error);
      await handleError(interaction, error);
    }
  }
};

async function handleConfigMenu(interaction) {
  const selectedOption = interaction.values[0];
  const guildId = interaction.guild.id;

  if (selectedOption === 'pix_key') {
    await interaction.followUp({
      content: 'Por favor, envie a chave PIX que deseja configurar.',
      ephemeral: true
    });

    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async m => {
      const pixKey = m.content;

      try {
        await Config.findOneAndUpdate(
          { guildId },
          { pixKey },
          { upsert: true, new: true }
        );

        await interaction.followUp({
          content: `✅ Chave PIX configurada com sucesso: \`${pixKey}\``,
          ephemeral: true
        });
      } catch (error) {
        console.error('Erro ao salvar a chave PIX:', error);
        await interaction.followUp({
          content: '❌ Ocorreu um erro ao salvar a chave PIX.',
          ephemeral: true
        });
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.followUp({
          content: '❌ Tempo esgotado. Por favor, tente novamente.',
          ephemeral: true
        });
      }
    });
  }

  // Outras opções de configuração (sales_channel, voice_channel) permanecem inalteradas...
  const existingConfig = await Config.findOne({ guildId: interaction.guild.id });

  if (selectedOption === 'voice_channel') {
    const botVoiceChannel = interaction.guild.members.me?.voice?.channel;
    
    if (botVoiceChannel) {
      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('🔊 Status do Canal de Voz')
        .setDescription(`O bot já está conectado em um canal de voz`)
        .addFields(
          { name: 'Canal Atual', value: `${botVoiceChannel}`, inline: true },
          { name: 'Configuração', value: existingConfig?.voiceChannel ? `<#${existingConfig.voiceChannel}>` : 'Não configurado', inline: true }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('disconnect_voice')
          .setLabel('Desconectar')
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.editReply({
        embeds: [embed],
        components: [row]
      });
    }

    const voiceChannels = interaction.guild.channels.cache
      .filter(c => c.type === ChannelType.GuildVoice && c.joinable)
      .sort((a, b) => a.position - b.position);

    if (voiceChannels.size === 0) {
      return interaction.editReply({
        content: '❌ Nenhum canal de voz disponível ou acessível.',
        embeds: [],
        components: []
      });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('voice_channel_select')
      .setPlaceholder('Selecione um canal de voz')
      .addOptions(
        voiceChannels.map(channel => ({
          label: channel.name,
          value: channel.id,
          description: `Membros: ${channel.members.size}`
        }))
      );

    await interaction.editReply({
      content: 'Selecione o canal de voz para conectar o bot:',
      components: [new ActionRowBuilder().addComponents(selectMenu)]
    });
  }
  else if (selectedOption === 'sales_channel') {
    const textChannels = interaction.guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText)
      .sort((a, b) => a.position - b.position);

    if (textChannels.size === 0) {
      return interaction.editReply({
        content: '❌ Nenhum canal de texto disponível.',
        embeds: [],
        components: []
      });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('sales_channel_select')
      .setPlaceholder('Selecione um canal de vendas')
      .addOptions(
        textChannels.map(channel => ({
          label: channel.name,
          value: channel.id,
          description: `Posição: ${channel.position}`
        }))
      );

    await interaction.editReply({
      content: 'Selecione o canal para registrar vendas:',
      components: [new ActionRowBuilder().addComponents(selectMenu)]
    });
  }
}

async function handleVoiceChannelSelect(interaction) {
  const channelId = interaction.values[0];
  const channel = interaction.guild.channels.cache.get(channelId);

  try {
    // Verifica se já está conectado em algum canal
    const existingConnection = getVoiceConnection(interaction.guild.id);
    if (existingConnection) {
      existingConnection.destroy();
    }

    // Conecta ao novo canal
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Config.findOneAndUpdate(
          { guildId: interaction.guild.id },
          { voiceChannel: null }
        );
      } catch (error) {
        console.error('Erro ao atualizar status no banco:', error);
      }
    });

    await Config.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { voiceChannel: channelId },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Conectado com sucesso!')
      .setDescription(`Bot conectado em ${channel}`)
      .addFields(
        { name: 'Canal', value: `${channel}`, inline: true },
        { name: 'ID', value: channel.id, inline: true }
      );

    await interaction.editReply({
      embeds: [embed],
      components: []
    });
  } catch (error) {
    console.error('Erro ao conectar:', error);
    await interaction.editReply({
      content: '❌ Falha ao conectar. Verifique as permissões e se o canal é válido.',
      components: []
    });
  }
}

async function handleSalesChannelSelect(interaction) {
  const channelId = interaction.values[0];
  const channel = interaction.guild.channels.cache.get(channelId);

  try {
    await Config.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { salesChannel: channelId },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Canal de Vendas Configurado!')
      .setDescription(`Vendas serão registradas em ${channel}`)
      .addFields(
        { name: 'Canal', value: `${channel}`, inline: true },
        { name: 'ID', value: channel.id, inline: true }
      );

    await interaction.editReply({
      embeds: [embed],
      components: []
    });
  } catch (error) {
    console.error('Erro ao configurar:', error);
    await interaction.editReply({
      content: '❌ Falha ao configurar canal de vendas.',
      components: []
    });
  }
}

async function handleDisconnect(interaction) {
  try {
    const connection = getVoiceConnection(interaction.guild.id);
    
    if (connection) {
      connection.destroy();
      await Config.findOneAndUpdate(
        { guildId: interaction.guild.id },
        { voiceChannel: null }
      );
      
      await interaction.editReply({
        content: '✅ Desconectado do canal de voz.',
        embeds: [],
        components: []
      });
    } else {
      await interaction.editReply({
        content: '⚠️ O bot não está conectado a nenhum canal de voz.',
        embeds: [],
        components: []
      });
    }
  } catch (error) {
    console.error('Erro ao desconectar:', error);
    await interaction.editReply({
      content: '❌ Falha ao desconectar do canal de voz.',
      embeds: [],
      components: []
    });
  }
}

async function handleError(interaction, error) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        content: '❌ Ocorreu um erro ao processar sua ação.',
        embeds: [],
        components: []
      });
    } else {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar sua ação.',
        ephemeral: true
      });
    }
  } catch (err) {
    console.error('Erro ao enviar mensagem de erro:', err);
  }
}