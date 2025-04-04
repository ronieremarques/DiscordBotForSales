const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const Ticket = require('../../models/Ticket');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Cria uma embed de ticket com interações para configuração'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        ephemeral: true
      });
    }

    try {
      // Criar configuração inicial do ticket
      const ticket = await Ticket.create({
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        userId: interaction.user.id,
        status: 'pending'
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2) // Cor em formato hexadecimal
        .setTitle('Sistema de Tickets')
        .setDescription('Clique no botão abaixo para abrir um ticket.')
        .setFooter({ text: 'Configuração disponível apenas para administradores.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket')
          .setLabel('Abrir Ticket')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('config_ticket')
          .setLabel('⚙️')
          .setStyle(ButtonStyle.Secondary)
      );

      const message = await interaction.channel.send({
        embeds: [embed],
        components: [row]
      });

      // Atualizar o ticket com o ID da mensagem
      ticket.messageId = message.id;
      await ticket.save();

      await interaction.reply({
        content: '✅ Embed de ticket criada com sucesso!',
        ephemeral: true
      });

    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao criar o ticket.',
        ephemeral: true
      });
    }
  }
};