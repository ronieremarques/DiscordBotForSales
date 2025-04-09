require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST } = require('discord.js');
const { Routes } = require('discord-api-types/v10');
const path = require('path');
const fs = require('fs');
const { connectDB } = require('./src/models');
const config = require('./src/config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

require('./src/events')(client);

client.commands = new Collection();

async function loadCommands() {
  const commandsPath = path.join(__dirname, 'src', 'commands');
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
      }
    }
  }
}

async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(config.token);
    const commands = [];

    // Carrega todos os comandos recursivamente
    const loadCommands = (dir) => {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          loadCommands(fullPath);
        } else if (file.endsWith('.js')) {
          const command = require(fullPath);
          if (command.data && typeof command.execute === 'function') {
            commands.push(command.data.toJSON());
          }
        }
      }
    };

    loadCommands(path.join(__dirname, 'src', 'commands'));

    // Verificação adicional
    commands.forEach(cmd => {
      if (cmd.options) {
        let hasOptional = false;
        cmd.options.forEach((opt, i) => {
          if (opt.required === false) {
            hasOptional = true;
          } else if (hasOptional && opt.required) {
            console.error(`❌ Comando ${cmd.name}: Opção obrigatória "${opt.name}" após opção não-obrigatória`);
            throw new Error(`Invalid command options order in ${cmd.name}`);
          }
        });
      }
    });

    console.log(`⌛ Registrando ${commands.length} comandos...`);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Comandos registrados com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error.message);
  }
}

// index.js (trecho relevante)
client.on('interactionCreate', async interaction => {
<<<<<<< HEAD
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      await command.execute(interaction);
    } 
    // Adicionar handler para botões e menus do comando melhores
    else if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const melhoresCommand = client.commands.get('melhores');
      if (melhoresCommand) {
        await melhoresCommand.handleInteraction(interaction);
      }
    }
  } catch (error) {
    console.error(error);
    const errorMessage = {
      content: '❌ Ocorreu um erro ao executar este comando!',
      ephemeral: true
    };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
=======
  if (!interaction.isChatInputCommand()) return;
  
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: '❌ Ocorreu um erro ao executar este comando!',
      ephemeral: true
    });
>>>>>>> 587a21fa4de200a431d667a698036466d22210be
  }
});

async function startBot() {
  try {
    await connectDB(config.mongoURI);
    await loadCommands();

    client.once('ready', async () => {
      console.log(`🤖 Logado como ${client.user.tag}`);
      await registerCommands();
    });

    await client.login(config.token);
  } catch (error) {
    console.error('Falha ao iniciar o bot:', error);
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  console.error('❌ Exceção não capturada:', error);
});

startBot();