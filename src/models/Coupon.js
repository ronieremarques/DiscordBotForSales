const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  maxUses: {
    type: Number,
    required: true,
    min: 1
  },
  uses: {
    type: Number,
    default: 0
  },
  minOrderValue: {
    type: Number,
    required: true,
    min: 0
  },
  minProducts: {
    type: Number,
    required: true,
    min: 1
  },
  active: {
    type: Boolean,
    default: true
  },
  creatorId: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date
  },
  onlyForPreviousCustomers: {
    type: Boolean,
    default: false
  },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }] // Produtos específicos que o cupom pode ser aplicado
});

module.exports = mongoose.model('Coupon', couponSchema); 