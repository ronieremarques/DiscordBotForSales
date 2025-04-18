const fs = require('fs');
const path = require('path');

const commands = [];

// Carregar comandos da pasta raiz
const commandFiles = fs.readdirSync(path.join(__dirname)).filter(file => file.endsWith('.js') && file !== 'index.js');

for (const file of commandFiles) {
  const command = require(`./${file}`);
  commands.push(command.data.toJSON());
}

// Carregar comandos de admin
const adminCommands = require('./admin');
for (const command of adminCommands) {
  commands.push(command.data.toJSON());
}

module.exports = commands;
