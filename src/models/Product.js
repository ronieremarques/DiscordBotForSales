const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  ticketId: { type: String, required: true },
  optionId: { type: String, required: true },
  label: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true },
  description: { type: String },
  emoji: { type: String },
  originalDescription: { type: String }, // Template da descrição
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);