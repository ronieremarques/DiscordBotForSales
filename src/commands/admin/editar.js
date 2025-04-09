const { SlashCommandBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Ticket = require('../../models/Ticket');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('editar')
    .setDescription('Edita uma embed de ticket pelo ID da mensagem')
    .addStringOption(option =>
      option
        .setName('mensagem_id')
        .setDescription('ID da mensagem que contém a embed')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Apenas administradores podem usar este comando.',
        ephemeral: true
      });
    }

    const messageId = interaction.options.getString('mensagem_id');

    try {
      const ticket = await Ticket.findOne({ messageId: messageId });

      if (!ticket) {
        return interaction.reply({
          content: '❌ Nenhuma configuração encontrada para este ID de mensagem.',
          ephemeral: true
        });
      }

      // Get the channel where the message is
      const channel = interaction.guild.channels.cache.get(ticket.channelId);
      if (!channel) {
        return interaction.reply({
          content: '❌ Canal não encontrado.',
          ephemeral: true
        });
      }

      // Get the message to verify it exists
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        return interaction.reply({
          content: '❌ Mensagem não encontrada.',
          ephemeral: true
        });
      }

      // Create config button
      const configButton = new ButtonBuilder()
        .setCustomId('config_ticket')
        .setLabel('⚙️')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder().addComponents(configButton);

      // Add config button temporarily
      await message.edit({
        components: [...message.components, row]
      });

      await interaction.reply({
        content: '✅ Botão de configuração adicionado temporariamente. Use-o para editar a embed.',
        ephemeral: true
      });

      // Remove config button after 1 minute
      setTimeout(async () => {
        await message.edit({
          components: message.components.slice(0, -1)
        }).catch(console.error);
      }, 60000);

    } catch (error) {
      console.error('Erro ao editar ticket:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao tentar editar a embed.',
        ephemeral: true
      });
    }
  },
};