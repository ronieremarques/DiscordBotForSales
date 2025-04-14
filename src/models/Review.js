const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  productId: { type: String, required: true },
  purchaseId: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5 },
  description: { type: String },
  purchaseQuantity: { type: Number },
  purchasePrice: { type: Number },
  reviewMessageId: { type: String },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', reviewSchema); 