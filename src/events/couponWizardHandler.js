const { ButtonStyle, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const couponWizard = require('./couponCreationWizard');
const Coupon = require('../models/Coupon');
const { safeMessageEdit } = require('../utils/embedUtils');

module.exports = async (client) => {
  // Armazenar usuários que estão em modo de input de texto
  const activeTextInputUsers = new Set();

  // Lidar com mensagens normais de texto (para capturar respostas do assistente)
  client.on('messageCreate', async (message) => {
    // Ignorar mensagens de bots
    if (message.author.bot) return;
    
    // Verificar se o usuário está em sessão ativa de criação de cupom
    const userId = message.author.id;
    const session = couponWizard.sessions.get(userId);
    
    // Se o usuário não está em uma sessão, ou não está em uma etapa de entrada de texto, ignorar
    if (!session || ![1, 2, 4, 5].includes(session.step)) return;
    
    try {
      // Atualizar timestamp de atividade
      session.lastActivity = Date.now();
      
      // Processar a mensagem com base na etapa atual
      const content = message.content.trim();
      
      // Tentar deletar a mensagem do usuário imediatamente
      try {
        await message.delete().catch((e) => console.log(`Erro ao deletar mensagem: ${e.message}`));
      } catch (error) {
        console.log(`Não foi possível apagar a mensagem do usuário: ${error.message}`);
      }
      
      // Processar o conteúdo com base na etapa
      let processError = null;
      
      switch (session.step) {
        case 1: // Nome do cupom
          session.data.name = content;
          session.step++;
          break;
          
        case 2: // Código do cupom
          session.data.code = content.toUpperCase();
          session.step++;
          break;
          
        case 4: // Valor do desconto
          const discountValue = parseFloat(content.replace(',', '.'));
          
          if (isNaN(discountValue) || discountValue <= 0) {
            processError = '❌ Valor de desconto inválido. Por favor, digite apenas números maiores que zero.';
            return;
          }
          
          session.data.discountValue = discountValue;
          session.step++;
          break;
          
        case 5: // Valor mínimo para usar o cupom
          const minValue = parseFloat(content.replace(',', '.'));
          
          if (isNaN(minValue) || minValue < 0) {
            processError = '❌ Valor mínimo inválido. Por favor, digite apenas números não negativos.';
            return;
          }
          
          session.data.minOrderValue = minValue;
          session.step++;
          break;
      }
      
      if (processError) {
        // Buscar mensagem original para atualizar com o erro
        if (session.messageId) {
          try {
            const messageToUpdate = await message.channel.messages.fetch(session.messageId);
            if (messageToUpdate) {
              const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription(processError);
              
              await safeMessageEdit(messageToUpdate, errorEmbed);
              
              // Restaurar a mensagem original após 3 segundos
              setTimeout(async () => {
                try {
                  const fakeInteraction = {
                    user: { id: userId },
                    channel: message.channel,
                    update: async (opts) => messageToUpdate.edit(opts),
                    reply: async (opts) => message.channel.send(opts),
                    guild: message.guild,
                    client: client
                  };
                  
                  await couponWizard.sendQuestion(fakeInteraction);
                } catch (e) {
                  console.error('Erro ao restaurar mensagem após erro:', e);
                }
              }, 3000);
            }
          } catch (e) {
            console.error('Erro ao atualizar mensagem com erro:', e);
          }
        }
        return;
      }
      
      // Verificar se temos uma mensagem principal do assistente para atualizar
      try {
        if (session.messageId) {
          const mainMessage = await message.channel.messages.fetch(session.messageId)
            .catch(err => {
              console.log(`Não foi possível encontrar a mensagem principal: ${err.message}`);
              return null;
            });
          
          if (mainMessage) {
            // Primeiro, mostrar confirmação na mensagem existente
            const confirmEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('✅ Resposta registrada')
              .setDescription(`Valor recebido: **${content}**`);
              
            await safeMessageEdit(mainMessage, confirmEmbed);
            
            // Após 1.5 segundos, atualizar para a próxima pergunta
            setTimeout(async () => {
              const fakeInteraction = {
                user: { id: userId },
                channel: message.channel,
                update: async (opts) => mainMessage.edit(opts),
                reply: async (opts) => message.channel.send(opts),
                guild: message.guild,
                client: client
              };
              
              await couponWizard.sendQuestion(fakeInteraction);
            }, 1500);
            
            return;
          }
        }
        
        // Se chegou aqui, não encontramos a mensagem principal
        console.log("Não foi possível encontrar a mensagem principal do assistente");
        
        // Criar uma nova mensagem principal
        const newMainMessage = await message.channel.send({ 
          content: `Assistente de criação de cupom para <@${userId}>`
        });
        
        // Salvar o ID da nova mensagem principal
        session.messageId = newMainMessage.id;
        
        // Criar um objeto de interação compatível
        const fakeInteraction = {
          user: { id: userId },
          channel: message.channel,
          update: async (opts) => newMainMessage.edit(opts),
          reply: async (opts) => newMainMessage.edit(opts),
          guild: message.guild,
          client: client
        };
        
        // Enviar a próxima pergunta
        await couponWizard.sendQuestion(fakeInteraction);
        
      } catch (error) {
        console.error('Erro ao processar resposta:', error);
        try {
          const errorMsg = await message.channel.send({
            content: '❌ Ocorreu um erro ao processar sua resposta. Por favor, tente novamente.'
          });
          setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
        } catch (e) {
          console.error('Erro ao enviar mensagem de erro:', e);
        }
      }
    } catch (error) {
      console.error('Erro ao processar mensagem de texto para o assistente de cupons:', error);
      try {
        const errorMsg = await message.channel.send({
          content: '❌ Ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.'
        });
        setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
      } catch (e) {
        console.error('Erro ao enviar mensagem de erro:', e);
      }
    }
  });

  // Lidar com interações normais (botões, menus, etc.)
  client.on('interactionCreate', async (interaction) => {
    // Ignorar interações sem customId
    if (!interaction.customId) return;
    
    try {
      // Verificar se é uma interação relacionada ao assistente de cupons
      if (interaction.customId.startsWith('coupon_wizard_') || 
          interaction.customId.startsWith('coupon_share_') ||
          interaction.customId === 'coupon_channel_select') {
          
        // Atualizar timestamp de atividade se houver sessão
        const userId = interaction.user.id;
        const session = couponWizard.sessions.get(userId);
        if (session) {
          session.lastActivity = Date.now();
        }
      }
      
      // Tratar início do assistente
      if (interaction.customId === 'start_coupon_wizard') {
        await couponWizard.startWizard(interaction);
        return;
      }
      
      // Tratar reinício do assistente
      if (interaction.customId === 'coupon_wizard_restart') {
        await couponWizard.startWizard(interaction);
        return;
      }
      
      // Tratar resposta aos passos do assistente
      if (interaction.customId.startsWith('coupon_wizard_')) {
        await couponWizard.processResponse(interaction);
        return;
      }
      
      // Tratar fechamento de resultado
      if (interaction.customId === 'coupon_wizard_close') {
        // Verificar se existe uma sessão ativa para esse usuário
        const userId = interaction.user.id;
        const wasEditing = interaction.client.editingCouponId !== undefined;
        
        // Remover referência ao cupom que estava sendo editado
        if (wasEditing) {
          delete interaction.client.editingCouponId;
        }
        
        await interaction.update({
          content: wasEditing ? '✅ Cupom atualizado com sucesso!' : '✅ Cupom criado com sucesso!',
          embeds: [],
          components: [],
          ephemeral: true
        });
        return;
      }
      
      // Tratar compartilhamento de cupom
      if (interaction.customId.startsWith('coupon_share_')) {
        try {
          const couponId = interaction.customId.replace('coupon_share_', '');
          await handleCouponShare(interaction, couponId);
          return;
        } catch (error) {
          console.error('Erro ao iniciar compartilhamento de cupom:', error);
          try {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.update({
                content: '❌ Erro ao preparar compartilhamento de cupom. Tente novamente.',
                components: [],
                ephemeral: true
              });
            } else {
              await interaction.followUp({
                content: '❌ Erro ao preparar compartilhamento de cupom. Tente novamente.',
                ephemeral: true
              });
            }
          } catch (e) {
            console.error('Erro ao responder após falha:', e);
          }
        }
      }
      
      // Tratar seleção de canal para compartilhamento
      if (interaction.customId === 'coupon_channel_select' && interaction.isStringSelectMenu()) {
        try {
          const channelId = interaction.values[0];
          const couponId = interaction.message.components[1]?.components[0]?.customId?.replace('share_coupon_', '') || null;
          
          if (!couponId) {
            return interaction.update({
              content: '❌ Não foi possível identificar o cupom.',
              components: [],
              ephemeral: true
            });
          }
          
          await shareCouponToChannel(interaction, couponId, channelId);
          return;
        } catch (error) {
          console.error('Erro ao processar seleção de canal:', error);
          try {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.update({
                content: '❌ Erro ao compartilhar cupom. Tente novamente.',
                components: [],
                ephemeral: true
              });
            } else {
              await interaction.followUp({
                content: '❌ Erro ao compartilhar cupom. Tente novamente.',
                ephemeral: true
              });
            }
          } catch (e) {
            console.error('Erro ao responder após falha:', e);
          }
        }
      }
      
    } catch (error) {
      console.error('Erro no assistente de cupons:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar sua interação.',
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: '❌ Ocorreu um erro ao processar sua interação.',
          ephemeral: true
        });
      }
    }
  });

  // Limpar sessões inativas periodicamente
  setInterval(() => {
    try {
      const now = Date.now();
      const timeoutMs = 15 * 60 * 1000; // 15 minutos
      
      // Verificar sessões ativas
      couponWizard.sessions.forEach((session, userId) => {
        // Se a sessão não tem timestamp, adiciona agora
        if (!session.lastActivity) {
          session.lastActivity = now;
          return;
        }
        
        // Se a sessão está inativa por muito tempo
        if (now - session.lastActivity > timeoutMs) {
          console.log(`Removendo sessão inativa do usuário ${userId}`);
          
          // Limpar mensagem do assistente se possível
          if (session.messageId) {
            const user = client.users.cache.get(userId);
            if (user) {
              user.createDM().then(dm => {
                dm.messages.fetch(session.messageId).then(message => {
                  message.edit({
                    content: '⏱️ Sessão de criação de cupom encerrada por inatividade.',
                    embeds: [],
                    components: [],
                    ephemeral: true
                  }).catch(() => {});
                }).catch(() => {});
              }).catch(() => {});
            }
          }
          
          // Remover a sessão
          couponWizard.sessions.delete(userId);
        }
      });
    } catch (error) {
      console.error('Erro ao limpar sessões inativas:', error);
    }
  }, 5 * 60 * 1000); // Verificar a cada 5 minutos
};

