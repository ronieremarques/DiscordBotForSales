const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  salesChannel: { type: String }, // Mantido para vendas
  voiceChannel: { type: String }, // Novo campo para canal de voz
  pixKey: { type: String }, // Novo campo para chave PIX
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Config', configSchema);