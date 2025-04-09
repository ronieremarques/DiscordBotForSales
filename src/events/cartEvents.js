const { Events } = require('discord.js');
const { CartManager } = require('../utils/cartManager');
const CartComponents = require('../components/CartComponents');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    const cart = await CartManager.getCart(userId);

    switch (interaction.customId) {
      case 'checkout':
        await handleCheckout(interaction, cart);
        break;
      case 'clear_cart':
        await handleClearCart(interaction, userId);
        break;
      case 'apply_coupon':
        if (cart.coupon) {
          await handleRemoveCoupon(interaction, userId);
        } else {
          const modal = CartComponents.createCouponModal();
          await interaction.showModal(modal);
        }
        break;
    }
  }
};

async function handleCheckout(interaction, cart) {
  if (cart.items.length === 0) {
    await interaction.reply({
      content: '❌ Seu carrinho está vazio!',
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: '✅ Processando seu pedido...',
    ephemeral: true
  });
}

async function handleClearCart(interaction, userId) {
  await CartManager.clearCart(userId);
  await interaction.reply({
    content: '🗑️ Carrinho limpo com sucesso!',
    ephemeral: true
  });
}

async function handleRemoveCoupon(interaction, userId) {
  await CartManager.removeCoupon(userId);
  const updatedCart = await CartManager.getCart(userId);
  
  const embed = CartComponents.createCartEmbed(updatedCart);
  const buttons = CartComponents.createCartButtons(updatedCart);

  await interaction.reply({
    content: '✅ Cupom removido com sucesso!',
    embeds: [embed],
    components: [buttons],
    ephemeral: true
  });
} 