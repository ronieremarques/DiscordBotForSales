const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

function createProductEmbed(ticket) {
  const embed = new EmbedBuilder()
    .setColor(ticket.embedSettings?.color || '#5865F2')
    .setTitle(ticket.embedSettings?.title || 'Sistema de Tickets')
    .setDescription(ticket.embedSettings?.description || 'Clique no botão abaixo para abrir um ticket.');

  if (ticket.embedSettings?.image) {
    embed.setImage(ticket.embedSettings.image);
  }

  return embed;
}

function createProductComponents(ticket) {
  const components = [];
  const mainRow = new ActionRowBuilder();

  if (ticket.embedSettings?.useMenu && Array.isArray(ticket.embedSettings?.menuOptions) && ticket.embedSettings.menuOptions.length > 0) {
    const menuOptions = ticket.embedSettings.menuOptions
      .filter(option => option && option.label)
      .map(option => ({
        label: option.label || 'Opção',
        value: option.value || `option_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        description: option.description || undefined,
        emoji: option.emoji || undefined
      }));

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

async function updateProductEmbed(channel, ticket) {
  if (!channel || !ticket) {
    throw new Error('Canal ou ticket inválido');
  }

  try {
    const embed = createProductEmbed(ticket);
    const components = createProductComponents(ticket);

    // Buscar mensagem existente
    let message;
    if (ticket.messageId) {
      try {
        message = await channel.messages.fetch(ticket.messageId);
      } catch (error) {
        console.log('Mensagem não encontrada, criando nova');
      }
    }

    if (message) {
      // Atualizar mensagem existente usando a função segura
      await safeMessageEdit(message, embed, components);
    } else {
      // Criar nova mensagem
      message = await channel.send({
        embeds: [embed],
        components: components
      });

      // Atualizar ID da mensagem no ticket
      ticket.messageId = message.id;
      await ticket.save();
    }

    return message;

  } catch (error) {
    console.error('Erro ao atualizar embed:', error);
    throw error;
  }
}

// Função para atualizar embed de produto com informações de avaliação
async function updateProductEmbed(client, product) {
  try {
    if (!product || !product.ticketId || !product.optionId) {
      throw new Error('Produto inválido ou incompleto');
    }

    // Buscar o ticket relacionado ao produto
    const Ticket = require('../models/Ticket');
    const ticket = await Ticket.findOne({ messageId: product.ticketId });
    
    if (!ticket) {
      throw new Error('Ticket relacionado ao produto não encontrado');
    }

    // Buscar a mensagem no canal
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) {
      throw new Error('Canal do ticket não encontrado');
    }

    // Buscar a mensagem original
    const message = await channel.messages.fetch(ticket.messageId).catch(() => null);
    if (!message) {
      throw new Error('Mensagem do ticket não encontrada');
    }

    // Verificar se o produto está nas opções do menu
    if (ticket.embedSettings?.useMenu && ticket.embedSettings.menuOptions?.length > 0) {
      const optionIndex = ticket.embedSettings.menuOptions.findIndex(opt => opt.value === product.optionId);
      
      if (optionIndex !== -1) {
        // Atualizar a descrição com informações de avaliação se o produto tiver sido avaliado
        const option = ticket.embedSettings.menuOptions[optionIndex];
        const originalDesc = option.description || '';
        
        if (product.rating && product.rating.count > 0) {
          // Verificar se já existe informação de avaliação
          const hasRatingInfo = originalDesc.includes('⭐ Avaliação:');
          
          // Obter estilo de avaliação das configurações do ticket ou usar o padrão
          const ratingStyle = ticket.embedSettings?.ratingStyle || 'default';
          
          // Formatar a avaliação de acordo com o estilo escolhido
          const formattedRating = formatRating(product.rating.average, product.rating.count, ratingStyle);
          
          if (hasRatingInfo) {
            // Atualizar a informação existente - usar regex mais abrangente para capturar diferentes estilos
            ticket.embedSettings.menuOptions[optionIndex].description = 
              originalDesc.replace(/([⭐★☆].*?[aA]valiação:?.*?\(\d+.*?\)|[0-9.]+\/5.*?\(\d+.*?\))/g, formattedRating);
          } else {
            // Adicionar informação de avaliação
            ticket.embedSettings.menuOptions[optionIndex].description = 
              `${originalDesc}\n\n${formattedRating}`;
          }
          
          // Salvar as mudanças
          await ticket.save();
          
          // Atualizar a embed
          const embed = createProductEmbed(ticket);
          const components = createProductComponents(ticket);
          
          // Usar a função segura para preservar componentes caso necessário
          await safeMessageEdit(message, embed, components);
          
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Erro ao atualizar embed do produto:', error);
    return false;
  }
}

// Função para personalizar o formato de exibição das avaliações
function formatRating(average, count, style = 'default') {
  // Arredondar para uma casa decimal
  const rating = parseFloat(average).toFixed(1);
  
  // Diferentes estilos de exibição
  const styles = {
    default: `⭐ Avaliação: ${rating}/5 (${count} avaliações)`,
    clean: `${rating}/5 (${count})`,
    stars: '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating)) + ` (${count})`,
    emoji: `⭐ ${rating}/5 (${count} avaliações)`,
    detailed: `Avaliação: ${rating}/5 | Total de avaliações: ${count}`
  };
  
  return styles[style] || styles.default;
}

/**
 * Função para atualizar mensagens com segurança, preservando componentes
 * @param {Message} message - A mensagem do Discord a ser editada
 * @param {EmbedBuilder|Array} embeds - Uma embed ou array de embeds para atualizar
 * @param {Array} components - Componentes para usar (opcional - se não fornecido, mantém os existentes)
 * @param {Object} options - Opções adicionais de edição (opcional)
 * @returns {Promise<Message>} A mensagem editada
 */
async function safeMessageEdit(message, embeds, components = null, options = {}) {
  try {
    if (!message || !message.edit) {
      throw new Error('Mensagem inválida para edição');
    }

    // Garantir que embeds seja um array
    const embedsArray = Array.isArray(embeds) ? embeds : [embeds];
    
    // Se não foram fornecidos componentes, usar os existentes
    const finalComponents = components === null ? message.components : components;
    
    // Preparar as opções de edição
    const editOptions = {
      embeds: embedsArray,
      components: finalComponents,
      ...options
    };
    
    // Editar a mensagem preservando os componentes
    return await message.edit(editOptions);
  } catch (error) {
    console.error('Erro ao editar mensagem com segurança:', error);
    throw error;
  }
}

module.exports = {
  createProductEmbed,
  createProductComponents,
  updateProductEmbed,
  formatRating,
  safeMessageEdit
}; 