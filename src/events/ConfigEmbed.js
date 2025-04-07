const { Events, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Ticket = require('../models/Ticket');
const Product = require('../models/Product');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    if (interaction.customId === 'config_ticket') {
      const ticket = await Ticket.findOne({ messageId: interaction.message.id });
      if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({
          content: '❌ Apenas administradores podem validar pagamentos.',
          ephemeral: true
        });
      }
      
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
            emoji: "❓",
            description: 'Alterar o título principal',
            value: 'embed_title'
          },
          {
            label: 'Descrição da Embed',
            emoji: "💬",
            description: 'Alterar a descrição',
            value: 'embed_description'
          },
          {
            label: 'Cor da Embed',
            emoji: "🎨",
            description: 'Alterar a cor (HEX)',
            value: 'embed_color'
          },
          {
            label: 'Imagem da Embed',
            emoji: "🖼️",
            description: 'Adicionar/alterar imagem',
            value: 'embed_image'
          },
          {
            label: 'Chave PIX',
            emoji: "💠",
            description: 'Configurar chave PIX',
            value: 'pix'
          },
          {
            label: 'Cor do Botão',
            emoji: "🎨",
            description: 'Mudar cor do botão',
            value: 'button_color'
          },
          {
            label: 'Nome do Botão',
            emoji: "❓",
            description: 'Mudar texto do botão',
            value: 'button_label'
          },
          {
            label: 'Emoji do Botão',
            emoji: "😀",
            description: 'Adicionar emoji ao botão',
            value: 'button_emoji'
          },
          {
            label: 'Remover Botão de Edição',
            emoji: "⚙️",
            description: 'Esta ação é irreversível',
            value: 'remove_config_button'
          },
          {
            label: 'Tipo de Embed',
            description: 'Normal ou Vendas Manual',
            emoji: "❓",
            value: 'ticket_type'
          },
          {
            label: 'Setar Estoque',
            emoji: "📦",
            description: 'Configurar produtos em estoque',
            value: 'set_stock'
          },
          {
            label: 'Vendas em Menu',
            emoji: "📝",
            description: 'Usar menu dropdown ao invés de botão',
            value: 'menu_mode'
          },
          {
            label: 'Adicionar Opção ao Menu',
            emoji: "➕",
            description: 'Adicionar opção ao menu dropdown',
            value: 'add_menu_option'
          }
        ]);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#242429')
            .setTitle('Painel de configuração da embed')
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
          content: '🖼️ Envie uma imagem (anexada) ou um link direto da imagem:',
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
            // Se for um anexo, fazer upload permanente
            const attachment = message.attachments.first();
            // Aqui você implementaria a lógica de upload para um serviço de hosting
            // Por exemplo, usando imgur, cloudinary, ou seu próprio servidor
            
            // Por enquanto, vamos usar o CDN do Discord (não recomendado para produção)
            imageUrl = attachment.proxyURL;
            
            // Aviso sobre hospedagem
            await interaction.followUp({
              content: '⚠️ Recomendado: Use um link de imagem hospedada permanentemente para evitar que a imagem fique indisponível.',
              ephemeral: true
            });
          } else {
            // Se for um link, usar diretamente
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
          .setPlaceholder('Selecione o tipo de embed')
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
          content: '📝 Selecione o tipo de embed:',
          components: [new ActionRowBuilder().addComponents(typeMenu)],
          ephemeral: true
        });
        return;
      }

      if (selectedOption === 'set_stock') {
        await interaction.reply({
          content: '📦 Cole o texto do seu estoque no formato:\n```\nproduto key\nproduto key\nproduto key\n-\nproduto key```\nUse `-` para separar produtos diferentes.',
          ephemeral: true
        });
      
        const filter = m => m.author.id === interaction.user.id;
        try {
          const collected = await interaction.channel.awaitMessages({
            filter,
            max: 1,
            time: 120000,
            errors: ['time']
          });
      
          const message = collected.first();
          try {
            // Split text into products by "-" separator
            const products = message.content.split('-').map(block => block.trim());
            
            // Convert to JSON format
            const stockData = products.map(product => {
              const lines = product.split('\n').filter(line => line.trim());
              return {
                name: `Produto ${lines.length} linha(s)`,
                content: lines.join('\n')
              };
            });
      
            ticket.embedSettings.stock = JSON.stringify(stockData);
            await ticket.save();
            await message.delete().catch(() => {});
      
            await interaction.followUp({
              content: `✅ Estoque configurado com sucesso! ${stockData.length} produtos adicionados.`,
              ephemeral: true
            });
          } catch (e) {
            console.error('Erro ao processar estoque:', e);
            await interaction.followUp({
              content: '❌ Formato inválido. Por favor, tente novamente.',
              ephemeral: true
            });
          }
        } catch (error) {
          await interaction.followUp({
            content: '❌ Tempo esgotado ou erro ao configurar estoque.',
            ephemeral: true
          });
        }
        return;
      }

      if (selectedOption === 'menu_mode') {
        const modal = new ModalBuilder()
          .setCustomId('menu_mode_modal')
          .setTitle('Configurar Menu Dropdown');

        const placeholderInput = new TextInputBuilder()
          .setCustomId('menu_placeholder')
          .setLabel('Texto do menu')
          .setPlaceholder('Ex: Selecione um produto...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const modeInput = new TextInputBuilder()
          .setCustomId('menu_mode')
          .setLabel('Modo (botão/menu)')
          .setValue('menu')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(placeholderInput);
        const secondRow = new ActionRowBuilder().addComponents(modeInput);

        modal.addComponents(firstRow, secondRow);
        await interaction.showModal(modal);
        return;
      }
      
      if (selectedOption === 'add_menu_option') {
        const modal = new ModalBuilder()
          .setCustomId('add_menu_option_modal')
          .setTitle('Adicionar Opção ao Menu');

        const nameInput = new TextInputBuilder()
          .setCustomId('option_name')
          .setLabel('Nome da opção')
          .setPlaceholder('Digite o nome que aparecerá no menu')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const emojiInput = new TextInputBuilder()
          .setCustomId('option_emoji')
          .setLabel('Emoji (opcional)')
          .setPlaceholder('Digite um emoji')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const descriptionInput = new TextInputBuilder()
          .setCustomId('option_description')
          .setLabel('Descrição (use [preco] e [estoque])')
          .setPlaceholder('Ex: Preço: [preco] | Estoque: [estoque]')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const priceInput = new TextInputBuilder()
          .setCustomId('option_price')
          .setLabel('Preço')
          .setPlaceholder('Digite o preço (ex: 10.00)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const stockInput = new TextInputBuilder()
          .setCustomId('option_stock')
          .setLabel('Quantidade em estoque')
          .setPlaceholder('Digite a quantidade disponível')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nameInput),
          new ActionRowBuilder().addComponents(emojiInput),
          new ActionRowBuilder().addComponents(descriptionInput),
          new ActionRowBuilder().addComponents(priceInput),
          new ActionRowBuilder().addComponents(stockInput)
        );

        await interaction.showModal(modal);
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
        const selectedType = interaction.values[0]
      
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

    if (interaction.customId === 'menu_mode_select') {
      try {
        const selectedMode = interaction.values[0];
        
        // Buscar referência da mensagem original através da propriedade message
        const messageReference = interaction.message?.reference;
        const configMessage = messageReference ? 
          await interaction.channel.messages.fetch(messageReference.messageId) : null;
        
        // Tentar encontrar o ticket usando a referência da configuração
        const ticket = await Ticket.findOne({ 
          messageId: configMessage?.reference?.messageId 
        });

        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração não encontrada. Por favor, tente novamente.',
            ephemeral: true
          });
        }

        // Atualizar configurações do menu
        if (!ticket.embedSettings) {
          ticket.embedSettings = {};
        }

        ticket.embedSettings.useMenu = selectedMode === 'menu';
        if (!ticket.embedSettings.menuOptions) {
          ticket.embedSettings.menuOptions = [];
        }

        await ticket.save();
        
        // Buscar o canal original do ticket
        const originalChannel = interaction.guild.channels.cache.get(ticket.channelId);
        if (!originalChannel) {
          throw new Error('Canal do ticket não encontrado');
        }

        // Atualizar a embed no canal original
        await updateEmbed(originalChannel, ticket);

        await interaction.reply({
          content: `✅ Modo alterado para: ${selectedMode === 'menu' ? 'Menu Dropdown' : 'Botão Normal'}`,
          ephemeral: true
        });

      } catch (error) {
        console.error('Erro ao alterar modo:', error);
        await interaction.reply({
          content: '❌ Erro ao alterar modo. Por favor, tente novamente.',
          ephemeral: true
        });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'menu_mode_modal') {
      try {
        const placeholder = interaction.fields.getTextInputValue('menu_placeholder');
        const selectedMode = interaction.fields.getTextInputValue('menu_mode').toLowerCase();
        
        // Find the original message ID through interaction chain
        const ticket = await Ticket.findOne({
          $or: [
            { messageId: interaction.message?.reference?.messageId },
            { messageId: interaction.message?.id }
          ]
        });

        if (!ticket || !ticket.messageId) {
          return interaction.reply({
            content: '❌ Configuração não encontrada ou ID da mensagem inválido.',
            ephemeral: true
          });
        }

        // Initialize if needed
        if (!ticket.embedSettings) {
          ticket.embedSettings = {};
        }

        ticket.embedSettings.useMenu = selectedMode === 'menu';
        ticket.embedSettings.menuPlaceholder = placeholder;
        
        if (!ticket.embedSettings.menuOptions) {
          ticket.embedSettings.menuOptions = [];
        }

        await ticket.save();

        // Get the channel and validate message exists
        const targetChannel = interaction.guild.channels.cache.get(ticket.channelId);
        if (!targetChannel) {
          throw new Error('Canal não encontrado');
        }

        // Verify message exists before updating
        const messageToUpdate = await targetChannel.messages.fetch(ticket.messageId)
          .catch(() => null);

        if (!messageToUpdate) {
          throw new Error('Mensagem não encontrada');
        }

        await messageToUpdate.edit({
          embeds: [createEmbed(ticket)],
          components: createComponents(ticket)
        });

        await interaction.reply({
          content: `✅ Menu configurado com sucesso!\nModo: ${selectedMode === 'menu' ? 'Menu Dropdown' : 'Botão Normal'}\nTexto do menu: ${placeholder}`,
          ephemeral: true
        });

      } catch (error) {
        console.error('Erro ao configurar menu:', error);
        await interaction.reply({
          content: `❌ Erro ao configurar menu: ${error.message}`,
          ephemeral: true
        });
      }
    }

    // No trecho onde adiciona uma nova opção ao menu
    if (interaction.isModalSubmit() && interaction.customId === 'add_menu_option_modal') {
      try {
        const label = interaction.fields.getTextInputValue('option_name');
        const emoji = interaction.fields.getTextInputValue('option_emoji');
        const description = interaction.fields.getTextInputValue('option_description');
        const price = parseFloat(interaction.fields.getTextInputValue('option_price'));
        const stock = parseInt(interaction.fields.getTextInputValue('option_stock'));

        // Validações...

        const ticket = await Ticket.findOne({ messageId: interaction.message?.reference?.messageId });
        
        if (!ticket) return;

        // Criar ID único para a opção
        const optionId = `option_${Date.now()}`;

        // Criar produto no banco de dados
        const product = await Product.create({
          ticketId: ticket.messageId,
          optionId: optionId,
          label,
          price,
          stock,
          description: description.replace('[preco]', `R$ ${price.toFixed(2)}`).replace('[estoque]', stock.toString()),
          emoji: emoji || undefined,
          originalDescription: description
        });

        // Adicionar opção ao menu do ticket
        if (!ticket.embedSettings.menuOptions) {
          ticket.embedSettings.menuOptions = [];
        }

        ticket.embedSettings.menuOptions.push({
          label,
          emoji: emoji || undefined,
          description: product.description,
          value: optionId
        });

        await ticket.save();
        await updateEmbed(interaction.channel, ticket);

        await interaction.reply({
          content: `✅ Produto adicionado ao menu com sucesso!\nNome: ${label}\nPreço: R$ ${price.toFixed(2)}\nEstoque: ${stock}`,
          ephemeral: true
        });

      } catch (error) {
        console.error('Erro ao adicionar opção:', error);
        await interaction.reply({
          content: '❌ Erro ao adicionar opção ao menu.',
          ephemeral: true
        });
      }
    }
  }
};

