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
<<<<<<< HEAD
  createdAt: { type: Date, default: Date.now },
  stockNotifications: [{ type: String }], // Array de IDs de usuários para notificar quando repor estoque
  totalSales: { type: Number, default: 0 } // Total de vendas do produto
=======
  createdAt: { type: Date, default: Date.now }
>>>>>>> 587a21fa4de200a431d667a698036466d22210be
});

module.exports = mongoose.model('Product', productSchema);