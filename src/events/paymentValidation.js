const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Ticket = require('../models/Ticket'); // Adicionando importação do modelo

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    
    if (interaction.customId === 'validate_payment') {
      if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({
          content: '❌ Apenas administradores podem validar pagamentos.',
          ephemeral: true
        });
      }

      await interaction.reply({
        content: '📸 Envie uma imagem/link da entrega (opcional) ou digite "pular":',
        ephemeral: true
      });

      const filter = m => m.author.id === interaction.user.id;
      const collected = await interaction.channel.awaitMessages({
        filter,
        max: 1,
        time: 120000
      });

      const response = collected.first();
      let deliveryImage = null;

      if (response.attachments.size > 0) {
        deliveryImage = response.attachments.first().url;
      } else if (response.content.startsWith('http')) {
        deliveryImage = response.content;
      }

      // Get channels for delivery message
      const channels = interaction.guild.channels.cache
        .filter(c => c.type === 0) // Text channels
        .map(c => ({
          label: c.name,
          value: c.id
        }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('delivery_channel')
        .setPlaceholder('Selecione o canal de entrega')
        .addOptions(channels);

      await interaction.followUp({
        content: '📢 Selecione o canal para enviar a confirmação:',
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });

      // Save delivery info
      const ticket = await Ticket.findOne({ threadId: interaction.channel.id });
      if (!ticket) {
        return interaction.followUp({
          content: '❌ Ticket não encontrado.',
          ephemeral: true
        });
      }

      ticket.deliveryStatus = {
        delivered: true,
        deliveryImage,
        buyerId: interaction.channel.name.split('-')[1], // Gets username from thread name
        sellerId: interaction.user.id
      };
      await ticket.save();
    }

    if (interaction.customId === 'delivery_channel') {
      try {
        const channelId = interaction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);
        const ticket = await Ticket.findOne({ threadId: interaction.channel.id });

        if (!ticket) {
          return interaction.reply({
            content: '❌ Ticket não encontrado.',
            ephemeral: true
          });
        }

        // Criar o botão que leva à mensagem
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Comprar também')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${interaction.guild.id}/${ticket.channelId}/${ticket.messageId}`)
          );

        // Preparar a mensagem de texto
        const content = `Entrega realizada com sucesso <@${ticket.deliveryStatus.buyerId}>!\n-# Vendido por <@${ticket.deliveryStatus.sellerId}>`;

        if (ticket.deliveryStatus.deliveryImage) {
          // Se tiver imagem, enviar como anexo
          const response = await fetch(ticket.deliveryStatus.deliveryImage);
          const buffer = await response.arrayBuffer();
          
          await channel.send({
            content: content,
            files: [{ attachment: Buffer.from(buffer), name: 'entrega.png' }],
            components: [row]
          });
        } else {
          // Se não tiver imagem, enviar só o texto
          await channel.send({
            content: content,
            components: [row]
          });
        }

        await interaction.reply({
          content: '✅ Confirmação de entrega enviada!',
          ephemeral: true
        });

        // Fechar o ticket
        await interaction.channel.delete('Venda concluída');

      } catch (error) {
        console.error('Erro ao enviar confirmação:', error);
        await interaction.reply({
          content: '❌ Erro ao enviar confirmação de entrega.',
          ephemeral: true
        });
      }
    }
  }
};