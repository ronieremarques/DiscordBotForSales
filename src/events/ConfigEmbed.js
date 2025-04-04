const { Events, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Ticket = require('../models/Ticket');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    if (interaction.customId === 'config_ticket') {
      const ticket = await Ticket.findOne({ messageId: interaction.message.id });
      
      if (!ticket) {
        return interaction.reply({
          content: '❌ Configuração não encontrada.',
          ephemeral: true
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId('config_ticket_menu')
        .setPlaceholder('Selecione uma opção...')
        .addOptions([
          {
            label: 'Título da Embed',
            description: 'Alterar o título principal',
            value: 'embed_title'
          },
          {
            label: 'Descrição da Embed',
            description: 'Alterar a descrição',
            value: 'embed_description'
          },
          {
            label: 'Cor da Embed',
            description: 'Alterar a cor (HEX)',
            value: 'embed_color'
          },
          {
            label: 'Imagem da Embed',
            description: 'Adicionar/alterar imagem',
            value: 'embed_image'
          },
          {
            label: 'Chave PIX',
            description: 'Configurar chave PIX',
            value: 'pix'
          },
          {
            label: 'Cor do Botão',
            description: 'Mudar cor do botão',
            value: 'button_color'
          },
          {
            label: 'Nome do Botão',
            description: 'Mudar texto do botão',
            value: 'button_label'
          },
          {
            label: 'Emoji do Botão',
            description: 'Adicionar emoji ao botão',
            value: 'button_emoji'
          },
          {
            label: 'Remover Botão de Edição',
            description: 'Esta ação é irreversível',
            value: 'remove_config_button'
          },
          {
            label: 'Tipo de Ticket',
            description: 'Normal ou Vendas Manual',
            value: 'ticket_type'
          }
        ]);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('⚙️ Configuração da Embed de Ticket')
            .setDescription('Selecione o que deseja configurar no menu abaixo:')
        ],
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }

    if (interaction.customId === 'config_ticket_menu') {
      const ticket = await Ticket.findOne({ messageId: interaction.message.reference?.messageId });

      if (!ticket) {
        return interaction.reply({
          content: '❌ Configuração não encontrada.',
          ephemeral: true
        });
      }

      const selectedOption = interaction.values[0];

      if (selectedOption === 'embed_image') {
        await interaction.reply({
          content: '🖼️ Envie uma imagem (anexada) ou um link:',
          ephemeral: true
        });

        const filter = m => {
          const hasImage = m.attachments.size > 0;
          const hasValidUrl = m.content.match(/^(http(s?):)([/|.|\w|\s|-])*\.(?:jpg|gif|png|webp)$/);
          return m.author.id === interaction.user.id && (hasImage || hasValidUrl);
        };

        try {
          const collected = await interaction.channel.awaitMessages({
            filter,
            max: 1,
            time: 60000,
            errors: ['time']
          });

          const message = collected.first();
          let imageUrl;

          if (message.attachments.size > 0) {
            imageUrl = message.attachments.first().url;
          } else {
            imageUrl = message.content;
          }

          ticket.embedSettings.image = imageUrl;
          await ticket.save();
          await updateEmbed(interaction.channel, ticket);
          await message.delete().catch(() => {});

          await interaction.followUp({
            content: '✅ Imagem atualizada com sucesso!',
            ephemeral: true
          });
        } catch (error) {
          if (error.name === 'CollectorError') {
            await interaction.followUp({
              content: '❌ Tempo esgotado ou formato de imagem inválido. Use .jpg, .png, .gif ou .webp',
              ephemeral: true
            });
          } else {
            console.error('Erro:', error);
            await interaction.followUp({
              content: '❌ Erro ao atualizar imagem.',
              ephemeral: true
            });
          }
        }
        return;
      }

      const promptMessages = {
        'embed_title': '📝 Digite o novo título da embed:',
        'embed_description': '📝 Digite a nova descrição da embed:',
        'embed_color': '🎨 Digite a nova cor em HEX (exemplo: #5865F2):',
        'embed_image': '🖼️ Envie o link da imagem:',
        'button_label': '✏️ Digite o novo texto para o botão:',
        'button_emoji': '😀 Digite o emoji para o botão:',
        'pix': '💳 Digite a chave PIX:'
      };

      if (selectedOption === 'button_color') {
        const colorMenu = new StringSelectMenuBuilder()
          .setCustomId('button_color_select')
          .setPlaceholder('Selecione a cor do botão')
          .addOptions([
            { label: 'Azul', description: 'Cor padrão', value: 'Primary' },
            { label: 'Verde', description: 'Cor de sucesso', value: 'Success' },
            { label: 'Cinza', description: 'Cor secundária', value: 'Secondary' },
            { label: 'Vermelho', description: 'Cor de perigo', value: 'Danger' }
          ]);

        await interaction.reply({
          content: '🎨 Selecione a cor do botão:',
          components: [new ActionRowBuilder().addComponents(colorMenu)],
          ephemeral: true
        });
        return;
      }

      if (selectedOption === 'remove_config_button') {
        await interaction.reply({
          content: '⚠️ **ATENÇÃO**: Esta ação é irreversível! Você não poderá mais editar esta embed depois.\nTem certeza que deseja remover o botão de configuração?\nResponda com `sim` para confirmar ou `não` para cancelar.',
          ephemeral: true
        });

        const filter = m => m.author.id === interaction.user.id && ['sim', 'não'].includes(m.content.toLowerCase());
        
        try {
          const collected = await interaction.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
          });

          const response = collected.first();
          await response.delete().catch(() => {});

          if (response.content.toLowerCase() === 'sim') {
            ticket.buttonSettings.hideConfig = true; // Adicione este campo no modelo Ticket
            await ticket.save();
            await updateEmbed(interaction.channel, ticket);

            await interaction.followUp({
              content: '✅ Botão de configuração removido com sucesso!',
              ephemeral: true
            });
          } else {
            await interaction.followUp({
              content: '❌ Operação cancelada.',
              ephemeral: true
            });
          }
        } catch (error) {
          await interaction.followUp({
            content: '❌ Tempo esgotado ou erro ao processar o comando.',
            ephemeral: true
          });
        }
        return;
      }

      if (selectedOption === 'ticket_type') {
        const typeMenu = new StringSelectMenuBuilder()
          .setCustomId('ticket_type_select')
          .setPlaceholder('Selecione o tipo de ticket')
          .addOptions([
            { 
              label: 'Ticket Normal',
              description: 'Atendimento padrão',
              value: 'normal'
            },
            {
              label: 'Vendas Manual',
              description: 'Para vendas manuais com PIX',
              value: 'vendas'
            }
          ]);
      
        await interaction.reply({
          content: '📝 Selecione o tipo de ticket:',
          components: [new ActionRowBuilder().addComponents(typeMenu)],
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: promptMessages[selectedOption],
        ephemeral: true
      });

      const filter = m => m.author.id === interaction.user.id;
      const response = await interaction.channel.awaitMessages({
        filter,
        max: 1,
        time: 60000,
        errors: ['time']
      });

      const newValue = response.first().content;

      try {
        switch (selectedOption) {
          case 'embed_title':
            ticket.embedSettings.title = newValue;
            break;
          case 'embed_description':
            ticket.embedSettings.description = newValue;
            break;
          case 'embed_color':
            if (!/^#([0-9A-Fa-f]{6})$/.test(newValue)) {
              await interaction.followUp({
                content: '❌ Cor inválida. Use o formato HEX (#RRGGBB)',
                ephemeral: true
              });
              return;
            }
            ticket.embedSettings.color = newValue;
            break;
          case 'button_label': // Corrigindo esta parte
            ticket.buttonSettings.label = newValue;
            break;
          case 'button_emoji':
            ticket.buttonSettings.emoji = newValue;
            break;
          case 'pix':
            ticket.embedSettings.pixKey = newValue;
            break;
        }

        await ticket.save();
        await updateEmbed(interaction.channel, ticket);
        await response.first().delete().catch(() => {});

        await interaction.followUp({
          content: '✅ Configuração atualizada com sucesso!',
          ephemeral: true
        });
      } catch (error) {
        console.error('Erro:', error);
        await interaction.followUp({
          content: '❌ Erro ao atualizar configuração.',
          ephemeral: true
        });
      }
    }

    if (interaction.customId === 'button_color_select') {
      try {
        const selectedColor = interaction.values[0];
        
        // Buscar o ID da mensagem original que está armazenado no banco
        // A mensagem de referência é a mensagem do menu de configuração
        // que foi usada para chegar até aqui
        const originalMessageId = interaction.message.reference?.messageId;
        
        // Primeiro encontramos o ticket pelo ID da mensagem de configuração
        const configMessage = await interaction.channel.messages.fetch(originalMessageId);
        const originalMessageId2 = configMessage.reference?.messageId;
        
        // Agora buscamos o ticket usando o ID da mensagem original
        const ticket = await Ticket.findOne({ messageId: originalMessageId2 });

        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração não encontrada.',
            ephemeral: true
          });
        }

        ticket.buttonSettings.style = selectedColor;
        await ticket.save();
        await updateEmbed(interaction.channel, ticket);

        await interaction.reply({
          content: '✅ Cor do botão atualizada com sucesso!',
          ephemeral: true
        });
      } catch (error) {
        console.error('Erro ao atualizar cor do botão:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao atualizar a cor do botão.',
          ephemeral: true
        });
      }
    }

    if (interaction.customId === 'ticket_type_select') {
      try {
        const selectedType = interaction.values[0];
        
        // Buscar o ticket usando a mesma lógica do button_color_select
        const originalMessageId = interaction.message.reference?.messageId;
        const configMessage = await interaction.channel.messages.fetch(originalMessageId);
        const originalMessageId2 = configMessage.reference?.messageId;
        const ticket = await Ticket.findOne({ messageId: originalMessageId2 });

        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração não encontrada.',
            ephemeral: true
          });
        }

        // Atualizar o tipo do ticket
        ticket.ticketType = selectedType;
        await ticket.save();

        // Mensagem de confirmação baseada no tipo selecionado
        const typeMessages = {
          normal: '✅ Ticket configurado como Normal',
          vendas: '✅ Ticket configurado como Vendas Manual'
        };

        await interaction.reply({
          content: typeMessages[selectedType],
          ephemeral: true
        });

      } catch (error) {
        console.error('Erro ao atualizar tipo do ticket:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao atualizar o tipo do ticket.',
          ephemeral: true
        });
      }
    }
  }
};

