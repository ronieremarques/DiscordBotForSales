const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Sale = require('../../models/Sale');
const { createCanvas, loadImage } = require('canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');
const fs = require('fs');

// Lista de efeitos disponíveis para o GIF
const effects = [
  'rainbow', 'pulse', 'glow', 'sparkle', 'wave'
];

// Função para gerar GIF personalizado
async function generateThankYouGif(user, totalSpent, effect) {
  const canvas = createCanvas(500, 500);
  const ctx = canvas.getContext('2d');
  
  // Configurar o GIF
  const encoder = new GIFEncoder(500, 500);
  const stream = encoder.createReadStream();
  encoder.start();
  encoder.setRepeat(0); // Repetir infinitamente
  encoder.setDelay(100); // 100ms entre frames
  encoder.setQuality(10); // Qualidade do GIF

  // Carregar avatar do usuário
  const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
  
  // Gerar frames do GIF baseado no efeito
  const frames = 30;
  for (let i = 0; i < frames; i++) {
    // Salvar o estado do canvas
    ctx.save();
    
    // Limpar canvas
    ctx.fillStyle = '#2C2F33';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Aplicar efeito baseado no tipo
    switch(effect) {
      case 'rainbow':
        ctx.fillStyle = `hsl(${(i * 360 / frames) % 360}, 100%, 50%)`;
        break;
      case 'pulse':
        const scale = 1 + Math.sin(i * 0.2) * 0.1;
        ctx.scale(scale, scale);
        break;
      case 'glow':
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 10 + Math.sin(i * 0.2) * 5;
        break;
      case 'sparkle':
        // Adicionar partículas brilhantes
        for (let j = 0; j < 5; j++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'wave':
        const offset = Math.sin(i * 0.2) * 20;
        ctx.translate(0, offset);
        break;
    }
    
    // Desenhar avatar com borda arredondada
    const x = canvas.width/2 - 128;
    const y = canvas.height/2 - 128;
    const size = 256;
    const radius = 15;

    // Criar caminho arredondado
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + size - radius, y);
    ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
    ctx.lineTo(x + size, y + size - radius);
    ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
    ctx.lineTo(x + radius, y + size);
    ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    
    // Cortar o canvas para a forma arredondada
    ctx.clip();
    
    // Desenhar a imagem
    ctx.drawImage(avatar, x, y, size, size);
    
    // Restaurar o canvas para desenhar os textos
    ctx.restore();
    
    // Desenhar texto com efeitos
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    
    // Aplicar efeitos nos textos
    if (effect === 'glow') {
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 10 + Math.sin(i * 0.2) * 5;
    }
    
    ctx.fillText('Oce tá de hack né?', canvas.width/2, 50);
    ctx.fillText(`Safado chitoos não vale :^)`, canvas.width/2, 90);
    
    ctx.font = '30px Arial';
    ctx.fillText(`Total gasto: R$ ${totalSpent.toFixed(2)}`, canvas.width/2, 450);
    
    // Adicionar frame ao GIF
    encoder.addFrame(ctx);
  }
  
  // Finalizar GIF
  encoder.finish();
  
  // Salvar GIF
  const gifPath = path.join(__dirname, '../../temp', `${user.id}_thankyou.gif`);
  const writeStream = fs.createWriteStream(gifPath);
  stream.pipe(writeStream);
  
  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => resolve(gifPath));
    writeStream.on('error', reject);
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('melhores')
    .setDescription('Mostra os top 10 compradores da loja'),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const topBuyers = await Sale.aggregate([
        {
          $group: {
            _id: '$userId',
            totalSpent: { $sum: '$totalPrice' },
            totalPurchases: { $sum: '$quantity' }
          }
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 10 }
      ]);

      if (topBuyers.length === 0) {
        return interaction.editReply({
          content: '❌ Ainda não há compradores registrados.',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('🏆 TOP 10 COMPRADORES 🏆')
        .setDescription('Aqui estão os nossos melhores clientes!');

      let description = '';
      const buyersList = [];
      
      for (let i = 0; i < topBuyers.length; i++) {
        const buyer = await interaction.client.users.fetch(topBuyers[i]._id).catch(() => null);
        if (buyer) {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
          description += `${medal} **${i + 1}º** - ${buyer.username}\n💰 Total gasto: R$ ${topBuyers[i].totalSpent.toFixed(2)}\n📦 Compras: ${topBuyers[i].totalPurchases}\n\n`;
          
          buyersList.push({
            label: `${i + 1}º - ${buyer.username}`,
            value: buyer.id,
            description: `R$ ${topBuyers[i].totalSpent.toFixed(2)} - ${topBuyers[i].totalPurchases} compras`
          });
        }
      }
      embed.setDescription(description);

      const adminRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('clear_rank')
            .setLabel('🗑️ Zerar Ranking')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('remove_buyer')
            .setLabel('❌ Remover Comprador')
            .setStyle(ButtonStyle.Secondary)
        );

      const topBuyer = await interaction.client.users.fetch(topBuyers[0]._id);
      if (topBuyer) {
        const randomEffect = effects[Math.floor(Math.random() * effects.length)];
        const gifPath = await generateThankYouGif(topBuyer, topBuyers[0].totalSpent, randomEffect);
        
        embed.setImage(`attachment://${path.basename(gifPath)}`);

        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: gifPath,
            name: path.basename(gifPath)
          }],
          components: [adminRow]
        });

        setTimeout(() => {
          fs.unlink(gifPath, (err) => {
            if (err) console.error('Erro ao deletar GIF temporário:', err);
          });
        }, 5000);
      } else {
        await interaction.editReply({ embeds: [embed], components: [adminRow] });
      }

    } catch (error) {
      console.error('Erro ao executar comando melhores:', error);
      await interaction.editReply({
        content: '❌ Ocorreu um erro ao executar o comando.',
        ephemeral: true
      });
    }
  },

  // Função para lidar com interações de botão e menu
  async handleInteraction(interaction) {
    try {

      // Botão de zerar ranking
      if (interaction.customId === 'clear_rank') {
        if (!interaction.member.permissions.has('Administrator')) {
          await interaction.reply({
            content: '❌ Apenas administradores podem usar estes botões!',
            ephemeral: true
          });
          return;
        }
        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('confirm_clear')
              .setLabel('✅ Confirmar')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId('cancel_clear')
              .setLabel('❌ Cancelar')
              .setStyle(ButtonStyle.Secondary)
          );

        await interaction.reply({
          content: '⚠️ **ATENÇÃO!** Você está prestes a zerar todo o ranking de compradores. Esta ação não pode ser desfeita!\n\nTem certeza que deseja continuar?',
          components: [confirmRow],
          ephemeral: true
        });
      }

      // Botão de remover comprador
      else if (interaction.customId === 'remove_buyer') {
        if (!interaction.member.permissions.has('Administrator')) {
          await interaction.reply({
            content: '❌ Apenas administradores podem usar estes botões!',
            ephemeral: true
          });
          return;
        }
        const topBuyers = await Sale.aggregate([
          {
            $group: {
              _id: '$userId',
              totalSpent: { $sum: '$totalPrice' },
              totalPurchases: { $sum: '$quantity' }
            }
          },
          { $sort: { totalSpent: -1 } },
          { $limit: 10 }
        ]);

        const buyersList = [];
        for (const buyer of topBuyers) {
          const user = await interaction.client.users.fetch(buyer._id).catch(() => null);
          if (user) {
            buyersList.push({
              label: user.username,
              value: user.id,
              description: `R$ ${buyer.totalSpent.toFixed(2)} - ${buyer.totalPurchases} compras`
            });
          }
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_buyer')
          .setPlaceholder('Selecione um comprador para remover')
          .addOptions(buyersList);

        const menuRow = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
          content: '🔍 Selecione qual comprador você deseja remover do ranking:',
          components: [menuRow],
          ephemeral: true
        });
      }

      // Menu de seleção de usuário
      else if (interaction.customId === 'select_buyer') {
        if (!interaction.member.permissions.has('Administrator')) {
          await interaction.reply({
            content: '❌ Apenas administradores podem usar estes botões!',
            ephemeral: true
          });
          return;
        }
        try {
          await interaction.deferUpdate();
          const buyerId = interaction.values[0];
          const buyer = await interaction.client.users.fetch(buyerId);
          
          const confirmRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`confirm_remove_${buyerId}`)
                .setLabel('✅ Confirmar')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId('cancel_remove')
                .setLabel('❌ Cancelar')
                .setStyle(ButtonStyle.Secondary)
            );

          await interaction.editReply({
            content: `⚠️ Você está prestes a remover **${buyer.username}** do ranking.\nTodas as compras deste usuário serão deletadas!\n\nTem certeza que deseja continuar?`,
            components: [confirmRow]
          });
        } catch (error) {
          console.error('Erro ao processar seleção do usuário:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ Ocorreu um erro ao processar sua seleção. Tente novamente.',
              ephemeral: true
            });
          }
        }
      }

      // Confirmação de zerar ranking
      else if (interaction.customId === 'confirm_clear') {
        if (!interaction.member.permissions.has('Administrator')) {
          await interaction.reply({
            content: '❌ Apenas administradores podem usar estes botões!',
            ephemeral: true
          });
          return;
        }
        await Sale.deleteMany({});
        
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setDescription('Ranking foi zerado! Não há compradores registrados.');

        await interaction.message.edit({
          embeds: [embed],
          components: []
        });

        await interaction.reply({
          content: '✅ Ranking zerado com sucesso!',
          ephemeral: true
        });
      }

      // Confirmação de remoção de usuário
      else if (interaction.customId.startsWith('confirm_remove_')) {
        if (!interaction.member.permissions.has('Administrator')) {
          await interaction.reply({
            content: '❌ Apenas administradores podem usar estes botões!',
            ephemeral: true
          });
          return;
        }
        try {
          await interaction.deferUpdate();
          const buyerId = interaction.customId.replace('confirm_remove_', '');
          
          // Remover compras do usuário
          await Sale.deleteMany({ userId: buyerId });

          // Buscar novos top compradores
          const newTopBuyers = await Sale.aggregate([
            {
              $group: {
                _id: '$userId',
                totalSpent: { $sum: '$totalPrice' },
                totalPurchases: { $sum: '$quantity' }
              }
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 10 }
          ]);

          // Criar nova descrição
          let newDescription = '';
          if (newTopBuyers.length === 0) {
            newDescription = 'Não há compradores registrados.';
          } else {
            for (let i = 0; i < newTopBuyers.length; i++) {
              const buyer = await interaction.client.users.fetch(newTopBuyers[i]._id).catch(() => null);
              if (buyer) {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
                newDescription += `${medal} **${i + 1}º** - ${buyer.username}\n💰 Total gasto: R$ ${newTopBuyers[i].totalSpent.toFixed(2)}\n📦 Compras: ${newTopBuyers[i].totalPurchases}\n\n`;
              }
            }
          }

          // Criar novo embed
          const newEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('🏆 TOP 10 COMPRADORES 🏆')
            .setDescription(newDescription);

          // Criar nova row de botões
          const newAdminRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('clear_rank')
                .setLabel('🗑️ Zerar Ranking')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId('remove_buyer')
                .setLabel('❌ Remover Comprador')
                .setStyle(ButtonStyle.Secondary)
            );

            // Tentar encontrar a mensagem original do ranking
            try {
              const messages = await interaction.channel.messages.fetch({ limit: 10 });
              const rankMessage = messages.find(m => 
                m.author.id === interaction.client.user.id && 
                m.embeds[0]?.title === '🏆 TOP 10 COMPRADORES 🏆'
              );

              if (rankMessage) {
                await rankMessage.edit({
                  embeds: [newEmbed],
                  components: [newAdminRow]
                });
              }
            } catch (error) {
              console.error('Erro ao atualizar mensagem do ranking:', error);
            }

            // Confirmar a remoção
            await interaction.editReply({
              content: '✅ Comprador removido com sucesso!',
              components: []
            });
        } catch (error) {
          console.error('Erro ao remover comprador:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ Ocorreu um erro ao remover o comprador. Tente novamente.',
              ephemeral: true
            });
          }
        }
      }

      // Cancelar operações
      else if (interaction.customId === 'cancel_clear' || interaction.customId === 'cancel_remove') {
        if (!interaction.member.permissions.has('Administrator')) {
          await interaction.reply({
            content: '❌ Apenas administradores podem usar estes botões!',
            ephemeral: true
          });
          return;
        }
        await interaction.deferUpdate();
        await interaction.editReply({
          content: '❌ Operação cancelada!',
          components: []
        });
      }

    } catch (error) {
      console.error('Erro ao processar interação:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar sua solicitação. Tente novamente.',
        ephemeral: true
      }).catch(() => {});
    }
  }
}; 