const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');
const Config = require('../models/Config');
const Product = require('../models/Product');
<<<<<<< HEAD
const Sale = require('../models/Sale');
=======
>>>>>>> 587a21fa4de200a431d667a698036466d22210be

// Add updateEmbed function
async function updateEmbed(channel, ticket) {
  if (!channel || !ticket) return;

  try {
    const message = await channel.messages.fetch(ticket.messageId);

    const embed = new EmbedBuilder()
      .setColor(ticket.embedSettings?.color || '#5865F2')
      .setTitle(ticket.embedSettings?.title || 'Sistema de Tickets')
      .setDescription(ticket.embedSettings?.description || 'Clique no botão abaixo para abrir um ticket.');

    if (ticket.embedSettings?.image) {
      embed.setImage(ticket.embedSettings.image);
    }

    // Create menu if using menu mode
    const components = [];
    if (ticket.embedSettings?.useMenu && ticket.embedSettings.menuOptions?.length > 0) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('create_ticket')
        .setPlaceholder(ticket.embedSettings.menuPlaceholder || 'Selecione uma opção')
        .addOptions(ticket.embedSettings.menuOptions.map(opt => ({
          label: opt.label,
          value: opt.value,
          description: opt.description,
          emoji: opt.emoji
        })));

      components.push(new ActionRowBuilder().addComponents(menu));
    }

    await message.edit({
      embeds: [embed],
      components: components
    });

  } catch (error) {
    console.error('Erro ao atualizar embed:', error);
  }
}

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
<<<<<<< HEAD
        time: 86400000
=======
        time: 120000
>>>>>>> 587a21fa4de200a431d667a698036466d22210be
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
<<<<<<< HEAD
          label: c.name.length > 25 ? c.name.substring(0, 22) + '...' : c.name, // Limita o tamanho do nome
          value: c.id
        }))
        .slice(0, 25); // Limita a 25 canais

      if (channels.length === 0) {
        return interaction.followUp({
          content: '❌ Não encontrei nenhum canal de texto no servidor.',
          ephemeral: true
        });
      }
=======
          label: c.name,
          value: c.id
        }));