// And update the updateEmbed function to properly handle interactions
async function updateEmbed(channel, ticket) {
  if (!channel || !ticket) {
    throw new Error('Canal ou ticket inválido');
  }

  try {
    const embed = createEmbed(ticket);
    const components = createComponents(ticket);

    // Try to find existing message
    let message;
    if (ticket.messageId) {
      try {
        message = await channel.messages.fetch(ticket.messageId);
      } catch (error) {
        console.log('Mensagem não encontrada, criando nova');
      }
    }

    if (message) {
      // Update existing message
      await message.edit({
        embeds: [embed],
        components: components
      });
    } else {
      // Create new message
      message = await createNewMessage(channel, embed, components, ticket);
    }

    return message;

  } catch (error) {
    console.error('Erro ao atualizar embed:', error);
    throw error;
  }
}

async function createNewMessage(channel, embed, components, ticket) {
  try {
    const message = await channel.send({
      embeds: [embed],
      components: components
    });

    // Update ticket with new message ID
    ticket.messageId = message.id;
    await ticket.save();

    return message;
  } catch (error) {
    console.error('Error creating new message:', error);
    throw new Error('Failed to create new message');
  }
}

// Helper functions to create embed and components
function createEmbed(ticket) {
  const embed = new EmbedBuilder()
    .setColor(ticket.embedSettings?.color || '#5865F2')
    .setTitle(ticket.embedSettings?.title || 'Sistema de Tickets')
    .setDescription(ticket.embedSettings?.description || 'Clique no botão abaixo para abrir um ticket.');

  if (ticket.embedSettings?.image) {
    embed.setImage(ticket.embedSettings.image);
  }

  return embed;
}

