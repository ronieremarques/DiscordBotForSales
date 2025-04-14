const { Client, Collection, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const commands = require('./commands');
const { checkScheduledChannels } = require('./utils/channelCloser');
const { setupAllChannelTimers } = require('./utils/channelTimerManager');
const Channel = require('./models/Channel');
const configEmbed = require('./events/ConfigEmbed');
const paymentValidation = require('./events/paymentValidation');
const reviewHandler = require('./events/ReviewHandler');
const paymentStatus = require('./events/paymentStatus');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();

// Carregar comandos
for (const command of commands) {
  client.commands.set(command.name, require(`./commands/${command.name}`));
}

// Carregar eventos
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

client.on(Events.InteractionCreate, async interaction => {
  try {
    await configEmbed.execute(interaction);
    await paymentValidation.execute(interaction);
    await reviewHandler.execute(interaction);
    await paymentStatus.execute(interaction);
  } catch (error) {
    console.error('Erro ao processar interação:', error);
  }
});

// Conectar ao MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Conectado ao MongoDB');
    
    // Iniciar o bot após conexão com MongoDB
    return client.login(process.env.TOKEN);
  })
  .then(() => {
    console.log(`Bot ${client.user.tag} iniciado com sucesso!`);
    
    // Event Handlers
    const registerEvents = require('./events/index');
    const setupCouponWizardHandler = require('./events/couponWizardHandler');
    
    registerEvents(client);
    setupCouponWizardHandler(client);
    
    // Configurar temporizadores precisos para todos os canais agendados
    console.log('[INICIO] Configurando temporizadores precisos para fechamento de canais...');
    
    // Esperar 3 segundos para garantir que tudo está pronto
    setTimeout(async () => {
      try {
        // Configurar temporizadores precisos para cada canal agendado
        await setupAllChannelTimers(client);
        
        // Verificar canais que possam ter sido perdidos durante o período offline
        await checkScheduledChannels(client);
        
        console.log('[INICIO] Sistema de fechamento de canais iniciado com sucesso!');
        
        // Configurar verificação periódica de backup (a cada 5 minutos)
        // Isso serve apenas como redundância para os temporizadores precisos
        const BACKUP_CHECK_INTERVAL = 300000; // 5 minutos
        
        const backupInterval = setInterval(async () => {
          console.log('[BACKUP] Executando verificação periódica de backup');
          try {
            await checkScheduledChannels(client);
          } catch (error) {
            console.error('[BACKUP] Erro na verificação de backup:', error);
          }
        }, BACKUP_CHECK_INTERVAL);
        
        // Armazenar para referência
        client.channelBackupInterval = backupInterval;
        
      } catch (error) {
        console.error('[INICIO] Erro ao configurar temporizadores:', error);
      }
    }, 3000);
  })
  .catch(err => console.error('Erro durante a inicialização:', err));

// Adicionar gerenciamento de erros para não interromper o bot
process.on('uncaughtException', (error) => {
  console.error('ERRO NÃO TRATADO:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('PROMISE REJEITADA NÃO TRATADA:', error);
}); 