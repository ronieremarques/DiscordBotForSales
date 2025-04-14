const Coupon = require('../models/Coupon');
const CouponImageGenerator = require('./couponImageGenerator');
const Cart = require('../models/Cart');
const Sale = require('../models/Sale');
const { CartManager } = require('./cartManager');

class CouponManager {
  static async createCoupon(data) {
    const coupon = new Coupon(data);
    await coupon.save();
    return coupon;
  }

  static async getCoupon(code) {
    return await Coupon.findOne({ code });
  }

  static async getCouponByCode(code) {
    return await Coupon.findOne({ code: code.toUpperCase() });
  }

  static async getCouponsByCreator(creatorId) {
    return await Coupon.find({ creatorId });
  }

  static async updateCoupon(code, data) {
    const coupon = await this.getCouponByCode(code);
    
    if (coupon.creatorId !== data.creatorId) {
      throw new Error('Você não tem permissão para editar este cupom');
    }

    Object.assign(coupon, data);
    await coupon.save();
    return coupon;
  }

  static async deleteCoupon(code) {
    const coupon = await this.getCouponByCode(code);
    await coupon.deleteOne();
  }

  static async listCoupons(creatorId) {
    return await Coupon.find({ creatorId });
  }

  static async validateCoupon(code, orderValue, productCount) {
    const coupon = await this.getCouponByCode(code);

    if (!coupon.active) {
      throw new Error('Este cupom está inativo');
    }

    if (coupon.uses >= coupon.maxUses) {
      throw new Error('Este cupom atingiu o limite de uso');
    }

    if (orderValue < coupon.minOrderValue) {
      throw new Error(`Valor mínimo do pedido: R$ ${coupon.minOrderValue}`);
    }

    if (productCount < coupon.minProducts) {
      throw new Error(`Quantidade mínima de produtos: ${coupon.minProducts}`);
    }

    return coupon;
  }

  static async applyCoupon(code, orderValue) {
    const coupon = await this.getCouponByCode(code);
    
    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = orderValue * (coupon.discountValue / 100);
    } else {
      discount = coupon.discountValue;
    }

    coupon.uses += 1;
    await coupon.save();

    return {
      discount,
      finalValue: orderValue - discount
    };
  }

  static async generateCouponImage(coupon) {
    try {
      return await CouponImageGenerator.generateCouponImage(coupon);
    } catch (error) {
      throw new Error(`Erro ao gerar imagem do cupom: ${error.message}`);
    }
  }

  static async getLatestCouponByUser(userId) {
    try {
      return await Coupon.findOne({ createdBy: userId })
        .sort({ createdAt: -1 })
        .limit(1);
    } catch (error) {
      throw new Error(`Erro ao buscar cupom: ${error.message}`);
    }
  }

  static async getAvailableCoupons(userId) {
    try {
      // Importar os módulos localmente para evitar dependência circular
      const Coupon = require('../models/Coupon');
      const Sale = require('../models/Sale');
      const Cart = require('../models/Cart');
      
      // Verificar se o usuário é um cliente antigo (já fez uma compra)
      const previousPurchases = await Sale.countDocuments({ userId });
      const isFirstPurchase = previousPurchases === 0;
      
      // Buscar o carrinho do usuário diretamente
      const cart = await Cart.findOne({ userId });
      
      // Verificar se há itens no carrinho
      if (!cart || !cart.items || cart.items.length === 0) {
        return []; // Sem itens no carrinho, nenhum cupom disponível
      }
      
      // Calcular o valor total do carrinho
      const cartValue = cart.total || 0;
      
      // Contar a quantidade total de itens
      const itemsCount = cart.items.reduce((count, item) => count + parseInt(item.quantity || 0), 0);
      
      // Buscar todos os cupons ativos
      const allCoupons = await Coupon.find({ active: true });
      
      // Filtrar apenas os cupons que atendem aos requisitos do usuário
      const availableCoupons = allCoupons.filter(coupon => {
        // Verificar se o cupom tem limite de uso
        if (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses) {
          return false;
        }
        
        // Verificar se o cupom expirou
        if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
          return false;
        }
        
        // Verificar valor mínimo de compra
        if (cartValue < coupon.minOrderValue) {
          return false;
        }
        
        // Verificar quantidade mínima de produtos
        if (itemsCount < coupon.minProducts) {
          return false;
        }
        
        // Verificar se o cupom é apenas para clientes anteriores
        if (coupon.onlyForPreviousCustomers && isFirstPurchase) {
          return false;
        }
        
        return true;
      });
      
      return availableCoupons;
    } catch (error) {
      console.error('Erro ao obter cupons disponíveis:', error);
      return [];
    }
  }
}

module.exports = { CouponManager }; 