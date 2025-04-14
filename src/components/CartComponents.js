const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

class CartComponents {
  static createCartEmbed(cart, coupon = null) {
    const embed = new EmbedBuilder()
      .setTitle('🛒 Carrinho de Compras')
      .setColor('#2F3136');

    if (!cart || !cart.items || cart.items.length === 0) {
      embed.setDescription('Seu carrinho está vazio.');
      return embed;
    }

    let description = '';

    // Separar produtos principais e adicionais
    const mainProducts = cart.items.filter(item => item.isMainProduct || !item.relatedToMain);
    
    mainProducts.forEach(item => {
      // Validar preço e quantidade
      const price = parseFloat(item.price) || 0;
      const quantity = parseInt(item.quantity) || 0;
      const itemTotal = price * quantity;
      
      const itemTotalFormatted = isNaN(itemTotal) ? '0.00' : itemTotal.toFixed(2);
      description += `\n${quantity}x ${item.name} - R$ ${itemTotalFormatted}`;
    });

    // Verificar se há produtos adicionais
    const additionalProducts = cart.items.filter(item => !item.isMainProduct && item.relatedToMain);
    if (additionalProducts.length > 0) {
      description += '\n\n🔍 **Itens adicionais:**';
      additionalProducts.forEach(item => {
        // Validar preço e quantidade
        const price = parseFloat(item.price) || 0;
        const quantity = parseInt(item.quantity) || 0;
        const itemTotal = price * quantity;
        
        const itemTotalFormatted = isNaN(itemTotal) ? '0.00' : itemTotal.toFixed(2);
        description += `\n${quantity}x ${item.name} - R$ ${itemTotalFormatted}`;
      });
    }

    // Usar os valores já calculados no carrinho
    let total = parseFloat(cart.total) || 0;
    let finalTotal = parseFloat(cart.finalTotal) || total;
    
    // Adicionar informações de cupom, se houver
    if (cart.coupon) {
      // Garantir que o nome do cupom nunca seja undefined
      const couponName = cart.coupon.name === 'undefined' || !cart.coupon.name ? 
        (cart.coupon.code || 'Cupom de Desconto') : cart.coupon.name;
      
      description += `\n\n🎟️ Cupom: ${couponName}`;
      
      const discount = parseFloat(cart.discount) || 0;
      description += `\n💰 Desconto: R$ ${discount.toFixed(2)}`;
      
      // Já estamos usando o valor de finalTotal do carrinho, que é calculado corretamente no cartManager
    }
    
    description += `\n\nOlá, para finalizar sua compra por favor siga esse passo a passo:\n
1. Clique no botão Finalizar para copiar a chave pix
2. Realize o pagamento
3. Envie o comprovante neste canal
4. Aguarde a validação do pagamento`;
description += `\n# TOTAL: R$ ${finalTotal.toFixed(2)}`;

description += `\n\n-# NÃO SE ESQUEÇA DE ENVIAR O COMPROVANTE!`;

    embed.setDescription(description);
    
    return embed;
  }

  static createCartButtons(cart, hasCoupon = false) {
    // Criamos múltiplas linhas para distribuir os botões
    const row1 = new ActionRowBuilder(); // Para controle de quantidade e finalização
    const row2 = new ActionRowBuilder(); // Para cupons
    
    let buttons = [];

    // Validar o carrinho
    const hasItems = cart && cart.items && cart.items.length > 0;

    if (hasItems) {
      // Encontrar o produto principal (se houver)
      const mainProduct = cart.items.find(item => item.isMainProduct);
      
      // Primeira linha: Controles de quantidade e finalização
      if (mainProduct) {
        row1.addComponents(
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
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId('checkout')
          .setLabel('Finalizar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('clear_cart')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
      );
      
      // Segunda linha: Botões de cupom (agora apenas um botão principal)
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId('view_coupons')
          .setLabel('Ver Cupons Disponíveis')
          .setStyle(ButtonStyle.Primary)
      );
      
      // Adicionar botão para remover cupom se já tiver um aplicado
      if (hasCoupon) {
        row2.addComponents(
          new ButtonBuilder()
            .setCustomId('remove_coupon')
            .setLabel('Remover Cupom')
            .setStyle(ButtonStyle.Danger)
        );
      }
      
      // Adicionar as linhas ao array de componentes
      buttons.push(row1, row2);
    } else {
      // Se o carrinho estiver vazio, mostrar apenas um botão para ir para o menu
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId('view_menu')
          .setLabel('Ver Menu')
          .setStyle(ButtonStyle.Primary)
      );
      
      buttons.push(row1);
    }
    
    return buttons;
  }