async function updateEmbed(channel, ticket) {
  try {
    const message = await channel.messages.fetch(ticket.messageId);
    
    const embed = new EmbedBuilder()
      .setColor(ticket.embedSettings.color || '#5865F2')
      .setTitle(ticket.embedSettings.title || 'Sistema de Tickets')
      .setDescription(ticket.embedSettings.description || 'Clique no botão abaixo para abrir um ticket.')
      .setFooter({ text: 'Configuração disponível apenas para administradores.' });

    if (ticket.embedSettings.image) {
      embed.setImage(ticket.embedSettings.image);
    }

    // Create ticket button first
    const createTicketButton = new ButtonBuilder()
      .setCustomId('create_ticket')
      .setLabel(ticket.buttonSettings.label || 'Abrir Ticket')
      .setStyle(ButtonStyle[ticket.buttonSettings.style] || ButtonStyle.Primary);

    if (ticket.buttonSettings.emoji) {
      createTicketButton.setEmoji(ticket.buttonSettings.emoji);
    }

    // Create buttons array
    const buttons = [createTicketButton];

    // Add config button only if not hidden
    if (!ticket.buttonSettings.hideConfig) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('config_ticket')
          .setLabel('⚙️')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    // Add buttons to row
    const row = new ActionRowBuilder().addComponents(buttons);

    await message.edit({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    console.error('Erro ao atualizar embed:', error);
    throw error;
  }
}