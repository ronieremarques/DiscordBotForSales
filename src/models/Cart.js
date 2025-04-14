const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    items: [{
        productId: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        isMainProduct: {
            type: Boolean,
            default: false
        },
        relatedToMain: {
            type: String,
            default: null  // ID do produto principal ao qual este adicional está relacionado
        }
    }],
    coupon: {
        code: String,
        name: String,
        discountType: String,
        discountValue: Number
    },
    total: {
        type: Number,
        default: 0
    },
    discount: {
        type: Number,
        default: 0
    },
    finalTotal: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Cart', cartSchema); 