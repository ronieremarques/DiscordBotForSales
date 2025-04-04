const { Events } = require('discord.js');
const Config = require('../models/Config');
const config = require('../config');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'config_select') return;

    // Verificar se é o dono
    if (interaction.user.id !== config.ownerId) {
      return interaction.reply({
        content: '❌ Apenas o dono pode configurar o bot!',
        ephemeral: true
      });
    }

    await interaction.deferUpdate()

    const selectedOption = interaction.values[0];
    const guildId = interaction.guild.id;

    // Responder com instruções para selecionar canal/categoria
    if (selectedOption === 'sales_channel') {
      await interaction.followUp({
        content: 'Por favor, mencione o canal de vendas ou envie o ID do canal. Exemplo: `#canal-de-vendas` ou `123456789012345678`',
        ephemeral: true
      });
    } else if (selectedOption === 'cart_category') {
      await interaction.followUp({
        content: 'Por favor, mencione a categoria para carrinhos ou envie o ID. Exemplo: `Carrinhos` ou `123456789012345678`',
        ephemeral: true
      });
    }

    // Coletor de mensagens para pegar a resposta
    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async m => {
      const content = m.content;
      let id = content;

      // Extrair ID se foi mencionado
      const mentionMatch = content.match(/<#(\d+)>|(\d+)/);
      if (mentionMatch) {
        id = mentionMatch[1] || mentionMatch[2];
      }

      // Verificar se é um ID válido
      if (!/^\d+$/.test(id)) {
        return interaction.followUp({
          content: '❌ ID inválido. Por favor, tente novamente.',
          ephemeral: true
        });
      }

      try {
        // Atualizar configuração
        await Config.findOneAndUpdate(
          { guildId },
          { 
            [selectedOption === 'sales_channel' ? 'salesChannel' : 'cartCategory']: id 
          },
          { upsert: true, new: true }
        );

        await interaction.followUp({
          content: `✅ Configuração atualizada com sucesso!`,
          ephemeral: true
        });
      } catch (error) {
        console.error(error);
        await interaction.followUp({
          content: '❌ Ocorreu um erro ao salvar a configuração.',
          ephemeral: true
        });
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.followUp({
          content: '❌ Tempo esgotado. Por favor, tente novamente.',
          ephemeral: true
        });
      }
    });
  }
};