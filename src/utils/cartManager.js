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

  static async addItem(userId, product, isMainProduct = false, relatedToMain = null) {
    // Validar o objeto do produto
    if (!product || typeof product !== 'object') {
      throw new Error('Produto inválido');
    }

    // Garantir que os valores do produto são válidos
    const validProduct = {
      id: product.id || '',
      name: product.name || 'Produto',
      price: parseFloat(product.price) || 0,
    };

    // Verificar se o preço é válido
    if (isNaN(validProduct.price)) {
      validProduct.price = 0;
    }

    const cart = await this.getCart(userId);
    const existingItem = cart.items.find(item => item.productId === validProduct.id);

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.items.push({
        productId: validProduct.id,
        name: validProduct.name,
        price: validProduct.price,
        quantity: 1,
        isMainProduct,
        relatedToMain
      });
    }

    await this.updateCartTotals(cart);
    return cart;
  }

  static async addAdditionalProduct(userId, mainProductId, additionalProduct) {
    // Validar o objeto do produto adicional
    if (!additionalProduct || typeof additionalProduct !== 'object') {
      throw new Error('Produto adicional inválido');
    }

    // Garantir que os valores do produto são válidos
    const validProduct = {
      id: additionalProduct.id || '',
      name: additionalProduct.name || 'Produto Adicional',
      price: parseFloat(additionalProduct.price) || 0,
    };

    // Verificar se o preço é válido
    if (isNaN(validProduct.price)) {
      validProduct.price = 0;
    }

    const cart = await this.getCart(userId);
    
    // Verificar se o produto principal existe no carrinho
    const mainProduct = cart.items.find(item => item.productId === mainProductId);
    if (!mainProduct) {
      throw new Error('Produto principal não encontrado no carrinho');
    }

    // Verificar se já existe este produto adicional para o produto principal
    const existingAdditional = cart.items.find(
      item => item.productId === validProduct.id && item.relatedToMain === mainProductId
    );

    if (existingAdditional) {
      existingAdditional.quantity += 1;
    } else {
      cart.items.push({
        productId: validProduct.id,
        name: validProduct.name,
        price: validProduct.price,
        quantity: 1,
        isMainProduct: false,
        relatedToMain: mainProductId
      });
    }

    await this.updateCartTotals(cart);
    return cart;
  }

  static async removeItem(userId, productId) {
    const cart = await this.getCart(userId);
    
    // Se for um produto principal, remover também todos os produtos adicionais relacionados
    const isMainProduct = cart.items.find(item => item.productId === productId && 
      (item.isMainProduct || !item.relatedToMain));
    
    if (isMainProduct) {
      // Remover produto principal e todos os produtos adicionais relacionados
      cart.items = cart.items.filter(item => 
        item.productId !== productId && item.relatedToMain !== productId
      );
    } else {
      // Remover apenas o produto adicional específico
      cart.items = cart.items.filter(item => item.productId !== productId);
    }
    
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

  static async getAdditionalProducts(userId, mainProductId) {
    const cart = await this.getCart(userId);
    return cart.items.filter(item => item.relatedToMain === mainProductId);
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
    
    if (!coupon) {
      throw new Error('Cupom inválido');
    }
    
    // Verificar se os campos necessários existem
    const couponName = coupon.name || coupon.code || 'Cupom de Desconto';
    
    // Aplicar o cupom ao carrinho
    cart.coupon = {
      code: coupon.code,
      name: couponName,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue
    };
    
    // Calcular o desconto e o total final
    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = cart.total * (coupon.discountValue / 100);
    } else {
      discount = Math.min(coupon.discountValue, cart.total);
    }
    
    cart.discount = parseFloat(discount.toFixed(2));
    cart.finalTotal = parseFloat((cart.total - discount).toFixed(2));
    
    // Salvar o carrinho atualizado
    cart.updatedAt = new Date();
    await cart.save();
    
    return cart;
  }

  static async removeCoupon(userId) {
    const cart = await this.getCart(userId);
    cart.coupon = null;
    await this.updateCartTotals(cart);
    return cart;
  }

  static async updateCartTotals(cart) {
    // Verificar se há itens no carrinho
    if (!cart.items || cart.items.length === 0) {
      cart.total = 0;
      cart.discount = 0;
      cart.finalTotal = 0;
      cart.updatedAt = new Date();
      await cart.save();
      return;
    }

    // Calcular o total com verificação de valores para TODOS os itens
    // sem filtrar por tipo de produto (principal ou adicional)
    cart.total = 0;
    
    // Loop por todos os itens para soma
    for (const item of cart.items) {
      const price = parseFloat(item.price) || 0;
      const quantity = parseInt(item.quantity) || 0;
      const itemTotal = price * quantity;
      
      // Adicionar ao total apenas se for um valor válido
      if (!isNaN(itemTotal) && itemTotal > 0) {
        cart.total += itemTotal;
      }
    }
    
    // Garantir que total é um número válido
    if (isNaN(cart.total)) {
      cart.total = 0;
    }
    
    // Calcular desconto se houver cupom
    if (cart.coupon) {
      if (cart.coupon.discountType === 'percentage') {
        const percentage = parseFloat(cart.coupon.discountValue) || 0;
        cart.discount = (cart.total * percentage) / 100;
      } else {
        cart.discount = parseFloat(cart.coupon.discountValue) || 0;
      }
      
      // Limitar o desconto ao valor total
      cart.discount = Math.min(cart.discount, cart.total);
    } else {
      cart.discount = 0;
    }
    
    // Garantir que discount é um número válido
    if (isNaN(cart.discount)) {
      cart.discount = 0;
    }

    // Calcular valor final com verificação
    cart.finalTotal = Math.max(0, cart.total - cart.discount);
    
    // Garantir que finalTotal é um número válido
    if (isNaN(cart.finalTotal)) {
      cart.finalTotal = 0;
    }
    
    // Registrar os detalhes para debug
    console.log(`Carrinho atualizado: Total=${cart.total}, Desconto=${cart.discount}, Final=${cart.finalTotal}`);
    console.log(`Itens no carrinho: ${cart.items.length}`);
    cart.items.forEach((item, index) => {
      console.log(`Item ${index+1}: ${item.name} - ${item.quantity}x R$${item.price} = R$${item.quantity * item.price}`);
    });
    
    cart.updatedAt = new Date();
    await cart.save();
  }
}

module.exports = { CartManager }; 