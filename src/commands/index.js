const fs = require('fs');
const path = require('path');

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