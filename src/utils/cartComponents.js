const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const cartManager = require('./cartManager');

class CartComponents {
  static createCartEmbed(cart) {
    const embed = new EmbedBuilder()
      .setTitle('🛒 Carrinho de Compras')
      .setColor('#4CAF50');

    if (cart.items.length === 0) {
      embed.setDescription('Seu carrinho está vazio.');
      return embed;
    }

    let description = '';
    cart.items.forEach(item => {
      description += `**${item.product.label}**\n`;
      description += `Quantidade: ${item.quantity}\n`;
      description += `Preço unitário: R$ ${item.product.price.toFixed(2)}\n`;
      description += `Subtotal: R$ ${(item.product.price * item.quantity).toFixed(2)}\n\n`;
    });

    description += `**Total: R$ ${cart.total.toFixed(2)}**\n`;

    if (cart.coupon) {
      description += `\nCupom aplicado: ${cart.coupon.name}\n`;
      if (cart.coupon.discountType === 'fixed') {
        description += `Desconto: R$ ${cart.coupon.discountValue.toFixed(2)}\n`;
      } else {
        description += `Desconto: ${cart.coupon.discountValue}%\n`;
      }
    }

    embed.setDescription(description);
    return embed;
  }

  static createCartButtons(cart) {
    const buttons = [];

    if (cart.items.length > 0) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('checkout_cart')
          .setLabel('Finalizar Compra')
          .setStyle(ButtonStyle.Success)
      );

      buttons.push(
        new ButtonBuilder()
          .setCustomId('clear_cart')
          .setLabel('Limpar Carrinho')
          .setStyle(ButtonStyle.Danger)
      );
    }

    if (!cart.coupon) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('apply_coupon')
          .setLabel('Aplicar Cupom')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('remove_coupon')
          .setLabel('Remover Cupom')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    return new ActionRowBuilder().addComponents(buttons);
  }

  static createCouponModal() {
    const modal = new ModalBuilder()
      .setCustomId('apply_coupon_modal')
      .setTitle('Aplicar Cupom');

    const couponInput = new TextInputBuilder()
      .setCustomId('coupon_code')
      .setLabel('Código do Cupom')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(couponInput);
    modal.addComponents(actionRow);
    return modal;
  }
}

module.exports = CartComponents; 