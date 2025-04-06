const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Ticket = require('../models/Ticket'); // Adicionando importação do modelo
const Config = require('../models/Config'); // Adicionando importação do modelo de configuração

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

      // In the validate_payment handler
      if (ticket?.embedSettings?.stock) {
        try {
          const stock = JSON.parse(ticket.embedSettings.stock);
          if (stock.length > 0) {
            const product = stock.shift(); // Remove first product from stock
            
            try {
              // Try to send to user's DM
              const user = await interaction.client.users.fetch(ticket.deliveryStatus.buyerId);
              await user.send({
                content: `🎉 Seu produto foi entregue!\n\n${product.content}`
              });

              // Update stock
              ticket.embedSettings.stock = JSON.stringify(stock);
              await ticket.save();

              // Send message in thread
              await interaction.channel.send({
                content: `✅ Produto enviado no privado de <@${ticket.deliveryStatus.buyerId}>!\n⚠️ Este canal será deletado em 1 minuto.`
              });

              // Delete thread after 1 minute
              setTimeout(async () => {
                try {
                  await interaction.channel.delete('Venda concluída');
                } catch (err) {
                  console.error('Erro ao deletar canal:', err);
                }
              }, 60000);

            } catch (dmError) {
              // If DM fails, send in thread
              await interaction.channel.send({
                content: `❌ Não foi possível enviar no privado. **PRODUTO:**\n\n${product.content}\n\n⚠️ Este canal será deletado em 1 minuto, salve seu produto!`
              });

              setTimeout(async () => {
                try {
                  await interaction.channel.delete('Venda concluída');
                } catch (err) {
                  console.error('Erro ao deletar canal:', err);
                }
              }, 60000);
            }
          }
        } catch (error) {
          console.error('Erro ao processar estoque:', error);
        }
      }
    }

    if (interaction.customId === 'delivery_channel') {
      try {
        const channelId = interaction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);
        const ticket = await Ticket.findOne({ threadId: interaction.channel.id });

        // Get or create guild config to track sales
        let guildConfig = await Config.findOne({ guildId: interaction.guild.id });
        if (!guildConfig) {
          guildConfig = new Config({ guildId: interaction.guild.id });
        }
        
        // Increment sales counter
        guildConfig.salesCount = (guildConfig.salesCount || 0) + 1;
        await guildConfig.save();

        if (!ticket) {
          return interaction.reply({
            content: '❌ Ticket não encontrado.',
            ephemeral: true
          });
        }

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Comprar também')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${interaction.guild.id}/${ticket.channelId}/${ticket.messageId}`)
          );

        if (ticket.deliveryStatus.deliveryImage) {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle(`${interaction.guild.name} | Nova Venda #${guildConfig.salesCount}`)
                .setDescription(`- **Comprador:** <@${ticket.deliveryStatus.buyerId}>\n- **Vendedor:** <@${ticket.deliveryStatus.sellerId}>\n- **Produto:** ${ticket.embedSettings.title}\n- **Data:** ${new Date().toLocaleDateString('pt-BR')}\n- **Hora:** ${new Date().toLocaleTimeString('pt-BR')}`)
                .setColor('#242429')
                .setImage(ticket.deliveryStatus.deliveryImage)
            ],
            components: [row]
          });
        } else {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle(`${interaction.guild.name} | Nova Venda #${guildConfig.salesCount}`)
                .setDescription(`- **Comprador:** <@${ticket.deliveryStatus.buyerId}>\n- **Vendedor:** <@${ticket.deliveryStatus.sellerId}>\n- **Produto:** ${ticket.embedSettings.title}\n- **Data:** ${new Date().toLocaleDateString('pt-BR')}\n- **Hora:** ${new Date().toLocaleTimeString('pt-BR')}`)
                .setColor('#242429')
            ],
            components: [row]
          });
        }

        await interaction.reply({
          content: `✅ Confirmação de entrega enviada! (Venda #${guildConfig.salesCount})`,
          ephemeral: true
        });

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