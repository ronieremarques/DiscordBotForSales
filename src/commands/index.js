const fs = require('fs');
const path = require('path');

<<<<<<< HEAD
const commands = [];
const commandFiles = fs.readdirSync(path.join(__dirname)).filter(file => file.endsWith('.js') && file !== 'index.js');

for (const file of commandFiles) {
  const command = require(`./${file}`);
  commands.push(command.data.toJSON());
}

module.exports = commands;
=======
module.exports = (client) => {
    
  const commandsPath = path.join(__dirname);
  const commandFolders = fs.readdirSync(commandsPath).filter(folder => 
    fs.statSync(path.join(commandsPath, folder)).isDirectory()
  );

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = require(filePath);

      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
      } else {
        console.log(`[AVISO] O comando em ${filePath} está faltando uma propriedade "data" ou "execute"`);
      }
    }
  }
};
>>>>>>> 587a21fa4de200a431d667a698036466d22210be
