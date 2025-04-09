const Coupon = require('../models/Coupon');
const CouponImageGenerator = require('./couponImageGenerator');
const Cart = require('../models/Cart');

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
}

module.exports = { CouponManager }; 