>>>>>>> 587a21fa4de200a431d667a698036466d22210be

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

      // Inside the payment validation handler, after confirming payment
      if (ticket?.embedSettings?.menuOptions) {
        // Find selected option
        const selectedOption = ticket.embedSettings.menuOptions.find(opt => 
          opt.value === ticket.selectedOption // You'll need to store this when user selects an option
        );

        if (selectedOption && selectedOption.stock > 0) {
          // Decrease stock
          selectedOption.stock--;
          
          // Update description with new stock
          selectedOption.description = selectedOption.description.replace(
            /Estoque: \d+/, 
            `Estoque: ${selectedOption.stock}`
          );

          await ticket.save();
          await updateEmbed(interaction.channel, ticket);

          // If stock reaches 0, you might want to disable/remove the option
          if (selectedOption.stock === 0) {
            // Remove option or mark as out of stock
            ticket.embedSettings.menuOptions = ticket.embedSettings.menuOptions.filter(
              opt => opt.value !== selectedOption.value
            );
            await ticket.save();
            await updateEmbed(interaction.channel, ticket);
          }
        }
      }

      // Inside the payment validation handler
      if (interaction.customId === 'validate_payment') {
        try {
<<<<<<< HEAD
          const ticket = await Ticket.findOne({ threadId: interaction.channel.id });
          if (!ticket || !ticket.selectedOption) return;
      
          // Obter o ID do comprador
          let buyerId;
          const channelName = interaction.channel.name;
          
          // Tentar obter o ID do nome do canal (formato: ticket-USERID)
          const ticketIdMatch = channelName.match(/ticket-(\d+)/);
          if (ticketIdMatch) {
            buyerId = ticketIdMatch[1];
          } else {
            // Se não encontrar no nome do canal, tentar obter pelo nome do canal
            const member = await interaction.guild.members.fetch({ query: channelName, limit: 1 });
            if (member.size > 0) {
              buyerId = member.first().id;
            } else {
              // Se ainda não encontrar, usar o ID do usuário que interagiu
              buyerId = interaction.user.id;
            }
          }
      
          // Definir o ID do comprador no ticket
          if (!ticket.deliveryStatus) {
            ticket.deliveryStatus = {};
          }
          ticket.deliveryStatus.buyerId = buyerId;
          ticket.deliveryStatus.sellerId = interaction.user.id;
          await ticket.save();
=======
          const thread = interaction.channel;
          const ticket = await Ticket.findOne({ threadId: thread.id });
          
          if (!ticket) {
            return interaction.reply({
              content: '❌ Ticket não encontrado.',
              ephemeral: true
            });
          }
      
          // Find selected option and update stock
          if (ticket.selectedOption && ticket.embedSettings?.menuOptions) {
            const optionIndex = ticket.embedSettings.menuOptions.findIndex(opt => 
              opt.value === ticket.selectedOption
            );
      
            if (optionIndex !== -1) {
              const option = ticket.embedSettings.menuOptions[optionIndex];
              
              // Decrease stock
              if (option.stock > 0) {
                option.stock--;
                
                // Update description with new stock value
                option.description = option.description.replace(
                  /Estoque: \d+/,
                  `Estoque: ${option.stock}`
                );
      
                // Update the ticket with new menu options
                ticket.embedSettings.menuOptions[optionIndex] = option;
                await ticket.save();
      
                // Update the original embed message
                const originalChannel = interaction.guild.channels.cache.get(ticket.channelId);
                const originalMessage = await originalChannel.messages.fetch(ticket.messageId);
                
                const embed = new EmbedBuilder()
                  .setColor(ticket.embedSettings.color || '#5865F2')
                  .setTitle(ticket.embedSettings.title)
                  .setDescription(ticket.embedSettings.description);
      
                if (ticket.embedSettings.image) {
                  embed.setImage(ticket.embedSettings.image);
                }
      
                // Create updated menu with new stock values
                const menu = new StringSelectMenuBuilder()
                  .setCustomId('create_ticket')
                  .setPlaceholder(ticket.embedSettings.menuPlaceholder || 'Selecione uma opção')
                  .addOptions(ticket.embedSettings.menuOptions.map(opt => ({
                    label: opt.label,
                    value: opt.value,
                    description: opt.description,
                    emoji: opt.emoji
                  })));
      
                const row = new ActionRowBuilder().addComponents(menu);
      
                await originalMessage.edit({
                  embeds: [embed],
                  components: [row]
                });
              }
            }
          }
      
          // Continue with existing validation code...
        } catch (error) {
          console.error('Erro ao validar pagamento:', error);
          await interaction.reply({
            content: '❌ Erro ao validar pagamento.',
            ephemeral: true
          });
        }
      }

      // No trecho de validação de pagamento
      if (interaction.customId === 'validate_payment') {
        try {
          const ticket = await Ticket.findOne({ threadId: interaction.channel.id });
          if (!ticket || !ticket.selectedOption) return;
>>>>>>> 587a21fa4de200a431d667a698036466d22210be
      
          // Buscar o produto no banco de dados
          const product = await Product.findOne({ 
            ticketId: ticket.messageId,
            optionId: ticket.selectedOption
          });
      
          if (!product) return;
      
          // Verificar e atualizar estoque
          if (product.stock > 0) {
<<<<<<< HEAD
            // Obter a quantidade do carrinho
            const quantity = ticket.cart?.quantity || 1;
            
            // Verificar se há estoque suficiente
            if (product.stock < quantity) {
              await interaction.followUp({
                content: `❌ Estoque insuficiente! Estoque atual: ${product.stock}, Quantidade selecionada: ${quantity}`,
                ephemeral: true
              });
              return;
            }
            
            // Diminuir estoque de acordo com a quantidade
            product.stock -= quantity;
            
            // Atualizar descrição
            product.description = product.originalDescription
              .replace(/\[preco\]/g, `R$ ${product.price.toFixed(2)}`)
              .replace(/\[estoque\]/g, product.stock.toString())
              .replace(/\[vendas\]/g, (product.totalSales || 0).toString())
              .replace(/\[vendedor\]/g, interaction.user.username);
      
            // Atualizar total de vendas
            product.totalSales = (product.totalSales || 0) + quantity;
            await product.save();
      
            // Registrar a venda
            await Sale.create({
              userId: buyerId,
              productId: product.optionId,
              quantity: quantity,
              totalPrice: product.price * quantity
            });
      
=======
            // Diminuir estoque
            product.stock--;
            
            // Atualizar descrição
            product.description = product.originalDescription
              .replace('[preco]', `R$ ${product.price.toFixed(2)}`)
              .replace('[estoque]', product.stock.toString());
      
            await product.save();
      
>>>>>>> 587a21fa4de200a431d667a698036466d22210be
            // Atualizar opção no menu do ticket
            const optionIndex = ticket.embedSettings.menuOptions.findIndex(
              opt => opt.value === ticket.selectedOption
            );
      
            if (optionIndex !== -1) {
              ticket.embedSettings.menuOptions[optionIndex].description = product.description;
              await ticket.save();
      
              // Atualizar embed original
              const originalChannel = interaction.guild.channels.cache.get(ticket.channelId);
              if (originalChannel) {
                await updateEmbed(originalChannel, ticket);
              }
<<<<<<< HEAD
              
              // Confirmar a venda com a quantidade correta
              await interaction.channel.send({
                content: `✅ Pagamento validado! ${quantity}x ${product.label} vendido(s) por R$ ${(product.price * quantity).toFixed(2)}.`
              });
            }
          }
=======
            }
      
            // Use followUp instead of reply since we already replied
            await interaction.followUp({
              content: '✅ Estoque atualizado com sucesso!',
              ephemeral: true
            });
          }
      
>>>>>>> 587a21fa4de200a431d667a698036466d22210be
        } catch (error) {
          console.error('Erro ao validar pagamento:', error);
          await interaction.followUp({
            content: '❌ Erro ao validar pagamento.',
            ephemeral: true
          });
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


        // Get the selected menu option name if it exists
        const selectedOption = ticket.embedSettings.menuOptions?.find(
          opt => opt.value === ticket.selectedOption
        );

        const productName = selectedOption ? selectedOption.label : ticket.embedSettings.title;
        const buyerId = ticket.deliveryStatus.buyerId;


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
                .setDescription(`- **Comprador:** ${interaction.channel.name}\n- **Vendedor:** <@${ticket.deliveryStatus.sellerId}>\n- **Produto:** ${productName}\n- **Data:** ${new Date().toLocaleDateString('pt-BR')}\n- **Hora:** ${new Date().toLocaleTimeString('pt-BR')}`)
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
                .setDescription(`- **Comprador:** ${interaction.channel.name}\n- **Vendedor:** <@${ticket.deliveryStatus.sellerId}>\n- **Produto:** ${productName}\n- **Data:** ${new Date().toLocaleDateString('pt-BR')}\n- **Hora:** ${new Date().toLocaleTimeString('pt-BR')}`)
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