// Helper function to validate emoji
function isValidEmoji(emoji) {
  if (!emoji) return false;
  
  // Check for Unicode emoji
  const emojiRegex = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F680}-\u{1F6FF}\u{1F1F2}\u{1F1F4}]$/u;
  
  // Check for Discord custom emoji format (<:name:id> or <a:name:id>)
  const discordEmojiRegex = /^<a?:[a-zA-Z0-9_]+:\d+>$/;
  
  return emojiRegex.test(emoji) || discordEmojiRegex.test(emoji);
}

function createComponents(ticket) {
  const components = [];
  const mainRow = new ActionRowBuilder();

  if (ticket.embedSettings?.useMenu && Array.isArray(ticket.embedSettings?.menuOptions) && ticket.embedSettings.menuOptions.length > 0) {
    const menuOptions = ticket.embedSettings.menuOptions
      .filter(option => option && option.label)
      .map(option => {
        const formattedOption = {
          label: option.label,
          value: option.value || `option_${Date.now()}`,
          description: option.description || undefined
        };

        // Only add emoji if it's valid
        if (option.emoji && isValidEmoji(option.emoji)) {
          formattedOption.emoji = option.emoji;
        }

        return formattedOption;
      });

    if (menuOptions.length > 0) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('create_ticket')
        .setPlaceholder(ticket.embedSettings.menuPlaceholder || 'Selecione uma opção')
        .addOptions(menuOptions);

      mainRow.addComponents(menu);
      components.push(mainRow);

      if (!ticket.buttonSettings?.hideConfig) {
        components.push(new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('config_ticket')
              .setLabel('⚙️')
              .setStyle(ButtonStyle.Secondary)
          ));
      }
    }
  } else {
    const createTicketButton = new ButtonBuilder()
      .setCustomId('create_ticket')
      .setLabel(ticket.buttonSettings?.label || 'Abrir Ticket')
      .setStyle(ButtonStyle[ticket.buttonSettings?.style] || ButtonStyle.Primary);

    if (ticket.buttonSettings?.emoji) {
      createTicketButton.setEmoji(ticket.buttonSettings.emoji);
    }

    mainRow.addComponents(createTicketButton);

    if (!ticket.buttonSettings?.hideConfig) {
      mainRow.addComponents(
        new ButtonBuilder()
          .setCustomId('config_ticket')
          .setLabel('⚙️')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    components.push(mainRow);
  }

  return components;
}