// Função para lidar com o compartilhamento de cupom
async function handleCouponShare(interaction, couponId) {
  try {
    // Buscar o cupom
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      if (!interaction.replied && !interaction.deferred) {
        return interaction.update({
          content: '❌ Cupom não encontrado.',
          components: [],
          ephemeral: true
        });
      } else {
        return interaction.followUp({
          content: '❌ Cupom não encontrado.',
          ephemeral: true
        });
      }
    }
    
    // Obter os canais do servidor
    const channels = interaction.guild.channels.cache
      .filter(channel => channel.type === 0) // 0 = text channel
      .map(channel => ({
        label: channel.name,
        value: channel.id,
        description: `#${channel.name}`
      }))
      .slice(0, 25); // Limite de 25 opções
    
    if (channels.length === 0) {
      if (!interaction.replied && !interaction.deferred) {
        return interaction.update({
          content: '❌ Não há canais de texto disponíveis neste servidor.',
          components: [],
          ephemeral: true
        });
      } else {
        return interaction.followUp({
          content: '❌ Não há canais de texto disponíveis neste servidor.',
          ephemeral: true
        });
      }
    }
    
    // Criar menu de seleção de canais
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('coupon_channel_select')
      .setPlaceholder('Selecione um canal para divulgar o cupom')
      .addOptions(channels);
    
    // Adicionar botão oculto para referência ao cupom
    const hiddenReference = new ButtonBuilder()
      .setCustomId(`share_coupon_${couponId}`)
      .setLabel('Referência')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);
    
    const messageOptions = {
      content: '📢 Selecione o canal onde deseja divulgar o cupom:',
      embeds: [],
      components: [
        new ActionRowBuilder().addComponents(selectMenu),
        new ActionRowBuilder().addComponents(hiddenReference)
      ],
      ephemeral: true
    };
    
    // Verificar se pode usar update ou precisa usar followUp
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.update(messageOptions);
      } else {
        await interaction.followUp(messageOptions);
      }
    } catch (error) {
      console.error('Erro ao responder interação:', error);
      // Tenta enviar mensagem no canal como último recurso
      await interaction.channel.send({
        content: '❌ Ocorreu um erro ao preparar o compartilhamento do cupom. Tente novamente.',
        ephemeral: false // Mensagens de canal não podem ser ephemeral
      });
    }
    
  } catch (error) {
    console.error('Erro ao preparar compartilhamento de cupom:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.update({
          content: '❌ Ocorreu um erro ao preparar o compartilhamento do cupom.',
          components: [],
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: '❌ Ocorreu um erro ao preparar o compartilhamento do cupom.',
          ephemeral: true
        });
      }
    } catch (e) {
      console.error('Erro ao responder após falha:', e);
      // Tenta enviar mensagem no canal como último recurso
      try {
        await interaction.channel.send({
          content: '❌ Ocorreu um erro ao preparar o compartilhamento do cupom. Tente novamente.',
          ephemeral: false // Mensagens de canal não podem ser ephemeral
        });
      } catch (innerE) {
        console.error('Falha total ao responder:', innerE);
      }
    }
  }
}

