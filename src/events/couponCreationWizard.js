const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Coupon = require('../models/Coupon');

/**
 * Sistema de criação de cupons com interface simplificada
 * Substitui o modal técnico por uma série de perguntas simples
 */
class CouponWizard {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Inicia o assistente de criação de cupom
   */
  async startWizard(interaction, existingCoupon = null) {
    // Criar uma nova sessão para o usuário
    const userId = interaction.user.id;
    const isEditing = !!existingCoupon;

    this.sessions.set(userId, {
      step: 1,
      data: {
        creatorId: userId,
        active: true,
        ...(isEditing ? {
          // Se estiver editando, preenchemos os dados existentes
          _id: existingCoupon._id,
          name: existingCoupon.name,
          code: existingCoupon.code,
          discountType: existingCoupon.discountType,
          discountValue: existingCoupon.discountValue,
          minOrderValue: existingCoupon.minOrderValue,
          maxUses: existingCoupon.maxUses,
          minProducts: existingCoupon.minProducts,
          onlyForPreviousCustomers: existingCoupon.onlyForPreviousCustomers,
          expiresAt: existingCoupon.expiresAt,
          uses: existingCoupon.uses || 0
        } : {})
      },
      messageId: null,
      lastActivity: Date.now(), // Inicializar timestamp de atividade
      isEditing: isEditing // Flag para indicar se estamos editando
    });

    // Enviar a primeira pergunta
    return this.sendQuestion(interaction);
  }

  /**
   * Envia a próxima pergunta do assistente
   */
  async sendQuestion(interaction) {
    const userId = interaction.user.id;
    const session = this.sessions.get(userId);

    if (!session) {
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({
          content: '❌ Sessão não encontrada. Por favor, inicie o assistente novamente.',
          ephemeral: true
        });
      }
      return interaction.reply({
        content: '❌ Sessão não encontrada. Por favor, inicie o assistente novamente.',
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(session.isEditing ? '🎟️ Assistente de Edição de Cupom' : '🎟️ Assistente de Criação de Cupom')
      .setFooter({ text: `Etapa ${session.step} de 7` });

    // Para etapas de texto, adicionar instruções específicas
    if (session.step === 1 || session.step === 2 || session.step === 4 || session.step === 5) {
      let promptText = '';
      switch (session.step) {
        case 1:
          promptText = `**Qual será o nome do cupom?**\nEscolha um nome descritivo para identificar o cupom.${session.isEditing ? `\n\nNome atual: **${session.data.name}**` : ''}`;
          break;
        case 2:
          if (session.isEditing) {
            // Em caso de edição, não permitir editar o código e avançar para a próxima etapa
            session.step++;
            return this.sendQuestion(interaction);
          }
          promptText = '**Qual será o código do cupom?**\nEste é o código que os clientes digitarão para aplicar o desconto.\nExemplo: DESCONTO20, PROMO50, etc.\n\n**💬 Responda diretamente no chat. Sua mensagem será processada automaticamente.**';
          break;
        case 4:
          const discountType = session.data.discountType === 'fixed' ? 'valor fixo (R$)' : 'porcentagem (%)';
          promptText = `**Qual será o valor do desconto?**\nDigite apenas o número para o desconto em ${discountType}.${session.isEditing ? `\n\nValor atual: **${session.data.discountValue}${session.data.discountType === 'fixed' ? ' R$' : '%'}**` : ''}`;
          break;
        case 5:
          promptText = `**Qual será o valor mínimo para usar o cupom?**\nDigite apenas o número (em R$).${session.isEditing ? `\n\nValor mínimo atual: **R$ ${session.data.minOrderValue.toFixed(2)}**` : ''}`;
          break;
      }
      
      promptText += '\n\n**💬 Responda diretamente no chat. Sua mensagem será processada automaticamente.**';
      embed.setDescription(promptText);
    } else {
      // Para as outras etapas, mantemos o comportamento original
      switch (session.step) {
        case 3: // Tipo de desconto
          embed.setDescription(`**Qual será o tipo de desconto?**\nSelecione uma opção abaixo:${session.isEditing ? `\n\nTipo atual: **${session.data.discountType === 'fixed' ? 'Valor fixo (R$)' : 'Porcentagem (%)'}**` : ''}`);
          break;
        case 6: // Configurações adicionais
          embed.setDescription(`**Configurações adicionais**\nSelecione as opções desejadas:${session.isEditing ? `\n\nValores atuais:\n- Usos máximos: **${session.data.maxUses}**\n- Quantidade mínima: **${session.data.minProducts} produto(s)**` : ''}`);
          break;
        case 7: // Opções finais
          embed.setDescription(`**Configurações finais**\nSelecione as opções desejadas:${session.isEditing ? `\n\nValores atuais:\n- Validade: **${session.data.expiresAt ? new Date(session.data.expiresAt).toLocaleDateString('pt-BR') : 'Sem expiração'}**\n- Restrição: **${session.data.onlyForPreviousCustomers ? 'Apenas clientes antigos' : 'Qualquer cliente'}**` : ''}`);
          break;
      }
    }

    const components = [];

    switch (session.step) {
      case 1: // Nome do cupom
        // Botão para cancelar
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('coupon_wizard_cancel')
              .setLabel('Cancelar')
              .setStyle(ButtonStyle.Danger)
          )
        );
        break;

      case 2: // Código do cupom
        // Botão para cancelar e voltar
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('coupon_wizard_back')
              .setLabel('Voltar')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('coupon_wizard_cancel')
              .setLabel('Cancelar')
              .setStyle(ButtonStyle.Danger)
          )
        );
        break;

