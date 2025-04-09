const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

class CartComponents {
  static createCartEmbed(cart, coupon = null) {
    const embed = new EmbedBuilder()
      .setTitle('🛒 Carrinho de Compras')
      .setColor('#2F3136');

    if (cart.items.length === 0) {
      embed.setDescription('Seu carrinho está vazio.');
      return embed;
    }

    let total = 0;
    let description = '';

    cart.items.forEach(item => {
      const itemTotal = item.price * item.quantity;
      total += itemTotal;
      description += `\n${item.quantity}x ${item.name} - R$ ${itemTotal.toFixed(2)}`;
    });

    if (coupon) {
      let discount = 0;
      if (coupon.discountType === 'fixed') {
        discount = coupon.discountValue;
      } else {
        discount = total * (coupon.discountValue / 100);
      }
      total -= discount;
      description += `\n\n💳 Cupom: ${coupon.name}`;
      description += `\n💰 Desconto: R$ ${discount.toFixed(2)}`;
    }

    description += `\n\n💵 Total: R$ ${total.toFixed(2)}`;
    embed.setDescription(description);

    return embed;
  }

  static createCartButtons(cart, hasCoupon = false) {
    const row = new ActionRowBuilder();

    if (cart.items.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('checkout')
          .setLabel('Finalizar Compra')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('clear_cart')
          .setLabel('Limpar Carrinho')
          .setStyle(ButtonStyle.Danger)
      );
    }

    if (cart.items.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('apply_coupon')
          .setLabel(hasCoupon ? 'Remover Cupom' : 'Aplicar Cupom')
          .setStyle(hasCoupon ? ButtonStyle.Danger : ButtonStyle.Primary)
      );
    }

    return row;
  }

  static createCouponSelectMenu(coupons) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_coupon')
      .setPlaceholder('Selecione um cupom');

    coupons.forEach(coupon => {
      let discountText = '';
      if (coupon.discountType === 'fixed') {
        discountText = `R$ ${coupon.discountValue.toFixed(2)}`;
      } else {
        discountText = `${coupon.discountValue}%`;
      }

      selectMenu.addOptions({
        label: coupon.name,
        description: `Desconto: ${discountText} | Mínimo: R$ ${coupon.minOrderValue.toFixed(2)}`,
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