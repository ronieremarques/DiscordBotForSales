const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const Ticket = require('../../models/Ticket');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Crie uma embed de ticket/venda para vender seus produtos.'),

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
        .setTitle('Painel de configuração embed')
        .setDescription('Clique no botão com emoji "⚙️" para começar a configurar essa embed.\n-# Pode configurar ela tanto para embed de vendas quanto para embed de tickets de suporte.')

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket')
          .setLabel('Button Name')
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
        content: 'Configure seu painel!',
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