  static createAdditionalProductEmbed(product, quantity) {
    // Validar os dados do produto e quantidade
    if (!product) {
      product = { name: 'Produto', price: 0, description: 'Produto adicional' };
    }
    
    // Garantir que o preço e a quantidade são números válidos
    const price = parseFloat(product.price) || 0;
    const qty = parseInt(quantity) || 1;
    const subtotal = price * qty;

    // Formatar valores para exibição
    const priceFormatted = isNaN(price) ? '0.00' : price.toFixed(2);
    const subtotalFormatted = isNaN(subtotal) ? '0.00' : subtotal.toFixed(2);
    
    const embed = new EmbedBuilder()
      .setTitle(`🛍️ ${product.name || 'Produto'}`)
      .setColor('#3498DB')
      .setDescription(`${product.description || 'Produto adicional para sua compra'}`)
      .addFields(
        { name: 'Preço unitário', value: `R$ ${priceFormatted}`, inline: true },
        { name: 'Quantidade', value: `${qty}`, inline: true },
        { name: 'Subtotal', value: `R$ ${subtotalFormatted}`, inline: true }
      );
    
    return embed;
  }

  static createAdditionalProductButtons(productId, quantity, maxStock, hasCoupon = false) {
    const row1 = new ActionRowBuilder();

    // Primeira linha: botões de quantidade e remoção
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`decrease_${productId}`)
        .setLabel('-1')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(quantity <= 1),
      new ButtonBuilder()
        .setCustomId(`increase_${productId}`)
        .setLabel('+1')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(quantity >= maxStock),
      new ButtonBuilder()
        .setCustomId(`remove_${productId}`)
        .setLabel('Remover')
        .setStyle(ButtonStyle.Danger)
    );
    
    // Retornando apenas uma linha com os botões de controle de quantidade
    return [row1];
  }

  static createCouponSelectMenu(coupons, isFirstPurchase = false, cartValue = 0, itemsCount = 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_coupon')
      .setPlaceholder('Selecione um cupom');

    // Filtrar os cupons com base nos requisitos do usuário
    const availableCoupons = coupons.filter(coupon => {
      // Verificar se o cupom é apenas para clientes antigos
      if (coupon.onlyForPreviousCustomers && isFirstPurchase) {
        return false;
      }
      
      // Verificar valor mínimo
      if (coupon.minOrderValue > cartValue) {
        return false;
      }
      
      // Verificar quantidade mínima de produtos
      if (coupon.minProducts > itemsCount) {
        return false;
      }
      
      // Verificar se o cupom expirou
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return false;
      }
      
      // Verificar se o cupom ainda tem usos disponíveis
      if (coupon.uses >= coupon.maxUses) {
        return false;
      }
      
      return coupon.active;
    });

    if (availableCoupons.length === 0) {
      selectMenu.addOptions({
        label: 'Nenhum cupom disponível',
        description: 'Não há cupons disponíveis para você no momento',
        value: 'no_coupon'
      });
      return new ActionRowBuilder().addComponents(selectMenu);
    }

    availableCoupons.forEach(coupon => {
      let discountText = '';
      if (coupon.discountType === 'fixed') {
        discountText = `R$ ${coupon.discountValue.toFixed(2)}`;
      } else {
        discountText = `${coupon.discountValue}%`;
      }

      const description = coupon.onlyForPreviousCustomers 
        ? `${discountText} | Apenas clientes antigos | Mínimo: R$ ${coupon.minOrderValue.toFixed(2)}`
        : `${discountText} | Mínimo: R$ ${coupon.minOrderValue.toFixed(2)}`;

      selectMenu.addOptions({
        label: coupon.name,
        description: description,
        value: coupon._id.toString()
      });
    });

    return new ActionRowBuilder().addComponents(selectMenu);
  }

  static createCouponModal() {
    const modal = new ModalBuilder()
      .setCustomId('apply_coupon_modal')
      .setTitle('Aplicar Cupom de Desconto');

    const couponInput = new TextInputBuilder()
      .setCustomId('coupon_code')
      .setLabel('Código do Cupom')
      .setPlaceholder('Digite o código do cupom')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(couponInput);
    modal.addComponents(actionRow);
    
    return modal;
  }
}

module.exports = CartComponents; 