      case 3: // Tipo de desconto
        // Menu de seleção para tipo de desconto
        const discountTypeRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('coupon_wizard_discount_type')
            .setPlaceholder('Selecione o tipo de desconto')
            .addOptions([
              {
                label: 'Valor fixo (R$)',
                description: 'Ex: R$ 10,00 de desconto',
                value: 'fixed'
              },
              {
                label: 'Porcentagem (%)',
                description: 'Ex: 15% de desconto',
                value: 'percentage'
              }
            ])
        );
        
        // Botões de navegação
        const navigationRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('coupon_wizard_back')
            .setLabel('Voltar')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('coupon_wizard_cancel')
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Danger)
        );
        
        components.push(discountTypeRow, navigationRow);
        break;

      case 4: // Valor do desconto
        // Botões de navegação
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('coupon_wizard_back')
              .setLabel('Voltar')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('coupon_wizard_cancel')
              .setLabel('Cancelar')
              .setStyle(ButtonStyle.Danger)
          )
        );
        break;

      case 5: // Valor mínimo para usar o cupom
        // Botões de navegação
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('coupon_wizard_back')
              .setLabel('Voltar')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('coupon_wizard_cancel')
              .setLabel('Cancelar')
              .setStyle(ButtonStyle.Danger)
          )
        );
        break;

      case 6: // Configurações adicionais
        // Número máximo de usos
        const maxUsesRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('coupon_wizard_max_uses')
            .setPlaceholder('Número máximo de usos')
            .addOptions([
              { label: '1 uso', value: '1' },
              { label: '5 usos', value: '5' },
              { label: '10 usos', value: '10' },
              { label: '20 usos', value: '20' },
              { label: '50 usos', value: '50' },
              { label: '100 usos', value: '100' },
              { label: 'Ilimitado', value: '999999' }
            ])
        );
        
        // Quantidade mínima de produtos
        const minProductsRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('coupon_wizard_min_products')
            .setPlaceholder('Quantidade mínima de produtos')
            .addOptions([
              { label: '1 produto', value: '1' },
              { label: '2 produtos', value: '2' },
              { label: '3 produtos', value: '3' },
              { label: '5 produtos', value: '5' },
              { label: '10 produtos', value: '10' }
            ])
        );
        
        // Botões de navegação
        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('coupon_wizard_back')
            .setLabel('Voltar')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('coupon_wizard_cancel')
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Danger)
        );
        
        components.push(maxUsesRow, minProductsRow, navRow);
        break;

      case 7: // Opções finais
        // Dias para expirar
        const expirationRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('coupon_wizard_expiration')
            .setPlaceholder('Dias até expirar')
            .addOptions([
              { label: 'Sem expiração', value: '0' },
              { label: '1 dia', value: '1' },
              { label: '3 dias', value: '3' },
              { label: '7 dias', value: '7' },
              { label: '15 dias', value: '15' },
              { label: '30 dias', value: '30' },
              { label: '60 dias', value: '60' },
              { label: '90 dias', value: '90' }
            ])
        );
        
        // Apenas para clientes antigos
        const clientTypeRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('coupon_wizard_client_type')
            .setPlaceholder('Tipo de cliente')
            .addOptions([
              { label: 'Qualquer cliente', value: 'false' },
              { label: 'Apenas clientes que já compraram antes', value: 'true' }
            ])
        );
        
        // Botões de confirmação
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('coupon_wizard_back')
            .setLabel('Voltar')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('coupon_wizard_finish')
            .setLabel('Concluir')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('coupon_wizard_cancel')
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Danger)
        );
        
        components.push(expirationRow, clientTypeRow, confirmRow);
        break;

      default:
        // Finalização
        await this.finishWizard(interaction);
        return;
    }

    // Verificar se estamos lidando com um botão/interação padrão ou com uma mensagem de texto
    const isSlashCommand = interaction.commandId !== undefined;
    const isButton = interaction.isButton?.() || interaction.isStringSelectMenu?.();
    const isRegularInteraction = isSlashCommand || isButton;
    
    // Definir as opções da mensagem
    const messageOpts = { 
      embeds: [embed], 
      components,
      ephemeral: isRegularInteraction // Ephemeral apenas para interações regulares (comandos slash, botões)
    };
    
    console.log(`Enviando pergunta para etapa ${session.step}. Interação regular: ${isRegularInteraction}`);

    try {
      // Se temos um ID de mensagem para atualizar
      if (session.messageId) {
        // Se a interação tem método update, usar update
        if (typeof interaction.update === 'function') {
          await interaction.update(messageOpts);
          return;
        }
        
        // Se a interação não tem update, tentamos buscar a mensagem no canal
        if (interaction.channel) {
          try {
            const message = await interaction.channel.messages.fetch(session.messageId)
              .catch(err => {
                console.error(`Erro ao buscar mensagem ${session.messageId}:`, err);
                return null;
              });
              
            if (message) {
              await message.edit(messageOpts);
              return;
            } else {
              console.log(`Mensagem ${session.messageId} não encontrada, criando nova.`);
            }
          } catch (err) {
            console.error('Erro ao editar mensagem:', err);
          }
        }
      }
      
      // Se chegamos aqui, precisamos criar uma nova mensagem
      
      // Para interações regulares (comandos slash, botões)
      if (isRegularInteraction) {
        if (interaction.replied || interaction.deferred) {
          const reply = await interaction.followUp({ ...messageOpts, fetchReply: true });
          session.messageId = reply.id;
        } else {
          const reply = await interaction.reply({ ...messageOpts, fetchReply: true });
          session.messageId = reply.id;
        }
      } 
      // Para interações customizadas (nosso objeto fakeInteraction)
      else if (interaction.channel) {
        // Garantir que mensagens de canal não sejam ephemeral
        messageOpts.ephemeral = false;
        
        // Se temos um método update, usamos ele
        if (typeof interaction.update === 'function') {
          await interaction.update(messageOpts);
        } 
        // Se temos um método reply, usamos ele
        else if (typeof interaction.reply === 'function') {
          const message = await interaction.reply({ ...messageOpts, fetchReply: true });
          if (message && message.id) {
            session.messageId = message.id;
          }
        } 
        // Como último recurso, enviamos diretamente no canal
        else {
          const message = await interaction.channel.send(messageOpts);
          session.messageId = message.id;
        }
      } else {
        console.error('Objeto de interação inválido:', interaction);
        throw new Error('Objeto de interação inválido');
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem do assistente:', error);
      
      // Tentar enviar mensagem de erro no canal
      try {
        if (interaction.channel) {
          const errorMessage = await interaction.channel.send({
            content: '❌ Ocorreu um erro ao exibir o assistente. Por favor, tente novamente mais tarde.',
            ephemeral: false // Mensagens de erro no canal não podem ser ephemeral
          });
          
          // Auto-deletar após 5 segundos
          setTimeout(() => {
            errorMessage.delete().catch(() => {});
          }, 5000);
        }
      } catch (e) {
        console.error('Erro ao enviar mensagem de erro:', e);
      }
    }
  }

  /**
   * Processa uma resposta do usuário
   */
  async processResponse(interaction) {
    const userId = interaction.user.id;
    const session = this.sessions.get(userId);

    if (!session) {
      return interaction.reply({
        content: '❌ Sessão não encontrada. Por favor, inicie o assistente novamente.',
        ephemeral: true
      });
    }

    // Verificar comando especial de cancelamento
    if (interaction.customId === 'coupon_wizard_cancel') {
      this.sessions.delete(userId);
      return interaction.update({
        content: session.isEditing ? '✅ Edição de cupom cancelada.' : '✅ Criação de cupom cancelada.',
        embeds: [],
        components: [],
        ephemeral: true
      });
    }

    // Verificar comando de voltar
    if (interaction.customId === 'coupon_wizard_back') {
      if (session.step > 1) {
        session.step--;
        
        // Se estamos editando e voltamos para a etapa 2 (código), pular para 1
        if (session.isEditing && session.step === 2) {
          session.step = 1;
        }
      }
      return this.sendQuestion(interaction);
    }

    // Verificar comando de finalizar
    if (interaction.customId === 'coupon_wizard_finish') {
      return this.finishWizard(interaction);
    }

    // Processar menus de seleção
    if (interaction.isStringSelectMenu()) {
      switch (interaction.customId) {
        case 'coupon_wizard_discount_type':
          session.data.discountType = interaction.values[0];
          session.step++;
          break;
          
        case 'coupon_wizard_max_uses':
          session.data.maxUses = parseInt(interaction.values[0]);
          // Não avançamos aqui, pois temos mais seleções na mesma tela
          break;
          
        case 'coupon_wizard_min_products':
          session.data.minProducts = parseInt(interaction.values[0]);
          
          // Se ambos os valores foram selecionados, avançamos
          if (session.data.maxUses && session.data.minProducts) {
            session.step++;
          }
          break;
          
        case 'coupon_wizard_expiration':
          const days = parseInt(interaction.values[0]);
          if (days > 0) {
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + days);
            session.data.expiresAt = expirationDate;
          }
          break;
          
        case 'coupon_wizard_client_type':
          session.data.onlyForPreviousCustomers = interaction.values[0] === 'true';
          
          // Se ambos os valores foram selecionados, avançamos
          if (session.data.hasOwnProperty('expiresAt') || interaction.values[0] === 'false') {
            if (session.data.hasOwnProperty('onlyForPreviousCustomers')) {
              session.step++;
            }
          }
          break;
      }

      return this.sendQuestion(interaction);
    }

    // Processar etapas que precisam de entrada de texto (botões de steps 1, 2, 4, 5)
    if (interaction.isButton() && 
        (session.step === 1 || session.step === 2 || session.step === 4 || session.step === 5) &&
        !interaction.customId.includes('back') && 
        !interaction.customId.includes('cancel')) {
        
      try {
        await interaction.update({
          content: `Por favor, digite sua resposta para a Etapa ${session.step} no chat...`,
          ephemeral: true
        });
        
        // Criamos um coletor de mensagens no canal
        const channel = interaction.channel;
        const filter = m => m.author.id === userId;
        
        const collector = channel.createMessageCollector({ filter, time: 60000, max: 1 });
        
        collector.on('collect', async (message) => {
          // Processar a resposta com base na etapa atual
          const content = message.content.trim();
          
          try {
            switch (session.step) {
              case 1: // Nome do cupom
                session.data.name = content;
                
                // Tentamos deletar a mensagem do usuário
                await message.delete().catch(() => {
                  console.log('Não foi possível apagar a mensagem do usuário');
                });
                
                session.step++;
                await this.sendQuestion(interaction);
                break;
                
              case 2: // Código do cupom
                session.data.code = content.toUpperCase();
                
                // Tentamos deletar a mensagem do usuário
                await message.delete().catch(() => {
                  console.log('Não foi possível apagar a mensagem do usuário');
                });
                
                session.step++;
                await this.sendQuestion(interaction);
                break;
                
              case 4: // Valor do desconto
                const discountValue = parseFloat(content.replace(',', '.'));
                
                if (isNaN(discountValue) || discountValue <= 0) {
                  await channel.send({
                    content: `❌ Valor de desconto inválido. Por favor, digite apenas números maiores que zero.`,
                    ephemeral: false
                  }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                  });
                  
                  // Tentamos deletar a mensagem do usuário
                  await message.delete().catch(() => {});
                  return;
                }
                
                session.data.discountValue = discountValue;
                
                // Tentamos deletar a mensagem do usuário
                await message.delete().catch(() => {
                  console.log('Não foi possível apagar a mensagem do usuário');
                });
                
                session.step++;
                await this.sendQuestion(interaction);
                break;
                
              case 5: // Valor mínimo para usar o cupom
                const minValue = parseFloat(content.replace(',', '.'));
                
                if (isNaN(minValue) || minValue < 0) {
                  await channel.send({
                    content: `❌ Valor mínimo inválido. Por favor, digite apenas números não negativos.`,
                    ephemeral: false
                  }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                  });
                  
                  // Tentamos deletar a mensagem do usuário
                  await message.delete().catch(() => {});
                  return;
                }
                
                session.data.minOrderValue = minValue;
                
                // Tentamos deletar a mensagem do usuário
                await message.delete().catch(() => {
                  console.log('Não foi possível apagar a mensagem do usuário');
                });
                
                session.step++;
                await this.sendQuestion(interaction);
                break;
            }
          } catch (error) {
            console.error('Erro ao processar resposta de texto:', error);
            await channel.send({
              content: `❌ Ocorreu um erro ao processar sua resposta.`,
              ephemeral: false
            }).then(msg => {
              setTimeout(() => msg.delete().catch(() => {}), 5000);
            });
          }
        });
        
        collector.on('end', (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            interaction.followUp({
              content: '⏱️ Tempo esgotado. Por favor, inicie o assistente novamente.',
              ephemeral: true
            }).catch(() => {});
            this.sessions.delete(userId);
          }
        });
        
        return;
      } catch (error) {
        console.error('Erro ao iniciar coletor de mensagens:', error);
        return interaction.followUp({
          content: '❌ Ocorreu um erro ao processar sua resposta.',
          ephemeral: true
        });
      }
    }
  }

  /**
   * Finaliza o assistente e cria o cupom
   */
  async finishWizard(interaction) {
    const userId = interaction.user.id;
    const session = this.sessions.get(userId);

    if (!session) {
      return interaction.reply({
        content: '❌ Sessão não encontrada.',
        ephemeral: true
      });
    }

    try {
      // Verificar se todos os dados obrigatórios estão presentes
      const requiredFields = ['name', 'discountType', 'discountValue', 'minOrderValue', 'maxUses', 'minProducts'];
      // Para criação, código é obrigatório
      if (!session.isEditing) {
        requiredFields.push('code');
      }
      const missingFields = requiredFields.filter(field => session.data[field] === undefined);
      
      console.log('Dados da sessão:', JSON.stringify(session.data, null, 2));
      console.log('Campos ausentes:', missingFields);
      
      // Se estiver faltando algum campo
      if (missingFields.length > 0) {
        // Mapeamento amigável dos nomes de campos
        const fieldNames = {
          name: 'Nome do Cupom',
          code: 'Código do Cupom',
          discountType: 'Tipo de Desconto',
          discountValue: 'Valor do Desconto',
          minOrderValue: 'Valor Mínimo do Pedido',
          maxUses: 'Número Máximo de Usos',
          minProducts: 'Quantidade Mínima de Produtos'
        };
        
        // Criar lista dos campos que faltam
        const missingFieldsList = missingFields.map(field => `- ${fieldNames[field]}`).join('\n');
        
        return interaction.update({
          content: `❌ Dados incompletos. Os seguintes campos precisam ser preenchidos:\n\n${missingFieldsList}\n\nPor favor, reinicie o assistente para completar todas as etapas.`,
          embeds: [],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('coupon_wizard_restart')
                .setLabel('Reiniciar')
                .setStyle(ButtonStyle.Primary)
            )
          ],
          ephemeral: true
        });
      }

      // Criar ou atualizar o cupom no banco de dados
      let coupon;
      if (session.isEditing) {
        // Editar cupom existente
        const couponId = session.data._id;
        delete session.data._id; // Remover o ID para não tentar modificá-lo
        
        await Coupon.findByIdAndUpdate(couponId, session.data);
        coupon = await Coupon.findById(couponId);
      } else {
        // Criar novo cupom
        coupon = new Coupon(session.data);
        await coupon.save();
      }

      // Remover a sessão
      this.sessions.delete(userId);

      // Mostrar resumo do cupom criado/editado
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(session.isEditing ? '✅ Cupom Atualizado com Sucesso!' : '✅ Cupom Criado com Sucesso!')
        .setDescription(session.isEditing ? 'Seu cupom de desconto foi atualizado.' : 'Seu cupom de desconto foi criado.')
        .addFields(
          { name: 'Nome', value: coupon.name, inline: true },
          { name: 'Código', value: coupon.code, inline: true },
          { name: 'Desconto', value: coupon.discountType === 'fixed' ? `R$ ${coupon.discountValue.toFixed(2)}` : `${coupon.discountValue}%`, inline: true },
          { name: 'Valor Mínimo', value: `R$ ${coupon.minOrderValue.toFixed(2)}`, inline: true },
          { name: 'Mín. Produtos', value: `${coupon.minProducts}`, inline: true },
          { name: 'Usos Máximos', value: `${coupon.maxUses}`, inline: true }
        );
      
      if (coupon.expiresAt) {
        embed.addFields({ name: 'Expira em', value: coupon.expiresAt.toLocaleDateString('pt-BR'), inline: true });
      }
      
      if (coupon.onlyForPreviousCustomers) {
        embed.addFields({ name: 'Restrição', value: 'Apenas para clientes que já compraram antes', inline: true });
      }

      const components = [];
      
      // Adicionar botão para divulgar o cupom apenas para novos cupons
      if (!session.isEditing) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`coupon_share_${coupon._id}`)
              .setLabel('Divulgar Cupom')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('coupon_wizard_close')
              .setLabel('Fechar')
              .setStyle(ButtonStyle.Secondary)
          )
        );
      } else {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('coupon_wizard_close')
              .setLabel('Fechar')
              .setStyle(ButtonStyle.Secondary)
          )
        );
      }

      return interaction.update({
        content: null,
        embeds: [embed],
        components: components,
        ephemeral: true
      });
    } catch (error) {
      console.error('Erro ao criar cupom:', error);
      
      return interaction.update({
        content: `❌ Erro ao criar cupom: ${error.message}`,
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('coupon_wizard_restart')
              .setLabel('Tentar Novamente')
              .setStyle(ButtonStyle.Primary)
          )
        ],
        ephemeral: true
      });
    }
  }
}

// Instância única do assistente
const couponWizard = new CouponWizard();

module.exports = couponWizard; 