const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String },
  threadId: { type: String },
  categoryId: { type: String }, // Nova categoria para criar canais de carrinho
  userId: { type: String, required: true },
  embedSettings: {
    title: { type: String, default: 'Sistema de Tickets' },
    description: { type: String, default: 'Clique no botão abaixo para abrir um ticket.' },
    color: { type: String, default: '#5865F2' },
    pixKey: { type: String },
    image: { type: String }, // Adicionado campo para imagem
    stock: { type: String }, // Add this for storing JSON stock data
    useMenu: { type: Boolean, default: false },
    menuPlaceholder: { type: String },
    menuOptions: [{
      label: String,
      emoji: String, 
      description: String,
      value: String
    }],
    ratingStyle: { type: String, default: 'default' },
    mercadoPagoToken: { type: String } // Token de acesso do Mercado Pago
  },
  buttonSettings: {
    style: { type: String, default: 'Primary' }, // Primary, Success, Secondary, Danger
    label: { type: String, default: 'Abrir Ticket' },
    emoji: { type: String }
  },
  status: { type: String, enum: ['pending', 'open', 'closed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  ticketType: { type: String, enum: ['normal', 'vendas', 'vendas_auto'], default: 'normal' },
  deliveryChannel: { type: String }, // Canal para mensagens de entrega
  reviewChannelId: { type: String }, // Canal para avaliações
  deliveryStatus: {
    delivered: { type: Boolean, default: false },
    proofImage: { type: String },
    deliveryImage: { type: String },
    buyerId: { type: String },
    sellerId: { type: String },
    paidAmount: { type: Number } // Valor identificado no comprovante
  },
  selectedOption: { type: String },
  cart: {
    productId: { type: String },
    quantity: { type: Number, default: 1 },
    messageId: { type: String }, // ID da mensagem do carrinho para atualização
    totalPrice: { type: Number },
    coupon: {
      code: { type: String },
      name: { type: String },
      discountType: { type: String },
      discountValue: { type: Number },
      discount: { type: Number }
    }
  }
});

module.exports = mongoose.model('Ticket', ticketSchema);