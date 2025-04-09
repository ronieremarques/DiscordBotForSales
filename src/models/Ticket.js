const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String },
  threadId: { type: String },
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
    }]
  },
  buttonSettings: {
    style: { type: String, default: 'Primary' }, // Primary, Success, Secondary, Danger
    label: { type: String, default: 'Abrir Ticket' },
    emoji: { type: String }
  },
  status: { type: String, enum: ['pending', 'open', 'closed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  ticketType: { type: String, enum: ['normal', 'vendas'], default: 'normal' },
  deliveryChannel: { type: String }, // Canal para mensagens de entrega
<<<<<<< HEAD
  reviewChannelId: { type: String }, // Canal para avaliações
=======
>>>>>>> 587a21fa4de200a431d667a698036466d22210be
  deliveryStatus: {
    delivered: { type: Boolean, default: false },
    proofImage: { type: String },
    deliveryImage: { type: String },
    buyerId: { type: String },
    sellerId: { type: String }
  },
<<<<<<< HEAD
  selectedOption: { type: String }, // Add this field
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
=======
  selectedOption: { type: String } // Add this field
>>>>>>> 587a21fa4de200a431d667a698036466d22210be
});

module.exports = mongoose.model('Ticket', ticketSchema);