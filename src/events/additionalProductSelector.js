const { Events, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Product = require('../models/Product');
const Ticket = require('../models/Ticket');
const { CartManager } = require('../utils/cartManager');
const CartComponents = require('../components/CartComponents');
const { safeMessageEdit } = require('../utils/embedUtils');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    try {
      if (interaction.customId === 'additional_products') {
        // Verificar se é uma interação de menu de seleção para produtos adicionais
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'additional_products') {
          return;
        }

        const selectedProductId = interaction.values[0];
        const userId = interaction.user.id;

        // Verificar se estamos em um canal de ticket (thread ou canal normal em categoria)
        // 1. Primeiro buscar tickets por threadId (antigo comportamento)
        let ticket = await Ticket.findOne({ threadId: interaction.channel.id });
        
        // 2. Se não for encontrado e não for thread, pode ser um canal normal
        if (!ticket && !interaction.channel.isThread()) {
          ticket = await Ticket.findOne({ threadId: interaction.channel.id, categoryId: { $exists: true } });
        }
        
        if (!ticket) {
          await interaction.reply({
            content: '❌ Este comando só pode ser usado em canais de ticket.',
            ephemeral: true
          });
          return;
        }

        // Verificar se há um produto principal no carrinho
        if (!ticket.cart || !ticket.cart.productId) {
          await interaction.reply({
            content: '❌ Adicione um produto principal antes de adicionar produtos adicionais.',
            ephemeral: true
          });
          return;
        }
        
        // Verificar se o produto selecionado é o produto principal
        if (selectedProductId === ticket.cart.productId) {
          await interaction.reply({
            content: '⚠️ Este é o produto principal do seu carrinho. Você pode ajustar a quantidade utilizando os botões +1/-1 que aparecem na mensagem do produto.',
            ephemeral: true
          });
          return;
        }

        // Buscar informações do produto adicional
        const additionalProduct = await Product.findOne({ 
          optionId: selectedProductId 
        });

        if (!additionalProduct) {
          await interaction.reply({
            content: '❌ Produto adicional não encontrado.',
            ephemeral: true
          });
          return;
        }

        // Adicionar o produto adicional ao carrinho
        try {
          // Verificar e validar os dados do produto
          const productData = {
            id: additionalProduct.optionId || '',
            name: additionalProduct.label || 'Produto Adicional',
            price: parseFloat(additionalProduct.price) || 0
          };

          // Verificar se o preço é um número válido
          if (isNaN(productData.price)) {
            productData.price = 0;
          }

          await CartManager.addAdditionalProduct(userId, ticket.cart.productId, productData);

          // Buscar o carrinho atualizado
          const cart = await CartManager.getCart(userId);
          const addedProduct = cart.items.find(item => item.productId === selectedProductId);

          if (!addedProduct) {
            throw new Error('Produto não foi adicionado ao carrinho corretamente');
          }

          // Criar uma embed para o produto adicional
          const embed = CartComponents.createAdditionalProductEmbed(
            {
              ...additionalProduct.toObject(),
              price: productData.price // Usar o preço validado
            },
            addedProduct.quantity
          );

          // Criar botões para gerenciar o produto adicional
          const buttons = CartComponents.createAdditionalProductButtons(
            additionalProduct.optionId,
            addedProduct.quantity,
            additionalProduct.stock || 1
          );

          // Atualizar a mensagem principal do carrinho
          await updateMainCartMessage(interaction, userId, ticket);

          // Remover a mensagem do menu de seleção após adicionar o produto
          if (interaction.message) {
            try {
              await interaction.message.delete();
            } catch (error) {
              console.error('Erro ao remover mensagem do menu:', error);
            }
          }

          // Encontrar e remover outras mensagens de produtos adicionais
          try {
            const messages = await interaction.channel.messages.fetch({ limit: 20 });
            const additionalProductsMessages = messages.filter(msg => 
              msg.content.includes('produtos adicionais disponíveis:') || 
              msg.content.includes('Mais produtos adicionais disponíveis:')
            );
            
            // Remover as mensagens antigas
            for (const [_, msg] of additionalProductsMessages) {
              await msg.delete().catch(err => console.error('Erro ao remover mensagem antiga:', err));
            }
          } catch (error) {
            console.error('Erro ao buscar mensagens de produtos adicionais:', error);
          }

          // Enviar uma mensagem separada para o produto adicional
          await interaction.reply({
            embeds: [embed],
            components: buttons // buttons já é um array de ActionRow
          });
          
          // Enviar novamente o menu de produtos adicionais disponíveis, excluindo o que acabou de ser adicionado
          await sendUpdatedAdditionalProductsMenu(interaction, ticket, additionalProduct.optionId);
        } catch (error) {
          console.error('Erro ao adicionar produto ao carrinho:', error);
          await interaction.reply({
            content: '❌ Ocorreu um erro ao adicionar o produto adicional ao carrinho.',
            ephemeral: true
          });
        }
      } else if (interaction.customId === 'additional_products_more') {
        // Extrair a página atual da mensagem
        const currentPage = parseInt(interaction.message.components[0].components[0].placeholder.match(/Página (\d+)/)[1]) - 1;
        const ticket = await Ticket.findOne({ threadId: interaction.channel.id });
        
        if (ticket) {
          await sendUpdatedAdditionalProductsMenu(interaction, ticket, null, currentPage + 1);
          await interaction.message.delete();
        }
      } else if (interaction.customId === 'additional_products_reset') {
        const ticket = await Ticket.findOne({ threadId: interaction.channel.id });
        
        if (ticket) {
          await sendUpdatedAdditionalProductsMenu(interaction, ticket, null, 0);
          await interaction.message.delete();
        }
      }
    } catch (error) {
      console.error('Erro ao processar interação:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar sua solicitação.',
        ephemeral: true
      });
    }
  }
};

