const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Product = require('../models/Product');
const Ticket = require('../models/Ticket');
const { CartManager } = require('../utils/cartManager');
const CartComponents = require('../components/CartComponents');
const { createAdditionalProductsMenu } = require('./additionalProductSelector');
const { safeMessageEdit } = require('../utils/embedUtils');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    // Verificar se o botão é relacionado a um produto principal ou adicional
    if (!interaction.customId.startsWith('increase_') && 
        !interaction.customId.startsWith('decrease_') && 
        !interaction.customId.startsWith('remove_')) {
      return;
    }

    try {
      // Extrair o ID do produto e a ação
      const parts = interaction.customId.split('_');
      const action = parts[0];
      const productId = parts.slice(1).join('_'); // Para caso o ID contenha underscores

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

      // Buscar o carrinho do usuário
      const userId = interaction.user.id;
      const cart = await CartManager.getCart(userId);

      // Verificar se o produto é o produto principal do ticket
      const isMainProduct = ticket.cart && ticket.cart.productId === productId;

      // Encontrar o produto no carrinho
      const productInCart = cart.items.find(item => item.productId === productId);
      if (!productInCart) {
        await interaction.reply({
          content: '❌ Produto não encontrado no carrinho.',
          ephemeral: true
        });
        return;
      }

      // Buscar informações do produto na base de dados
      const product = await Product.findOne({ 
        optionId: productId 
      });

      if (!product) {
        await interaction.reply({
          content: '❌ Produto não encontrado na base de dados.',
          ephemeral: true
        });
        return;
      }

      // Executar a ação apropriada
      switch (action) {
        case 'increase':
          // Verificar estoque
          if (productInCart.quantity < product.stock) {
            await CartManager.updateQuantity(userId, productId, productInCart.quantity + 1);
            
            // Se for o produto principal, atualizar o ticket também
            if (isMainProduct) {
              ticket.cart.quantity = productInCart.quantity + 1;
              ticket.cart.totalPrice = product.price * (productInCart.quantity + 1);
              await ticket.save();
            }
          }
          break;
        case 'decrease':
          if (productInCart.quantity > 1) {
            await CartManager.updateQuantity(userId, productId, productInCart.quantity - 1);
            
            // Se for o produto principal, atualizar o ticket também
            if (isMainProduct) {
              ticket.cart.quantity = productInCart.quantity - 1;
              ticket.cart.totalPrice = product.price * (productInCart.quantity - 1);
              await ticket.save();
            }
          }
          break;
        case 'remove':
          // Para produtos principais, não permitir remover, apenas diminuir a quantidade
          if (isMainProduct) {
            await interaction.reply({
              content: '❌ Não é possível remover o produto principal. Utilize o botão de diminuir quantidade.',
              ephemeral: true
            });
            return;
          }
          
          await CartManager.removeItem(userId, productId);
          
          // Remover a mensagem do produto adicional
          try {
            if (interaction.message) {
              await interaction.message.delete();
            }
          } catch (error) {
            console.error('Erro ao remover mensagem do produto:', error);
          }
          
          // Atualizar a mensagem principal do carrinho
          await updateMainCartMessage(interaction, userId, ticket);
          
          // Enviar confirmação
          await interaction.reply({
            content: '✅ Produto removido do carrinho!',
            ephemeral: true
          });
          
          // Encontrar e remover a mensagem antiga de produtos adicionais disponíveis
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
          
          // Verificar se há mais produtos adicionais disponíveis e mostrar o menu novamente
          const additionalProductsMenu = await createAdditionalProductsMenu(ticket.cart.productId, userId);
          
          if (additionalProductsMenu) {
            await interaction.channel.send({
              content: '🔥 **Mais produtos adicionais disponíveis:**\n-# Clique no menu abaixo para ver todos os produtos que temos disponíveis para você comprar.',
              components: additionalProductsMenu
            });
          }
          
          return; // Sair da função, pois já respondemos
      }

      // Buscar o carrinho atualizado
      const updatedCart = await CartManager.getCart(userId);
      const updatedProductInCart = updatedCart.items.find(item => item.productId === productId);

      // Se for produto principal, atualizar a mensagem principal
      if (isMainProduct) {
        await updateMainCartMessage(interaction, userId, ticket);
        await interaction.deferUpdate(); // Apenas reconhecer a interação sem enviar resposta
        return;
      }
      
      // Se o produto ainda existe no carrinho, atualizar a embed
      if (updatedProductInCart) {
        const embed = CartComponents.createAdditionalProductEmbed(
          product,
          updatedProductInCart.quantity
        );
        
        // Usar somente os botões de controle de quantidade, sem botões de cupom
        const buttons = CartComponents.createAdditionalProductButtons(
          productId,
          updatedProductInCart.quantity,
          product.stock
        );
        
        // Atualizar a mensagem usando a função segura
        await safeMessageEdit(interaction.message, embed, buttons);
      }

      // Atualizar a mensagem principal do carrinho
      await updateMainCartMessage(interaction, userId, ticket);

    } catch (error) {
      console.error('Erro ao processar interação de produto:', error);
      
      // Verificar se a interação já foi respondida antes de tentar responder novamente
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: '❌ Ocorreu um erro ao processar sua solicitação.',
            ephemeral: true
          });
        } catch (replyError) {
          // Se mesmo assim falhar, apenas log do erro
          console.error('Não foi possível responder à interação:', replyError);
        }
      }
    }
  }
};

