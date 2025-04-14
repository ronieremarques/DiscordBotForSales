const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  salesChannel: { type: String }, 
  voiceChannel: { type: String }, 
  pixKey: { type: String },
  salesCount: { type: Number, default: 0 }, // Add sales counter
  buyerRoleId: { type: String }, // Cargo a ser dado aos compradores
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Config', configSchema);