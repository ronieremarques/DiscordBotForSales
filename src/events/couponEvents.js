const { CouponManager } = require('../utils/couponManager');
const { CartManager } = require('../utils/cartManager');
const CouponComponents = require('../components/CouponComponents');
const CartComponents = require('../components/CartComponents');
const Sale = require('../models/Sale');
const Coupon = require('../models/Coupon');
const { SlashCommandBuilder, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');
const { safeMessageEdit } = require('../utils/embedUtils');

module.exports = async (client) => {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;
      
      const userId = interaction.user.id;
      
      // Verificar se é uma interação relacionada a cupons
      const isCouponInteraction = 
        (interaction.isButton() && (
          interaction.customId === 'view_coupons' || 
          interaction.customId === 'remove_coupon'
        )) ||
        (interaction.isStringSelectMenu() && interaction.customId === 'select_coupon') ||
        (interaction.isModalSubmit() && interaction.customId === 'apply_coupon_modal');
        
      if (!isCouponInteraction) return;
      
      // Lidar com o botão de ver cupons disponíveis
      if (interaction.isButton() && interaction.customId === 'view_coupons') {
        // Verificar se o usuário já tem um cupom aplicado
        const userCart = await CartManager.getCart(userId);
        
        // Buscar cupons disponíveis para o usuário, independente de ter cupom aplicado
        const availableCoupons = await CouponManager.getAvailableCoupons(userId);
        
        if (!availableCoupons || availableCoupons.length === 0) {
          return await interaction.reply({
            content: '❌ Não existem cupons disponíveis para você no momento.',
            ephemeral: true
          });
        }
        
        // Mostrar aviso se já tiver cupom aplicado
        let mensagem = '🎟️ Selecione um cupom para aplicar:';
        
        
        // Criar o menu de seleção de cupons
        const couponMenu = CouponComponents.createCouponSelectionMenu(availableCoupons);
        
        await interaction.reply({
          content: mensagem,
          components: [couponMenu],
          ephemeral: true
        });
      }
      
      // Lidar com a seleção de cupom no menu dropdown
      if (interaction.isStringSelectMenu() && interaction.customId === 'select_coupon') {
        const selectedCouponId = interaction.values[0];
        
        // Se não houver cupons disponíveis
        if (selectedCouponId === 'no_coupon') {
          return await interaction.reply({
            content: 'Não há cupons disponíveis para você no momento.',
            ephemeral: true
          });
        }
        
        // Buscar o cupom selecionado
        const coupon = await Coupon.findById(selectedCouponId);
        if (!coupon) {
          return await interaction.reply({
            content: '❌ Cupom não encontrado.',
            ephemeral: true
          });
        }
        
        // Buscar o carrinho do usuário
        const cart = await CartManager.getCart(userId);
        
        // Verificar se o carrinho está vazio
        if (!cart || !cart.items || cart.items.length === 0) {
          return await interaction.reply({
            content: '❌ Seu carrinho está vazio.',
            ephemeral: true
          });
        }
        
        // Calcular o valor total atual
        const cartValue = cart.total;
        
        // Validar os requisitos do cupom
        if (cartValue < coupon.minOrderValue) {
          return await interaction.reply({
            content: `❌ Valor mínimo para usar este cupom: R$ ${coupon.minOrderValue.toFixed(2)}`,
            ephemeral: true
          });
        }
        
        // Contar a quantidade total de itens
        const itemsCount = cart.items.reduce((count, item) => count + parseInt(item.quantity || 0), 0);
        if (itemsCount < coupon.minProducts) {
          return await interaction.reply({
            content: `❌ Quantidade mínima para usar este cupom: ${coupon.minProducts} produtos`,
            ephemeral: true
          });
        }
        
        // Verificar se o cupom expirou
        if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
          return await interaction.reply({
            content: '❌ Este cupom expirou.',
            ephemeral: true
          });
        }
        
        // Verificar se o cupom atingiu o limite de usos
        if (coupon.uses >= coupon.maxUses) {
          return await interaction.reply({
            content: '❌ Este cupom atingiu o limite de uso.',
            ephemeral: true
          });
        }
        
        // Verificar se o usuário é um cliente antigo (se o cupom exigir)
        if (coupon.onlyForPreviousCustomers) {
          const previousPurchases = await Sale.countDocuments({ userId });
          if (previousPurchases === 0) {
            return await interaction.reply({
              content: '❌ Este cupom é exclusivo para clientes que já realizaram compras anteriores.',
              ephemeral: true
            });
          }
        }
        
        // Verificar se já tem um cupom aplicado e qual era
        let mensagemAdicional = '';
        
        
        // Aplicar o cupom ao carrinho
        await CartManager.applyCoupon(userId, coupon);
        
        // Incrementar o uso do cupom
        coupon.uses += 1;
        await coupon.save();
        
        // Obter o carrinho atualizado
        const updatedCart = await CartManager.getCart(userId);
        
        // Calcular o desconto aplicado
        let discount = 0;
        if (coupon.discountType === 'percentage') {
          discount = cartValue * (coupon.discountValue / 100);
        } else {
          discount = Math.min(coupon.discountValue, cartValue);
        }
        
        // Atualizar a mensagem do carrinho
        await updateCartMessage(interaction, updatedCart);
        
        // Atualizar também os produtos adicionais
        await updateAdditionalProductsMessages(interaction, updatedCart);
        
        try {
          // Primeiro, reconhecer a interação para evitar erro de "Unknown interaction"
          await interaction.deferUpdate();
          
          // Depois enviar uma mensagem separada com a confirmação
          await interaction.channel.send({
            content: `✅ Cupom "${coupon.name}" aplicado com sucesso! Desconto: R$ ${discount.toFixed(2)}${mensagemAdicional}`,
            ephemeral: true
          });
        } catch (error) {
          console.error('Erro ao responder após aplicar cupom:', error);
          // Tentar enviar mensagem no canal como fallback
          try {
            await interaction.channel.send({
              content: `✅ Cupom "${coupon.name}" aplicado com sucesso! Desconto: R$ ${discount.toFixed(2)}${mensagemAdicional}`,
              ephemeral: true
            });
          } catch (secondError) {
            console.error('Erro também ao enviar mensagem no canal:', secondError);
          }
        }
      }
      
      // Lidar com o botão de remover cupom
      if (interaction.isButton() && interaction.customId === 'remove_coupon') {
        const cart = await CartManager.getCart(userId);
        
        if (!cart.coupon) {
          return await interaction.reply({
            content: '❌ Você não possui nenhum cupom aplicado.',
            ephemeral: true
          });
        }
        
        const removedCouponName = cart.coupon.name;
        
        // Remover o cupom
        await CartManager.removeCoupon(userId);
        
        // Atualizar a mensagem do carrinho
        const updatedCart = await CartManager.getCart(userId);
        await updateCartMessage(interaction, updatedCart);
        
        // Atualizar também os produtos adicionais
        await updateAdditionalProductsMessages(interaction, updatedCart);
        
        try {
          // Primeiro, reconhecer a interação para evitar erro de "Unknown interaction"
          await interaction.deferUpdate();
          
          // Depois enviar uma mensagem separada com a confirmação
          await interaction.channel.send({
            content: `✅ Cupom "${removedCouponName}" removido com sucesso!`,
            ephemeral: false
          });
        } catch (error) {
          console.error('Erro ao responder após remover cupom:', error);
          // Tentar enviar mensagem no canal como fallback
          try {
            await interaction.channel.send({
              content: `✅ Cupom "${removedCouponName}" removido com sucesso!`,
              ephemeral: false
            });
          } catch (secondError) {
            console.error('Erro também ao enviar mensagem no canal:', secondError);
          }
        }
      }
      
      // Lidar com o envio do modal de aplicação de cupom
      if (interaction.isModalSubmit() && interaction.customId === 'apply_coupon_modal') {
        const couponCode = interaction.fields.getTextInputValue('coupon_code');
        
        // Buscar o cupom pelo código
        const coupon = await Coupon.findOne({ 
          code: couponCode.toUpperCase(),
          active: true
        });
        
        if (!coupon) {
          return await interaction.reply({
            content: '❌ Cupom não encontrado ou inativo.',
            ephemeral: true
          });
        }
        
        // Buscar o carrinho do usuário
        const cart = await CartManager.getCart(userId);
        
        // Verificar se o carrinho está vazio
        if (!cart || !cart.items || cart.items.length === 0) {
          return await interaction.reply({
            content: '❌ Seu carrinho está vazio.',
            ephemeral: true
          });
        }
        
        // Calcular o valor total atual
        const cartValue = cart.total;
        
        // Validar os requisitos do cupom
        if (cartValue < coupon.minOrderValue) {
          return await interaction.reply({
            content: `❌ Valor mínimo para usar este cupom: R$ ${coupon.minOrderValue.toFixed(2)}`,
            ephemeral: true
          });
        }
        
        // Contar a quantidade total de itens
        const itemsCount = cart.items.reduce((count, item) => count + parseInt(item.quantity || 0), 0);
        if (itemsCount < coupon.minProducts) {
          return await interaction.reply({
            content: `❌ Quantidade mínima para usar este cupom: ${coupon.minProducts} produtos`,
            ephemeral: true
          });
        }
        
        // Verificar se o cupom expirou
        if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
          return await interaction.reply({
            content: '❌ Este cupom expirou.',
            ephemeral: true
          });
        }
        
        // Verificar se o cupom atingiu o limite de usos
        if (coupon.uses >= coupon.maxUses) {
          return await interaction.reply({
            content: '❌ Este cupom atingiu o limite de uso.',
            ephemeral: true
          });
        }
        
        // Verificar se o usuário é um cliente antigo (se o cupom exigir)
        if (coupon.onlyForPreviousCustomers) {
          const previousPurchases = await Sale.countDocuments({ userId });
          if (previousPurchases === 0) {
            return await interaction.reply({
              content: '❌ Este cupom é exclusivo para clientes que já realizaram compras anteriores.',
              ephemeral: true
            });
          }
        }
        
        // Aplicar o cupom ao carrinho
        await CartManager.applyCoupon(userId, coupon);
        
        // Incrementar o uso do cupom
        coupon.uses += 1;
        await coupon.save();
        
        // Obter o carrinho atualizado
        const updatedCart = await CartManager.getCart(userId);
        
        // Calcular o desconto aplicado
        let discount = 0;
        if (coupon.discountType === 'percentage') {
          discount = cartValue * (coupon.discountValue / 100);
        } else {
          discount = Math.min(coupon.discountValue, cartValue);
        }
        
        // Atualizar a mensagem do carrinho
        await updateCartMessage(interaction, updatedCart);
        
        return await interaction.reply({
          content: `✅ Cupom aplicado com sucesso! Desconto: R$ ${discount.toFixed(2)}`,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Erro ao processar ação de cupom:', error);
      
      // Enviar mensagem de erro apenas se a interação ainda não foi respondida
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar o cupom.',
          ephemeral: true
        });
      }
    }
  });
};

