const Cart = require('../models/Cart');
const Coupon = require('../models/Coupon');
const CouponManager = require('./couponManager');

class CartManager {
  static async getCart(userId) {
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
      await cart.save();
    }
    return cart;
  }

  static async addItem(userId, product) {
    const cart = await this.getCart(userId);
    const existingItem = cart.items.find(item => item.productId === product.id);

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.items.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1
      });
    }

    await this.updateCartTotals(cart);
    return cart;
  }

  static async removeItem(userId, productId) {
    const cart = await this.getCart(userId);
    cart.items = cart.items.filter(item => item.productId !== productId);
    await this.updateCartTotals(cart);
    return cart;
  }

  static async updateQuantity(userId, productId, quantity) {
    const cart = await this.getCart(userId);
    const item = cart.items.find(item => item.productId === productId);

    if (item) {
      item.quantity = quantity;
      await this.updateCartTotals(cart);
    }

    return cart;
  }

  static async clearCart(userId) {
    const cart = await this.getCart(userId);
    cart.items = [];
    cart.coupon = null;
    cart.total = 0;
    cart.discount = 0;
    cart.finalTotal = 0;
    await cart.save();
    return cart;
  }

  static async applyCoupon(userId, coupon) {
    const cart = await this.getCart(userId);
    cart.coupon = {
      code: coupon.code,
      name: coupon.name,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue
    };
    await this.updateCartTotals(cart);
    return cart;
  }

  static async removeCoupon(userId) {
    const cart = await this.getCart(userId);
    cart.coupon = null;
    await this.updateCartTotals(cart);
    return cart;
  }

  static async updateCartTotals(cart) {
    cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    if (cart.coupon) {
      if (cart.coupon.discountType === 'percentage') {
        cart.discount = (cart.total * cart.coupon.discountValue) / 100;
      } else {
        cart.discount = cart.coupon.discountValue;
      }
    } else {
      cart.discount = 0;
    }

    cart.finalTotal = cart.total - cart.discount;
    cart.updatedAt = new Date();
    await cart.save();
  }
}

module.exports = { CartManager }; 