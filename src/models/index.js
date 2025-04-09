const mongoose = require('mongoose');
const Product = require('./Product');
const Sale = require('./Sale');
const Ticket = require('./Ticket');
const Config = require('./Config');
const Coupon = require('./Coupon');
const Review = require('./Review');

async function connectDB(uri) {
  try {
    await mongoose.connect(uri);
    console.log('✅ Conectado ao MongoDB com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao conectar ao MongoDB:', error.message);
    process.exit(1);
  }
}

module.exports = { 
  connectDB,
  Product,
  Sale,
  Ticket,
  Config,
  Coupon,
  Review
};