// Função auxiliar para atualizar a mensagem do carrinho
async function updateCartMessage(interaction, cart) {
  try {
    // Obter o ID do ticket do usuário
    const { Ticket } = require('../models');
    
    // Buscar o ticket por threadId (pode ser thread ou canal normal)
    let ticket = await Ticket.findOne({ 
      threadId: interaction.channel.id,
      status: { $ne: 'closed' } 
    });
    
    if (!ticket || !ticket.cart || !ticket.cart.messageId) {
      console.log('Não foi possível atualizar o carrinho: ticket ou ID da mensagem não encontrado');
      return;
    }
    
    try {
      const message = await interaction.channel.messages.fetch(ticket.cart.messageId);
      
      if (message) {
        const embed = CartComponents.createCartEmbed(cart, cart.coupon);
        const buttons = CartComponents.createCartButtons(cart, !!cart.coupon);
        
        await message.edit({
          embeds: [embed],
          components: buttons
        });
      }
    } catch (fetchError) {
      if (fetchError.code === 10008) { // Unknown Message error
        console.log(`Mensagem do carrinho não encontrada (ID: ${ticket.cart.messageId}). Criando nova mensagem.`);
        
        // Remover o ID de mensagem inválido do ticket
        ticket.cart.messageId = null;
        await ticket.save();
        
        // Enviar nova mensagem do carrinho
        const embed = CartComponents.createCartEmbed(cart, cart.coupon);
        const buttons = CartComponents.createCartButtons(cart, !!cart.coupon);
        
        const newMessage = await interaction.channel.send({
          content: `Carrinho de ${interaction.user}:`,
          embeds: [embed],
          components: buttons
        });
        
        // Atualizar o ID da mensagem no ticket
        ticket.cart.messageId = newMessage.id;
        await ticket.save();
      } else {
        // Outro tipo de erro
        throw fetchError;
      }
    }
    
    // Também atualizar produtos adicionais
    await updateAdditionalProductsMessages(interaction, cart);
    
  } catch (error) {
    console.error('Erro ao atualizar mensagem do carrinho:', error);
  }
}