// Função auxiliar para criar botões de navegação
function createNavigationButtons(currentPage, totalPages) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder();

  // Botão para voltar ao início
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('additional_products_reset')
      .setLabel('Voltar ao Início')
      .setStyle(ButtonStyle.Secondary)
  );

  // Botão para carregar mais produtos
  if (currentPage < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('additional_products_more')
        .setLabel('Carregar Mais')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return row;
}

// Função para criar menu de produtos com paginação
async function createAdditionalProductsMenu(mainProductId, userId, page = 0) {
  try {
    // Limitar para 25 produtos por página, conforme o limite do Discord
    const PRODUCTS_PER_PAGE = 25;
    let addedProductIds = [];
    addedProductIds.push(mainProductId);
    
    if (userId) {
      const cart = await CartManager.getCart(userId);
      const additionalInCart = cart.items
        .filter(item => item.relatedToMain === mainProductId)
        .map(item => item.productId);
      addedProductIds = [...addedProductIds, ...additionalInCart];
    }
    
    const allAdditionalProducts = await Product.find({
      stock: { $gt: 0 }
    });
    
    const additionalProducts = allAdditionalProducts.filter(
      product => !addedProductIds.includes(product.optionId)
    );

    if (!additionalProducts || additionalProducts.length === 0) {
      return null;
    }

    const totalPages = Math.ceil(additionalProducts.length / PRODUCTS_PER_PAGE);
    const startIndex = page * PRODUCTS_PER_PAGE;
    const endIndex = startIndex + PRODUCTS_PER_PAGE;
    const currentProducts = additionalProducts.slice(startIndex, endIndex);

    if (currentProducts.length === 0) {
      return null;
    }

    // Limitar o número de opções no menu para no máximo 25 (limite do Discord)
    const productsToShow = currentProducts.slice(0, 25);
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('additional_products')
      .setPlaceholder(`Selecione produtos adicionais (Página ${page + 1}/${totalPages})`);

    // Adicionar as opções ao menu
    productsToShow.forEach(product => {
      const price = parseFloat(product.price) || 0;
      const formattedPrice = isNaN(price) ? '0.00' : price.toFixed(2);
      const shortDesc = (product.description || 'Produto adicional').substring(0, 50);
      
      selectMenu.addOptions({
        label: product.label || 'Produto',
        description: `R$ ${formattedPrice} - ${shortDesc}`,
        value: product.optionId,
        emoji: product.emoji || '🛒'
      });
    });

    // Criar o menu row com o menu de seleção
    const menuRow = new ActionRowBuilder().addComponents(selectMenu);
    
    // Criar os botões de navegação em uma row separada
    const navigationRow = createNavigationButtons(page, totalPages);
    
    // Array para armazenar os componentes finais
    const components = [];
    
    // Adicionar o menu row se tiver opções
    if (selectMenu.options?.length > 0) {
      components.push(menuRow);
    }
    
    // Adicionar a row de navegação se tiver componentes
    if (navigationRow.components.length > 0) {
      components.push(navigationRow);
    }
    
    // Se não houver componentes, retornar null
    if (components.length === 0) {
      return null;
    }

    // Retornar os componentes para serem utilizados
    return components;
  } catch (error) {
    console.error('Erro ao criar menu de produtos adicionais:', error);
    return null;
  }
}