// Função para compartilhar o cupom em um canal específico
async function shareCouponToChannel(interaction, couponId, channelId) {
  try {
    // Buscar o cupom
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      if (!interaction.replied && !interaction.deferred) {
        return interaction.update({
          content: '❌ Cupom não encontrado.',
          components: [],
          ephemeral: true
        });
      } else {
        return interaction.followUp({
          content: '❌ Cupom não encontrado.',
          components: [],
          ephemeral: true
        });
      }
    }
    
    // Buscar o canal
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) {
      if (!interaction.replied && !interaction.deferred) {
        return interaction.update({
          content: '❌ Canal não encontrado.',
          components: [],
          ephemeral: true
        });
      } else {
        return interaction.followUp({
          content: '❌ Canal não encontrado.',
          components: [],
          ephemeral: true
        });
      }
    }
    
    // Criar embed para divulgação
    const embed = new EmbedBuilder()
      .setColor('#4CAF50')
      .setTitle('🎉 Novo Cupom de Desconto!')
      .setDescription('Aproveite este cupom exclusivo para sua próxima compra!')
      .addFields(
        { name: 'Código', value: coupon.code, inline: true },
        { name: 'Desconto', value: coupon.discountType === 'fixed' ? `R$ ${coupon.discountValue.toFixed(2)}` : `${coupon.discountValue}%`, inline: true },
        { name: 'Valor Mínimo', value: `R$ ${coupon.minOrderValue.toFixed(2)}`, inline: true }
      );
    
    if (coupon.minProducts > 1) {
      embed.addFields({ name: 'Mínimo de Produtos', value: coupon.minProducts.toString(), inline: true });
    }
    
    if (coupon.expiresAt) {
      embed.addFields({ name: 'Válido até', value: coupon.expiresAt.toLocaleDateString('pt-BR'), inline: true });
    }
    
    if (coupon.onlyForPreviousCustomers) {
      embed.addFields({ name: 'Disponível para', value: 'Apenas clientes que já compraram antes', inline: true });
    }
    
    embed.setFooter({ text: `Usos restantes: ${coupon.maxUses - coupon.uses}` });
    embed.setTimestamp();
    
    // Enviar embed para o canal
    await channel.send({ embeds: [embed] });
    
    // Confirmar para o usuário
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.update({
          content: `✅ Cupom divulgado com sucesso no canal ${channel.toString()}!`,
          embeds: [],
          components: [],
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: `✅ Cupom divulgado com sucesso no canal ${channel.toString()}!`,
          embeds: [],
          components: [],
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Erro ao responder interação:', error);
      try {
        await interaction.channel.send({
          content: `✅ Cupom divulgado com sucesso no canal ${channel.toString()}!`,
          ephemeral: true
        });
      } catch (e) {
        console.error('Erro ao enviar mensagem no canal:', e);
      }
    }
    
  } catch (error) {
    console.error('Erro ao compartilhar cupom:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.update({
          content: '❌ Ocorreu um erro ao compartilhar o cupom.',
          components: [],
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: '❌ Ocorreu um erro ao compartilhar o cupom.',
          components: [],
          ephemeral: true
        });
      }
    } catch (e) {
      console.error('Erro ao responder interação após erro:', e);
      try {
        await interaction.channel.send({
          content: '❌ Ocorreu um erro ao compartilhar o cupom.',
          ephemeral: true
        });
      } catch (innerE) {
        console.error('Erro ao enviar mensagem no canal:', innerE);
      }
    }
  }
} 