// Função para atualizar as mensagens dos produtos adicionais
async function updateAdditionalProductsMessages(interaction, cart) {
  try {
    // Buscar os produtos adicionais do carrinho
    const additionalProducts = cart.items.filter(item => !item.isMainProduct && item.relatedToMain);
    
    if (additionalProducts.length === 0) return;
    
    // Buscar as últimas 20 mensagens do canal
    const messages = await interaction.channel.messages.fetch({ limit: 20 });
    
    // Para cada produto adicional
    for (const item of additionalProducts) {
      // Procurar mensagens com botões que tenham o customId relacionado ao produto
      const productMessages = messages.filter(msg => 
        msg.components?.length > 0 && 
        msg.components[0].components?.some(comp => 
          comp.customId?.includes(`_${item.productId}`)
        )
      );
      
      if (productMessages.size > 0) {
        // Pegar o modelo do produto e a quantidade
        const Product = require('../models/Product');
        const product = await Product.findOne({ optionId: item.productId });
        
        if (!product) continue;
        
        // Para cada mensagem encontrada
        for (const [_, message] of productMessages) {
          try {
            const embed = CartComponents.createAdditionalProductEmbed(
              product,
              item.quantity
            );
            
            // Usar somente os botões de controle de quantidade, sem botões de cupom
            const buttons = CartComponents.createAdditionalProductButtons(
              item.productId,
              item.quantity,
              product.stock || 1
            );
            
            // Usar a função segura para garantir que os componentes sejam preservados
            await safeMessageEdit(message, embed, buttons);
            
            console.log(`Mensagem de produto adicional ${item.productId} atualizada (sem botões de cupom)`);
          } catch (error) {
            console.error(`Erro ao atualizar mensagem do produto adicional ${item.productId}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro ao atualizar mensagens de produtos adicionais:', error);
  }
} 