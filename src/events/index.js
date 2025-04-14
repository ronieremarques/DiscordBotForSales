const fs = require('fs');
const path = require('path');

module.exports = (client) => {
  const eventsPath = path.join(__dirname);
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js') && file !== 'index.js');

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    // Registrar o evento apenas se tiver o método 'execute'
    if (event && typeof event.execute === 'function') {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
    } else {
      console.warn(`O evento ${file} não possui método execute válido.`);
    }
  }

  // Registrar manipuladores específicos para eventos especiais
  const additionalProductEvents = require('./additionalProductEvents');
  const additionalProductSelector = require('./additionalProductSelector');
  const productSelectHandler = require('./productSelectHandler');
  const couponEvents = require('./couponEvents');
  const couponWizardHandler = require('./couponWizardHandler');
  const buttonHandler = require('./buttonHandler');
  const modalHandler = require('./modalHandler');
  
  if (!client.listenerCount(additionalProductEvents.name)) {
    client.on(additionalProductEvents.name, (...args) => additionalProductEvents.execute(...args));
  }
  
  if (!client.listenerCount(additionalProductSelector.name)) {
    client.on(additionalProductSelector.name, (...args) => additionalProductSelector.execute(...args));
  }
  
  if (!client.listenerCount(productSelectHandler.name)) {
    client.on(productSelectHandler.name, (...args) => productSelectHandler.execute(...args));
  }
  
  // Registrar os manipuladores de botões e modais
  if (!client.listenerCount(buttonHandler.name)) {
    client.on(buttonHandler.name, (...args) => buttonHandler.execute(...args));
  }
  
  if (!client.listenerCount(modalHandler.name)) {
    client.on(modalHandler.name, (...args) => modalHandler.execute(...args));
  }
  
  // Registrar o evento de cupons
  couponEvents(client);
  
  // Registrar o manipulador do assistente de cupons
  couponWizardHandler(client);

  console.log(`Eventos carregados: ${eventFiles.length + 7}`);
};