async function updateMainCartMessage(interaction, userId, ticket) {
  try {
    const cart = await CartManager.getCart(userId);
    
    // Verificar se a mensagem do carrinho existe
    if (ticket.cart && ticket.cart.messageId) {
      try {
        const message = await interaction.channel.messages.fetch(ticket.cart.messageId);
        
        if (message) {
          // Criar embed e botões para a mensagem principal
          const embed = CartComponents.createCartEmbed(cart, cart.coupon);
          
          // Garantir que os botões de cupom estejam na mensagem principal
          const quantityAndButtons = new ActionRowBuilder();
          
          // Encontrar o produto principal
          const mainProduct = cart.items.find(item => item.isMainProduct);
          if (mainProduct) {
            quantityAndButtons.addComponents(
              new ButtonBuilder()
                .setCustomId(`decrease_${mainProduct.productId}`)
                .setLabel('-1')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(mainProduct.quantity <= 1),
              new ButtonBuilder()
                .setCustomId(`increase_${mainProduct.productId}`)
                .setLabel('+1')
                .setStyle(ButtonStyle.Secondary)
            );
          }
          
          // Adicionar botões de finalizar e cancelar
          quantityAndButtons.addComponents(
            new ButtonBuilder()
              .setCustomId('checkout')
              .setLabel('Finalizar')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('close_ticket')
              .setLabel('Cancelar')
              .setStyle(ButtonStyle.Danger)
          );
          
          // Criar botões para cupons
          const cupomButtons = new ActionRowBuilder();
          cupomButtons.addComponents(
            new ButtonBuilder()
              .setCustomId('view_coupons')
              .setLabel('Ver Cupons Disponíveis')
              .setStyle(ButtonStyle.Primary)
          );
          
          // Adicionar botão para remover cupom se já tiver um aplicado
          if (cart.coupon) {
            cupomButtons.addComponents(
              new ButtonBuilder()
                .setCustomId('remove_coupon')
                .setLabel('Remover Cupom')
                .setStyle(ButtonStyle.Danger)
            );
          }
          
          // Atualizar a mensagem usando a função segura
          await safeMessageEdit(message, embed, [
            quantityAndButtons,
            cupomButtons
          ]);
          
          console.log('Mensagem principal do carrinho atualizada com sucesso, incluindo botões de cupom');
        }
      } catch (fetchError) {
        if (fetchError.code === 10008) { // Unknown Message error
          console.log(`Mensagem do carrinho não encontrada (ID: ${ticket.cart.messageId}). Criando nova mensagem.`);
          
          // Remover o ID de mensagem inválido do ticket
          ticket.cart.messageId = null;
          await ticket.save();
          
          // Enviar nova mensagem do carrinho
          const embed = CartComponents.createCartEmbed(cart, cart.coupon);
          
          // Criar linhas de botões
          const quantityAndButtons = new ActionRowBuilder();
          
          // Encontrar o produto principal
          const mainProduct = cart.items.find(item => item.isMainProduct);
          if (mainProduct) {
            quantityAndButtons.addComponents(
              new ButtonBuilder()
                .setCustomId(`decrease_${mainProduct.productId}`)
                .setLabel('-1')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(mainProduct.quantity <= 1),
              new ButtonBuilder()
                .setCustomId(`increase_${mainProduct.productId}`)
                .setLabel('+1')
                .setStyle(ButtonStyle.Secondary)
            );
          }
          
          // Adicionar botões de finalizar e cancelar
          quantityAndButtons.addComponents(
            new ButtonBuilder()
              .setCustomId('checkout')
              .setLabel('Finalizar')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('close_ticket')
              .setLabel('Cancelar')
              .setStyle(ButtonStyle.Danger)
          );
          
          // Criar botões para cupons
          const cupomButtons = new ActionRowBuilder();
          cupomButtons.addComponents(
            new ButtonBuilder()
              .setCustomId('view_coupons')
              .setLabel('Ver Cupons Disponíveis')
              .setStyle(ButtonStyle.Primary)
          );
          
          // Adicionar botão para remover cupom se já tiver um aplicado
          if (cart.coupon) {
            cupomButtons.addComponents(
              new ButtonBuilder()
                .setCustomId('remove_coupon')
                .setLabel('Remover Cupom')
                .setStyle(ButtonStyle.Danger)
            );
          }
          
          const newMessage = await interaction.channel.send({
            content: `Carrinho de ${interaction.user}:`,
            embeds: [embed],
            components: [quantityAndButtons, cupomButtons]
          });
          
          // Atualizar o ID da mensagem no ticket
          ticket.cart.messageId = newMessage.id;
          await ticket.save();
        } else {
          // Outro tipo de erro
          throw fetchError;
        }
      }
    }
  } catch (error) {
    console.error('Erro ao atualizar mensagem do carrinho:', error);
  }
} 