// Função para enviar menu atualizado com paginação
async function sendUpdatedAdditionalProductsMenu(interaction, ticket, excludeProductId, page = 0) {
  try {
    const cart = await CartManager.getCart(interaction.user.id);
    const addedProductIds = cart.items
      .filter(item => item.relatedToMain === ticket.cart.productId)
      .map(item => item.productId);
    
    addedProductIds.push(ticket.cart.productId);
    if (excludeProductId) {
      addedProductIds.push(excludeProductId);
    }
    
    const additionalProducts = await Product.find({
      stock: { $gt: 0 }
    });
    
    const availableProducts = additionalProducts.filter(
      product => !addedProductIds.includes(product.optionId)
    );
    
    if (availableProducts.length === 0) {
      return;
    }

    const PRODUCTS_PER_PAGE = 25;
    const totalPages = Math.ceil(availableProducts.length / PRODUCTS_PER_PAGE);
    const startIndex = page * PRODUCTS_PER_PAGE;
    const endIndex = startIndex + PRODUCTS_PER_PAGE;
    const currentProducts = availableProducts.slice(startIndex, endIndex);

    if (currentProducts.length === 0) {
      return;
    }

    // Limitar o número de opções no menu para no máximo 25 (limite do Discord)
    const productsToShow = currentProducts.slice(0, 25);
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('additional_products')
      .setPlaceholder(`Selecione produtos adicionais (Página ${page + 1}/${totalPages})`);
    
    // Adicionar as opções ao menu
    productsToShow.forEach(product => {
      const price = parseFloat(product.price) || 0;
      const formattedPrice = isNaN(price) ? '0.00' : price.toFixed(2);
      const shortDesc = (product.description || 'Produto adicional').substring(0, 50);
      
      selectMenu.addOptions({
        label: product.label || 'Produto',
        description: `R$ ${formattedPrice} - ${shortDesc}`,
        value: product.optionId,
        emoji: product.emoji || '🛒'
      });
    });

    // Criar o menu row com o menu de seleção
    const menuRow = new ActionRowBuilder().addComponents(selectMenu);
    
    // Criar os botões de navegação em uma row separada
    const navigationRow = createNavigationButtons(page, totalPages);
    
    // Array para armazenar os componentes finais
    const components = [];
    
    // Adicionar o menu row se tiver opções
    if (selectMenu.options?.length > 0) {
      components.push(menuRow);
    }
    
    // Adicionar a row de navegação se tiver componentes
    if (navigationRow.components.length > 0) {
      components.push(navigationRow);
    }
    
    // Se não houver componentes, não enviar mensagem
    if (components.length === 0) {
      return;
    }
    
    await interaction.channel.send({
      content: '🔥 **Mais produtos adicionais disponíveis:**\n-# Clique no menu abaixo para ver todos os produtos que temos disponíveis para você comprar.',
      components: components
    });
  } catch (error) {
    console.error('Erro ao atualizar menu de produtos adicionais:', error);
  }
}

async function updateMainCartMessage(interaction, userId, ticket) {
  try {
    const cart = await CartManager.getCart(userId);
    
    // Verificar se a mensagem do carrinho existe
    if (ticket.cart && ticket.cart.messageId) {
      const message = await interaction.channel.messages.fetch(ticket.cart.messageId);
      
      if (message) {
        const embed = CartComponents.createCartEmbed(cart, cart.coupon);
        const buttons = CartComponents.createCartButtons(cart, !!cart.coupon);
        
        // Usar a função segura para preservar componentes
        await safeMessageEdit(message, embed, buttons);
      }
    }
  } catch (error) {
    console.error('Erro ao atualizar mensagem do carrinho:', error);
  }
}

module.exports.createAdditionalProductsMenu = createAdditionalProductsMenu; 