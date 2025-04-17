const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionsBitField } = require('discord.js');
const Ticket = require('../models/Ticket');
const Config = require('../models/Config');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const { CartManager } = require('../utils/cartManager');
const { safeMessageEdit } = require('../utils/embedUtils');

// Add updateEmbed function
async function updateEmbed(channel, ticket) {
  if (!channel || !ticket) return;

  try {
    const message = await channel.messages.fetch(ticket.messageId);

    const embed = new EmbedBuilder()
      .setColor(ticket.embedSettings?.color || '#5865F2')
      .setTitle(ticket.embedSettings?.title || 'Sistema de Tickets')
      .setDescription(ticket.embedSettings?.description || 'Clique no botão abaixo para abrir um ticket.');

    if (ticket.embedSettings?.image) {
      embed.setImage(ticket.embedSettings.image);
    }

    // Create menu if using menu mode
    const components = [];
    if (ticket.embedSettings?.useMenu && ticket.embedSettings.menuOptions?.length > 0) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('create_ticket')
        .setPlaceholder(ticket.embedSettings.menuPlaceholder || 'Selecione uma opção')
        .addOptions(ticket.embedSettings.menuOptions.map(opt => ({
          label: opt.label,
          value: opt.value,
          description: opt.description,
          emoji: opt.emoji
        })));

      components.push(new ActionRowBuilder().addComponents(menu));
    }

    // Usar a função segura para preservar qualquer componente existente que não estamos substituindo
    await safeMessageEdit(message, embed, components);

  } catch (error) {
    console.error('Erro ao atualizar embed:', error);
  }
}

// Função auxiliar para criar botões de navegação
function createNavigationButtons(currentPage, totalPages) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder();

  // Botão para voltar ao início
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('delivery_channel_reset')
      .setLabel('↩️ Voltar ao Início')
      .setStyle(ButtonStyle.Secondary)
  );

  // Botão para carregar mais canais
  if (currentPage < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('delivery_channel_more')
        .setLabel('⏩ Carregar Mais')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return row;
}

// Função para obter os canais do servidor
function getServerChannels(guild) {
  return guild.channels.cache
    .filter(c => c.type === 0) // Text channels
    .map(c => ({
      label: c.name.length > 25 ? c.name.substring(0, 22) + '...' : c.name,
      value: c.id
    }));
}

// Função para criar o menu de canais com paginação
function createChannelMenu(channels, page = 0) {
  const PRODUCTS_PER_PAGE = 25;
  const totalPages = Math.ceil(channels.length / PRODUCTS_PER_PAGE);
  const startIndex = page * PRODUCTS_PER_PAGE;
  const endIndex = startIndex + PRODUCTS_PER_PAGE;
  const currentChannels = channels.slice(startIndex, endIndex);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('delivery_channel')
    .setPlaceholder(`Selecione o canal de entrega (Página ${page + 1}/${totalPages})`)
    .addOptions(currentChannels);

  const menuRow = new ActionRowBuilder().addComponents(menu);
  const navigationRow = createNavigationButtons(page, totalPages);

  return {
    content: '📢 Selecione o canal para enviar a confirmação:',
    components: [menuRow, navigationRow],
    ephemeral: true
  };
}

// Exportar a função para ser usada por outros módulos
module.exports = {
  name: Events.InteractionCreate,
  updateEmbed,
  async execute(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    // Verificar se é um botão de paginação de canais
    if (interaction.isButton() && 
        (interaction.customId === 'delivery_channel_more' || 
         interaction.customId === 'delivery_channel_reset')) {
      try {
        const channels = getServerChannels(interaction.guild);
        const currentPage = interaction.customId === 'delivery_channel_more' 
          ? parseInt(interaction.message.components[0].components[0].placeholder.match(/Página (\d+)/)[1])
          : 0;

        const menuOptions = createChannelMenu(channels, currentPage);
        await interaction.update(menuOptions);
        return;
      } catch (error) {
        console.error('Erro ao processar paginação de canais:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar a paginação.',
          ephemeral: true
        });
        return;
      }
    }

    if (interaction.customId === 'validate_payment') {
      try {
        // Verificar permissões do usuário (apenas administradores podem validar)
        const member = interaction.guild.members.cache.get(interaction.user.id);
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({
            content: '❌ Apenas administradores podem validar pagamentos.',
            ephemeral: true
          });
          return;
        }

        // Obter o ID do canal (pode ser thread ou canal normal)
        const channelId = interaction.channel.id;
        
        // Buscar informações do ticket usando o método aprimorado
        let ticket = await Ticket.findOne({ 
          threadId: channelId,
          status: { $ne: 'closed' }
        });

        if (!ticket && !interaction.channel.isThread()) {
          ticket = await Ticket.findOne({ 
            threadId: channelId, 
            categoryId: { $exists: true },
            status: { $ne: 'closed' }
          });
        }
        
        if (!ticket) {
          ticket = await Ticket.findOne({
            channelId: channelId,
            status: { $ne: 'closed' }
          });
        }

        if (!ticket) {
          return interaction.reply({
            content: '❌ Ticket não encontrado.',
            ephemeral: true
          });
        }

        // Verificar se há um comprovante registrado
        if (!ticket.deliveryStatus || !ticket.deliveryStatus.proofImage) {
          return interaction.reply({
            content: '❌ Não há comprovante de pagamento registrado para este ticket.',
            ephemeral: true
          });
        }

        // Get or create guild config to track sales
        let guildConfig = await Config.findOne({ guildId: interaction.guild.id });
        if (!guildConfig) {
          guildConfig = new Config({ guildId: interaction.guild.id });
        }
        
        // Increment sales counter
        guildConfig.salesCount = (guildConfig.salesCount || 0) + 1;
        await guildConfig.save();

        // Buscar o carrinho do usuário para obter informações sobre produtos adicionais
        const buyerCart = await CartManager.getCart(ticket.userId);
        let productDescription = "";

        // Obter o produto principal de forma mais confiável
        const selectedOption = ticket.embedSettings.menuOptions?.find(
          opt => opt.value === ticket.selectedOption
        );

        // Buscar o produto do banco de dados para obter informações mais precisas
        let product = null;
        try {
          if (ticket.selectedOption) {
            product = await Product.findOne({ optionId: ticket.selectedOption });
          }
        } catch (error) {
          console.error('Erro ao buscar produto do banco de dados:', error);
          product = null;
        }

        // Nome do produto principal
        let productName = (product && product.label) ? product.label : 
                         (selectedOption && selectedOption.label) ? selectedOption.label : 
                         ticket.embedSettings.title || 'Produto';

        // Usar o total final do carrinho
        const cartTotal = buyerCart?.finalTotal || ticket?.cart?.totalPrice || 0;
        const paidAmount = ticket.deliveryStatus.paidAmount || 0;
        
        let paymentInfoMessage = '';
        if (Math.abs(paidAmount - cartTotal) < 0.01) {
          paymentInfoMessage = `\n✅ Valor identificado no comprovante: R$ ${paidAmount.toFixed(2)}\nValor corresponde ao total da compra.`;
        } else if (paidAmount < cartTotal) {
          const missingAmount = (cartTotal - paidAmount).toFixed(2);
          paymentInfoMessage = `\n⚠️ Valor identificado no comprovante: R$ ${paidAmount.toFixed(2)}\nValor menor que o total da compra (R$ ${cartTotal.toFixed(2)})\nFalta: R$ ${missingAmount}`;
        } else {
          paymentInfoMessage = `\n📝 Valor identificado no comprovante: R$ ${paidAmount.toFixed(2)}\nValor maior que o total da compra (R$ ${cartTotal.toFixed(2)})`;
        }

        await interaction.reply({
          content: `📸 Envie uma imagem/link da entrega (opcional) ou digite "pular"${paymentInfoMessage}`,
          ephemeral: true
        });

        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({
          filter,
          max: 1,
          time: 86400000
        });

        const response = collected.first();
        let deliveryImage = null;

        if (response.attachments.size > 0) {
          deliveryImage = response.attachments.first().url;
        } else if (response.content.startsWith('http')) {
          deliveryImage = response.content;
        }

        // Get channels for delivery message
        const channels = getServerChannels(interaction.guild);

        if (channels.length === 0) {
          return interaction.followUp({
            content: '❌ Não encontrei nenhum canal de texto no servidor.',
            ephemeral: true
          });
        }

        const menuOptions = createChannelMenu(channels, 0);
        await interaction.followUp(menuOptions);

        // Save delivery info
        ticket.deliveryStatus = {
          ...ticket.deliveryStatus,
          delivered: true,
          deliveryImage,
          sellerId: interaction.user.id
        };
        
        await ticket.save();

        // In the validate_payment handler
        if (ticket?.embedSettings?.stock) {
          try {
            const stock = JSON.parse(ticket.embedSettings.stock);
            if (stock.length > 0) {
              const product = stock.shift(); // Remove first product from stock
              
              try {
                // Try to send to user's DM
                const user = await interaction.client.users.fetch(ticket.deliveryStatus.buyerId);
                await user.send({
                  content: `🎉 Seu produto foi entregue!\n\n${product.content}`
                });

                // Update stock
                ticket.embedSettings.stock = JSON.stringify(stock);
                await ticket.save();

                // Send message in thread
                await interaction.channel.send({
                  content: `✅ Produto enviado no privado de <@${ticket.deliveryStatus.buyerId}>!\n⚠️ Este canal será deletado em 1 minuto.`
                });

                // Delete thread after 1 minute
                setTimeout(async () => {
                  try {
                    await interaction.channel.delete('Venda concluída');
                  } catch (err) {
                    console.error('Erro ao deletar canal:', err);
                  }
                }, 60000);  

              } catch (dmError) {
                // If DM fails, send in thread
                await interaction.channel.send({
                  content: `❌ Não foi possível enviar no privado. **PRODUTO:**\n\n${product.content}\n\n⚠️ Este canal será deletado em 1 minuto, salve seu produto!`
                });

                setTimeout(async () => {
                  try {
                    await interaction.channel.delete('Venda concluída');
                  } catch (err) {
                    console.error('Erro ao deletar canal:', err);
                  }
                }, 60000);
              }
            }
          } catch (error) {
            console.error('Erro ao processar estoque:', error);
          }
        }

        // Inside the payment validation handler, after confirming payment
        if (ticket?.embedSettings?.menuOptions) {
          // Find selected option
          const selectedOption = ticket.embedSettings.menuOptions.find(opt => 
            opt.value === ticket.selectedOption // You'll need to store this when user selects an option
          );

          if (selectedOption && selectedOption.stock > 0) {
            // Decrease stock
            selectedOption.stock--;
            
            // Update description with new stock
            selectedOption.description = selectedOption.description.replace(
              /Estoque: \d+/, 
              `Estoque: ${selectedOption.stock}`
            );

            await ticket.save();
            await updateEmbed(interaction.channel, ticket);

            // If stock reaches 0, you might want to disable/remove the option
            if (selectedOption.stock === 0) {
              // Remove option or mark as out of stock
              ticket.embedSettings.menuOptions = ticket.embedSettings.menuOptions.filter(
                opt => opt.value !== selectedOption.value
              );
              await ticket.save();
              await updateEmbed(interaction.channel, ticket);
            }
          }
        }

        // Inside the payment validation handler
        if (interaction.customId === 'validate_payment') {
          try {
              // Já temos o ticket carregado, não precisamos buscar novamente
              if (!ticket.selectedOption) {
                console.log('Nenhuma opção selecionada no ticket');
                return;
              }
        
            // Obter o ID do comprador corretamente - baseado no nome do canal
            let buyerId = ticket.userId; // Primeira preferência: usar o ID armazenado no ticket
            
            // Extrair o ID diretamente do título do canal
            const channelTopic = interaction.channel.topic || '';
            console.log(`Canal topic: "${channelTopic}"`);
            const userIdMatch = channelTopic.match(/user-id:(\d+)/);
            
            if (userIdMatch && userIdMatch[1]) {
              buyerId = userIdMatch[1];
              console.log(`Encontrou ID do comprador no título do canal: ${buyerId}`);
            }
            // Se não encontrou no título, extrair do nome do canal
            else if (interaction.channel.name.includes('user-id:')) {
              const channelNameMatch = interaction.channel.name.match(/user-id:(\d+)/);
              if (channelNameMatch && channelNameMatch[1]) {
                buyerId = channelNameMatch[1];
                console.log(`Encontrou ID do comprador no nome do canal: ${buyerId}`);
              }
            }
            // Se está em um canal de carrinho, extrair do nome do canal
            else if (interaction.channel.name.startsWith('carrinho-')) {
              const channelNameParts = interaction.channel.name.split('-');
              if (channelNameParts.length > 1) {
                // Tentativa simples de obter o nome do usuário
                const possibleUsername = channelNameParts[1];
                console.log(`Nome possível do usuário extraído do canal: ${possibleUsername}`);
                
                try {
                  // Buscar todos os membros e tentar encontrar por nome
                  const members = await interaction.guild.members.fetch();
                  const possibleBuyer = members.find(m => 
                    m.user.username === possibleUsername || 
                    m.user.username.toLowerCase() === possibleUsername.toLowerCase()
                  );
                  
                  if (possibleBuyer) {
                    buyerId = possibleBuyer.id;
                    console.log(`Encontrou ID do comprador pelo nome no canal: ${buyerId}`);
                  }
                } catch (error) {
                  console.error('Erro ao buscar membros:', error);
                }
              }
            }
            
            // Se não encontrou pelo título ou nome do canal, tentar outras opções
            if (!buyerId) {
              if (ticket.deliveryStatus?.buyerId) {
                // Verificar se é um ID válido (números)
                if (/^\d+$/.test(ticket.deliveryStatus.buyerId)) {
                  buyerId = ticket.deliveryStatus.buyerId;
                } else {
                  // Se não for um ID numérico, pode ser o nome de usuário
                  // Tentar buscar o usuário pelo nome
                  try {
                    const members = await interaction.guild.members.fetch();
                    const member = members.find(m => 
                      m.user.username === ticket.deliveryStatus.buyerId || 
                      m.user.username.toLowerCase() === ticket.deliveryStatus.buyerId.toLowerCase()
                    );
                    if (member) {
                      buyerId = member.user.id;
                      console.log(`Encontrou ID do comprador pelo nome de usuário: ${buyerId}`);
                    }
                  } catch (error) {
                    console.error('Erro ao buscar membro pelo nome:', error);
                  }
                }
              }
            }
        
            // Definir o ID do comprador no ticket
            if (!ticket.deliveryStatus) {
              ticket.deliveryStatus = {};
            }
            
            // Guardar o ID encontrado no deliveryStatus
            ticket.deliveryStatus.buyerId = buyerId;
            ticket.deliveryStatus.sellerId = interaction.user.id;
            
            // Log para diagnóstico
            console.log(`ID do comprador definido no ticket: ${buyerId}`);
            console.log(`ID do vendedor definido no ticket: ${interaction.user.id}`);
            
            // Salvar imediatamente para garantir que outras partes do código tenham acesso a este ID
            await ticket.save();
            
            // Buscar o carrinho do usuário para processar todos os itens
            const buyerCart = await CartManager.getCart(buyerId);
            if (!buyerCart || !buyerCart.items || buyerCart.items.length === 0) {
              console.log('Carrinho vazio');
              return interaction.followUp({
                content: '❌ Erro: Carrinho vazio.',
                ephemeral: true
              });
            }
          
            // Log para debug
            console.log(`Processando venda para ${buyerId} com ${buyerCart.items.length} itens no carrinho`);
            console.log(`Conteúdo do carrinho:`, JSON.stringify(buyerCart.items, null, 2));
            
            // Processar o produto principal
            const mainProduct = await Product.findOne({ 
              $or: [
                { ticketId: ticket.messageId, optionId: ticket.selectedOption },
                { optionId: ticket.selectedOption }
              ]
            });
          
            if (!mainProduct) {
              console.log('Produto principal não encontrado:', ticket.selectedOption);
              return interaction.followUp({
                content: '❌ Produto principal não encontrado.',
                ephemeral: true
              });
            }
          
            // Log mais detalhado do produto encontrado
            console.log(`Produto principal encontrado: ID=${mainProduct._id}, optionId=${mainProduct.optionId}, label=${mainProduct.label}, estoque=${mainProduct.stock}`);
          
            // Mapear os produtos adicionais para buscar no banco de dados
            const additionalItems = buyerCart.items.filter(item => 
              !item.isMainProduct && 
              (item.relatedToMain === ticket.selectedOption || 
               item.relatedToMain === mainProduct.optionId)
            );
            console.log(`Produtos adicionais encontrados: ${additionalItems.length}`);
            additionalItems.forEach((item, index) => {
              console.log(`Item adicional ${index+1}: ${item.name}, ID: ${item.productId}, Relacionado a: ${item.relatedToMain}`);
            });
          
            // Array para armazenar mensagens de confirmação
            let confirmationMessages = [];
            let totalItemsSold = 0;
            let totalSalesValue = 0;
          
            // Processa o produto principal
            const mainItem = buyerCart.items.find(item => item.isMainProduct || item.productId === ticket.selectedOption);
            if (mainItem) {
              const quantity = mainItem.quantity || 1;
              totalItemsSold += quantity;
              
              // Verificar se há estoque suficiente
              if (mainProduct.stock < quantity) {
                return interaction.followUp({
                  content: `❌ Estoque insuficiente para ${mainProduct.label}! Estoque atual: ${mainProduct.stock}, Quantidade selecionada: ${quantity}`,
                  ephemeral: true
                });
              }
              
              // Diminuir estoque do produto principal
              mainProduct.stock -= quantity;
              
              // Atualizar descrição do produto principal
              mainProduct.description = mainProduct.originalDescription
                .replace(/\[preco\]/g, `R$ ${mainProduct.price.toFixed(2)}`)
                .replace(/\[estoque\]/g, mainProduct.stock.toString())
                .replace(/\[vendas\]/g, (mainProduct.totalSales || 0).toString())
              .replace(/\[vendedor\]/g, interaction.user.username);
        
            // Atualizar total de vendas
              mainProduct.totalSales = (mainProduct.totalSales || 0) + quantity;
              await mainProduct.save();
        
            // Registrar a venda do produto principal
            await Sale.create({
              userId: buyerId,
                productId: mainProduct.optionId,
              quantity: quantity,
                totalPrice: mainProduct.price * quantity
            });
              
              // Adicionar mensagem de confirmação
              const mainProductValue = mainProduct.price * quantity;
              totalSalesValue += mainProductValue;
              confirmationMessages.push(`✅ ${quantity}x ${mainProduct.label} (R$ ${mainProductValue.toFixed(2)})`);
        
            // Atualizar opção no menu do ticket
              const optionIndex = ticket.embedSettings.menuOptions?.findIndex(
              opt => opt.value === ticket.selectedOption
            );
        
            if (optionIndex !== -1) {
                ticket.embedSettings.menuOptions[optionIndex].description = mainProduct.description;
              }
            }
          
            // Processar produtos adicionais
            for (const additionalItem of additionalItems) {
              try {
                console.log(`Processando produto adicional: ${additionalItem.name}, ID: ${additionalItem.productId}`);
                
                // Tenta encontrar o produto adicional com várias estratégias
                let additionalProduct = await Product.findOne({ 
                  optionId: additionalItem.productId
                });
                
                // Se não encontrou, tenta buscar por similaridade de nome
                if (!additionalProduct && additionalItem.name) {
                  // Tenta encontrar por correspondência exata ou aproximada no nome/label
                  additionalProduct = await Product.findOne({
                    label: additionalItem.name
                  });
                  
                  if (!additionalProduct) {
                    // Última tentativa: regex para busca flexível
                    additionalProduct = await Product.findOne({
                      label: { $regex: new RegExp(additionalItem.name, 'i') }
                    });
                  }
                }
                
                if (additionalProduct) {
                  console.log(`Produto adicional encontrado: ${additionalProduct.label}, ID: ${additionalProduct._id}, optionId: ${additionalProduct.optionId}, estoque: ${additionalProduct.stock}`);
                  
                  const quantity = additionalItem.quantity || 1;
                  totalItemsSold += quantity;
                  
                  // Verificar estoque do produto adicional
                  if (additionalProduct.stock < quantity) {
                    console.log(`Estoque insuficiente para ${additionalProduct.label}: tem ${additionalProduct.stock}, precisa de ${quantity}`);
                    confirmationMessages.push(`⚠️ Estoque insuficiente para ${additionalProduct.label}. Pulado.`);
                    continue;
                  }
                  
                  // Diminuir estoque do produto adicional
                  additionalProduct.stock -= quantity;
                  console.log(`Novo estoque de ${additionalProduct.label}: ${additionalProduct.stock}`);
                  
                  // Atualizar descrição do produto adicional
                  if (additionalProduct.originalDescription) {
                    additionalProduct.description = additionalProduct.originalDescription
                      .replace(/\[preco\]/g, `R$ ${additionalProduct.price.toFixed(2)}`)
                      .replace(/\[estoque\]/g, additionalProduct.stock.toString())
                      .replace(/\[vendas\]/g, (additionalProduct.totalSales || 0).toString())
                      .replace(/\[vendedor\]/g, interaction.user.username);
                  } else if (additionalProduct.description) {
                    // Se não tiver originalDescription, vamos alterar a própria descrição
                    // Isso é menos ideal, mas melhor que não atualizar
                    additionalProduct.description = additionalProduct.description
                      .replace(/Estoque: \d+/, `Estoque: ${additionalProduct.stock}`);
                  }
                  
                  // Atualizar total de vendas do produto adicional
                  additionalProduct.totalSales = (additionalProduct.totalSales || 0) + quantity;
                  console.log(`Salvando produto adicional com novo estoque: ${additionalProduct.stock}`);
                  await additionalProduct.save();
                  
                  // NOVO: Atualizar o produto adicional no menu de opções do ticket
                  // Procurar pelo produto nas opções do menu 
                  if (ticket.embedSettings?.menuOptions) {
                    // Procurar pelo produto nas opções do menu
                    const additionalMenuIndex = ticket.embedSettings.menuOptions.findIndex(
                      option => 
                        option.value === additionalProduct.optionId || 
                        (option.label && additionalProduct.label && 
                         option.label.toLowerCase() === additionalProduct.label.toLowerCase())
                    );
                    
                    // Se encontrou o produto no menu, atualiza a descrição
                    if (additionalMenuIndex !== -1) {
                      const menuOption = ticket.embedSettings.menuOptions[additionalMenuIndex];
                      console.log(`Encontrou produto adicional no menu: ${menuOption.label}`);
                      console.log(`Descrição atual do menu: "${menuOption.description}"`);
                      
                      // Guardar descrição original para comparação
                      const originalDescription = menuOption.description;
                      
                      // Atualizar descrição com novo estoque
                      if (menuOption.description.includes('[estoque]')) {
                        // Se contém [estoque], substitui diretamente pelo valor numérico
                        menuOption.description = menuOption.description.replace(
                          /\[estoque\]/g, 
                          additionalProduct.stock.toString()
                        );
                        console.log(`Substituiu [estoque] por ${additionalProduct.stock} na descrição`);
                      } else if (menuOption.description.match(/Estoque:\s*\d+/)) {
                        // Se contém "Estoque: X", substitui apenas o número
                        menuOption.description = menuOption.description.replace(
                          /Estoque:\s*\d+/, 
                          `Estoque: ${additionalProduct.stock}`
                        );
                        console.log(`Substituiu "Estoque: X" por "Estoque: ${additionalProduct.stock}" na descrição`);
                      } else {
                        // Quando a descrição não segue nenhum dos padrões conhecidos
                        // Verifica se a descrição é apenas um número (caso comum quando só colocam o estoque)
                        if (/^\d+$/.test(menuOption.description.trim())) {
                          // Se a descrição é apenas um número, substitui pelo novo valor de estoque
                          menuOption.description = additionalProduct.stock.toString();
                          console.log(`Descrição era apenas um número, agora é ${additionalProduct.stock}`);
                        } else {
                          // Tenta localizar qualquer número na descrição e substituir pelo estoque
                          const numberMatch = menuOption.description.match(/\b\d+\b/);
                          if (numberMatch) {
                            menuOption.description = menuOption.description.replace(
                              /\b\d+\b/, 
                              additionalProduct.stock.toString()
                            );
                            console.log(`Substituiu número ${numberMatch[0]} por ${additionalProduct.stock} na descrição`);
                          } else {
                            // Se não conseguir determinar onde está o estoque, adiciona no final
                            menuOption.description = `${menuOption.description} (Estoque: ${additionalProduct.stock})`;
                            console.log(`Não encontrou padrão de estoque, adicionou no final da descrição`);
                          }
                        }
                      }
                      
                      // Verificar se a descrição foi realmente alterada
                      if (originalDescription === menuOption.description) {
                        console.log(`AVISO: A descrição não foi alterada após tentativas de substituição!`);
                      }
                      
                      console.log(`Descrição atualizada para: "${menuOption.description}"`);
                      
                      // Atualizar a opção no menu
                      ticket.embedSettings.menuOptions[additionalMenuIndex] = menuOption;
                      
                      // Se estoque chegou a zero, opcionalmente remover o produto do menu
                      if (additionalProduct.stock <= 0 && ticket.embedSettings.removeZeroStock) {
                        console.log(`Removendo produto com estoque zero: ${additionalProduct.label}`);
                        ticket.embedSettings.menuOptions.splice(additionalMenuIndex, 1);
                      }
                    } else {
                      console.log(`Produto adicional não encontrado no menu: ${additionalProduct.label}`);
                    }
                  }
                  
                  // Registrar a venda do produto adicional
                  const saleRecord = await Sale.create({
                    userId: buyerId,
                    productId: additionalProduct.optionId || additionalProduct._id.toString(),
                    quantity: quantity,
                    totalPrice: additionalProduct.price * quantity,
                    isAdditional: true,
                    relatedToMain: mainProduct?.optionId || null
                  });
                  console.log(`Registro de venda criado para item adicional: ${saleRecord._id}`);
                  
                  // Adicionar mensagem de confirmação
                  const additionalProductValue = additionalProduct.price * quantity;
                  totalSalesValue += additionalProductValue;
                  confirmationMessages.push(`✅ ${quantity}x ${additionalProduct.label} (adicional - R$ ${additionalProductValue.toFixed(2)})`);
                } else {
                  console.log(`Produto adicional não encontrado após múltiplas tentativas: ${additionalItem.productId}, Nome: ${additionalItem.name}`);
                  confirmationMessages.push(`⚠️ Produto adicional não encontrado: ${additionalItem.name}`);
                }
              } catch (error) {
                console.error(`Erro ao processar produto adicional ${additionalItem.productId}:`, error);
                confirmationMessages.push(`❌ Erro ao processar ${additionalItem.name}`);
              }
            }
          
            // Salvar o ticket atualizado
              await ticket.save();
        
            // Após processar todos os produtos, atualizar o menu no canal
            try {
              // Salvar as alterações no ticket
              await ticket.save();
              
              // Buscar o canal original
              const originalChannel = interaction.guild.channels.cache.get(ticket.channelId);
              if (originalChannel) {
                console.log(`Atualizando embed no canal ${originalChannel.name} (${originalChannel.id}) com novas quantidades de estoque`);
                
                // Atualizar a embed com as novas opções
                await updateEmbed(originalChannel, ticket);
                
                console.log(`Embed atualizada com sucesso. Produtos atualizados: ${[mainProduct?.label, ...additionalItems.map(i => i.name)].filter(Boolean).join(', ')}`);
              } else {
                console.log(`Canal original não encontrado (ID: ${ticket.channelId})`);
              }
            } catch (error) {
              console.error('Erro ao atualizar embed após processamento:', error);
            }
            
            // Usar o valor final do carrinho que já inclui o desconto do cupom (se houver)
            const displayTotal = buyerCart.finalTotal || totalSalesValue;
            const hasDiscount = buyerCart.discount && buyerCart.discount > 0;
            
            // Mensagem de confirmação adaptada para mostrar desconto, se houver
            let finalConfirmation = `Pagamento validado\n${confirmationMessages}`;
            
            // Se houver desconto, mostrar detalhes
            if (hasDiscount) {
              finalConfirmation += `\n💰 Subtotal: R$ ${totalSalesValue.toFixed(2)}`;
              finalConfirmation += `\n💳 Desconto: R$ ${buyerCart.discount.toFixed(2)}`;
              finalConfirmation += `\n📊 **Total Final:** ${totalItemsSold} item(ns) - R$ ${displayTotal.toFixed(2)}`;
            } else {
              finalConfirmation += `\n📊 **Total:** ${totalItemsSold} item(ns) - R$ ${displayTotal.toFixed(2)}`;
            }
            
            // Enviar mensagem de confirmação com todos os produtos
            await interaction.channel.send({
              content: finalConfirmation
            });
        
            // Enviar mensagem de avaliação para o comprador
            try {
              // Verificar se temos o ID correto do comprador no ticket
              // Usar o buyerId que já foi determinado no início do procedimento
              // em vez de redefinir uma nova variável buyerId

              if (!buyerId) {
                console.error('ID do comprador não encontrado no ticket');
                await interaction.channel.send({
                  content: '⚠️ Não foi possível identificar o comprador para enviar mensagem de avaliação.',
                  ephemeral: false
                });
                return;
              }
              
              // Buscar o usuário comprador pelo ID correto
              const buyerUser = await interaction.client.users.fetch(buyerId);
              if (buyerUser) {
                // Criar IDs de botões que podem ser facilmente processados
                const reviewPositiveId = `review_positive_${Date.now()}`;
                const reviewNegativeId = `review_negative_${Date.now()}`;
                
                // Salvar informações da venda para quando o usuário avaliar
                const reviewInfo = {
                  sellerId: interaction.user.id,
                  sellerTag: interaction.user.tag,
                  buyerId: buyerId,
                  ticketId: ticket.threadId,
                  saleId: Date.now().toString(),
                  products: confirmationMessages.map(msg => msg.replace(/^✅ /, '')),
                  totalValue: displayTotal || totalSalesValue, // Usar o valor final com desconto
                  hasDiscount: hasDiscount,
                  originalValue: totalSalesValue,
                  discountValue: buyerCart.discount || 0,
                  guildId: interaction.guild.id,
                  guildName: interaction.guild.name,
                  timestamp: new Date().toISOString()
                };
                
                // Armazenar essas informações em um modelo temporário ou no config
                let guildConfig = await Config.findOne({ guildId: interaction.guild.id });
                if (!guildConfig) {
                  guildConfig = new Config({ guildId: interaction.guild.id });
                }
                
                // Adicionar à lista de avaliações pendentes
                if (!guildConfig.pendingReviews) {
                  guildConfig.pendingReviews = [];
                }
                
                guildConfig.pendingReviews.push(reviewInfo);
                await guildConfig.save();
                
                // Verificar se existe configuração de cargo para compradores
                if (guildConfig.buyerRoleId) {
                  try {
                    // Obter o membro do servidor usando o mesmo buyerId
                    const member = await interaction.guild.members.fetch(buyerId);
                    console.log(`Tentando adicionar cargo ao membro com ID: ${buyerId}`);
                    
                    if (member) {
                      try {
                        // Adicionar o cargo ao membro
                        await member.roles.add(guildConfig.buyerRoleId);
                        console.log(`Cargo de comprador adicionado ao usuário ${member.user.tag} com ID ${buyerId}`);
                        
                        // Adicionar informação à mensagem de confirmação
                        await interaction.channel.send({
                          content: `✅ Cargo de comprador adicionado a <@${buyerId}>`,
                          ephemeral: false
                        });
                      } catch (roleError) {
                        console.error('Erro ao adicionar cargo de comprador:', roleError);
                        
                        // Verificar se é um erro de permissões
                        let errorMessage = `⚠️ Não foi possível adicionar o cargo de comprador a <@${buyerId}>.`;
                        
                        if (roleError.code === 50013) {
                          // Erro de permissões - obter informações sobre o cargo
                          const role = interaction.guild.roles.cache.get(guildConfig.buyerRoleId);
                          const botMember = interaction.guild.members.cache.get(interaction.client.user.id);
                          
                          if (role && botMember) {
                            if (role.position >= botMember.roles.highest.position) {
                              // Problema de hierarquia
                              errorMessage += ` O cargo **${role.name}** está acima do cargo do bot na hierarquia. Peça a um administrador para mover o cargo do bot para uma posição mais alta nas configurações do servidor.`;
                            } else {
                              // Falta de permissões
                              errorMessage += ` O bot não tem permissão para gerenciar cargos. Verifique as permissões do bot.`;
                            }
                          } else {
                            errorMessage += ` Verifique as permissões do bot e a hierarquia dos cargos.`;
                          }
                        }
                        
                        await interaction.channel.send({
                          content: errorMessage,
                          ephemeral: false
                        });
                      }
                    }
                  } catch (fetchError) {
                    console.error('Erro ao buscar membro do servidor:', fetchError);
                    await interaction.channel.send({
                      content: `⚠️ Não foi possível encontrar o usuário <@${buyerId}> no servidor.`,
                      ephemeral: false
                    });
                  }
                }
                
                // Mensagem amigável com botões simplificados
                let buyerMessage = `🎉 Sua compra foi entregue com sucesso!\n\n`;

                // Se houver carrinho com itens, use as informações do carrinho
                if (buyerCart && buyerCart.items && buyerCart.items.length > 0) {
                    const mainItems = buyerCart.items.filter(item => item.isMainProduct || !item.relatedToMain);
                    const additionalItems = buyerCart.items.filter(item => !item.isMainProduct && item.relatedToMain);
                    
                    buyerMessage += "**Produtos:**\n";
                    
                    for (const item of mainItems) {
                        buyerMessage += `- ${item.quantity}x ${item.name} (R$ ${(item.price * item.quantity).toFixed(2)})\n`;
                    }
                    
                    if (additionalItems.length > 0) {
                        buyerMessage += "\n**Itens adicionais:**\n";
                        for (const item of additionalItems) {
                            buyerMessage += `- ${item.quantity}x ${item.name} (R$ ${(item.price * item.quantity).toFixed(2)})\n`;
                        }
                    }
                } else {
                    // Fallback para o caso de não ter carrinho
                    buyerMessage += `**Produtos:** ${reviewInfo.products.join(', ')}\n`;
                }

                buyerMessage += `**Vendedor:** ${reviewInfo.sellerTag}\n`;
                
                // Adicionar informações de preço do carrinho se disponível, senão usar reviewInfo
                if (buyerCart && buyerCart.finalTotal) {
                    if (buyerCart.discount && buyerCart.discount > 0) {
                        buyerMessage += `**Subtotal:** R$ ${(buyerCart.finalTotal + buyerCart.discount).toFixed(2)}\n`;
                        buyerMessage += `**Desconto:** R$ ${buyerCart.discount.toFixed(2)}\n`;
                    }
                    buyerMessage += `**Total:** R$ ${buyerCart.finalTotal.toFixed(2)}`;
                } else if (reviewInfo.hasDiscount) {
                    buyerMessage += `**Subtotal:** R$ ${reviewInfo.originalValue.toFixed(2)}\n`;
                    buyerMessage += `**Desconto:** R$ ${reviewInfo.discountValue.toFixed(2)}\n`;
                    buyerMessage += `**Total:** R$ ${reviewInfo.totalValue.toFixed(2)}`;
                } else {
                    buyerMessage += `**Total:** R$ ${reviewInfo.totalValue.toFixed(2)}`;
                }
                
                await buyerUser.send({
                  content: buyerMessage
                });
                
                await interaction.channel.send({
                  content: `✅ Mensagem de avaliação enviada para ${buyerUser.tag}`,
                  ephemeral: false
                });
              }
            } catch (dmError) {
              console.error('Erro ao enviar DM de avaliação:', dmError);
              await interaction.channel.send({
                content: '⚠️ Não foi possível enviar mensagem de avaliação para o comprador via DM.',
                ephemeral: false
              });
            }
          
          } catch (error) {
            console.error('Erro ao validar pagamento:', error);
            await interaction.followUp({
              content: '❌ Erro ao validar pagamento.',
              ephemeral: true
            });
          }
        }
      } catch (error) {
        console.error('Erro ao processar validação de pagamento:', error);
        await interaction.followUp({
          content: '❌ Erro ao processar a validação do pagamento.',
          ephemeral: true
        });
      }
    }

    if (interaction.customId === 'delivery_channel') {
      try {
        // Defer a interação para evitar erro de timeout
        await interaction.deferUpdate();
        
        const channelId = interaction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);
        
        // Buscar informações do ticket
        let ticket = await Ticket.findOne({ 
          threadId: interaction.channel.id,
          status: { $ne: 'closed' }
        });
        
        if (!ticket && !interaction.channel.isThread()) {
          ticket = await Ticket.findOne({ 
            threadId: interaction.channel.id, 
            categoryId: { $exists: true },
            status: { $ne: 'closed' }
          });
        }
        
        if (!ticket) {
          ticket = await Ticket.findOne({
            channelId: interaction.channel.id,
            status: { $ne: 'closed' }
          });
        }

        if (!ticket) {
          return interaction.reply({
            content: '❌ Ticket não encontrado.',
            ephemeral: true
          });
        }

        // Get or create guild config to track sales
        let guildConfig = await Config.findOne({ guildId: interaction.guild.id });
        if (!guildConfig) {
          guildConfig = new Config({ guildId: interaction.guild.id });
        }
        
        // Increment sales counter
        guildConfig.salesCount = (guildConfig.salesCount || 0) + 1;
        await guildConfig.save();

        // Buscar o carrinho do usuário
        const buyerCart = await CartManager.getCart(ticket.userId);
        let productDescription = "";

        // Obter o produto principal
        const selectedOption = ticket.embedSettings.menuOptions?.find(
          opt => opt.value === ticket.selectedOption
        );

        // Buscar o produto do banco de dados
        let product = null;
        if (ticket.selectedOption) {
          try {
            product = await Product.findOne({ optionId: ticket.selectedOption });
          } catch (error) {
            console.error('Erro ao buscar produto do banco de dados:', error);
          }
        }

        // Nome do produto principal
        let productName = (product && product.label) ? product.label : 
                         (selectedOption && selectedOption.label) ? selectedOption.label : 
                         ticket.embedSettings.title || 'Produto';
        
        // Se o carrinho existir e tiver itens, crie uma descrição mais detalhada
        if (buyerCart && buyerCart.items && buyerCart.items.length > 0) {
          const mainItems = buyerCart.items.filter(item => item.isMainProduct || !item.relatedToMain);
          const additionalItems = buyerCart.items.filter(item => !item.isMainProduct && item.relatedToMain);
          
          productDescription = "**Produtos:**\n";
          
          for (const item of mainItems) {
            productDescription += `- ${item.quantity}x ${item.name} (R$ ${(item.price * item.quantity).toFixed(2)})\n`;
          }
          
          if (additionalItems.length > 0) {
            productDescription += "\n**Itens adicionais:**\n";
            for (const item of additionalItems) {
              productDescription += `- ${item.quantity}x ${item.name} (R$ ${(item.price * item.quantity).toFixed(2)})\n`;
            }
          }
          
          if (buyerCart.finalTotal) {
            productDescription += `\n**Total:** R$ ${buyerCart.finalTotal.toFixed(2)}`;
            
            if (buyerCart.discount && buyerCart.discount > 0) {
              productDescription += ` (com desconto de R$ ${buyerCart.discount.toFixed(2)})`;
            }
          }
          
          if (mainItems.length > 0) {
            const mainItemName = mainItems[0].name || product?.label || selectedOption?.label || 'Produto';
            
            if (mainItems.length + additionalItems.length > 1) {
              productName = `${mainItemName} + ${mainItems.length + additionalItems.length - 1} item(ns)`;
            } else {
              productName = mainItemName;
            }
          }
        }

        const buyerId = ticket.deliveryStatus.buyerId;
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Comprar também')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${interaction.guild.id}/${ticket.channelId}/${ticket.messageId}`)
          );

        // Obter o nome do comprador
        let buyerName = '';
        let buyerUser = null;
        
        const channelTopic = interaction.channel.topic || '';
        const userIdMatch = channelTopic.match(/user-id:(\d+)/);
        
        if (userIdMatch && userIdMatch[1]) {
          try {
            buyerUser = await interaction.client.users.fetch(userIdMatch[1]);
            buyerName = buyerUser.username;
          } catch (error) {
            console.error('Erro ao buscar usuário:', error);
          }
        } else if (interaction.channel.name.includes('user-id:')) {
          const channelNameMatch = interaction.channel.name.match(/user-id:(\d+)/);
          if (channelNameMatch && channelNameMatch[1]) {
            try {
              buyerUser = await interaction.client.users.fetch(channelNameMatch[1]);
              buyerName = buyerUser.username;
            } catch (error) {
              console.error('Erro ao buscar usuário:', error);
            }
          }
        } else if (ticket.userId) {
          try {
            buyerUser = await interaction.client.users.fetch(ticket.userId);
            buyerName = buyerUser.username;
          } catch (error) {
            console.error('Erro ao buscar usuário:', error);
            buyerName = 'Desconhecido';
          }
        } else if (buyerId && /^\d+$/.test(buyerId)) {
          try {
            buyerUser = await interaction.client.users.fetch(buyerId);
            buyerName = buyerUser.username;
          } catch (error) {
            console.error('Erro ao buscar usuário:', error);
            buyerName = 'Desconhecido';
          }
        } else {
          buyerName = 'Desconhecido';
        }

        let buyerMention = '';
        if (buyerUser) {
          buyerMention = `<@${buyerUser.id}>`;
        } else if (buyerId && /^\d+$/.test(buyerId)) {
          buyerMention = `<@${buyerId}>`;
        }

        const embed = new EmbedBuilder()
          .setTitle(`${interaction.guild.name} | Nova Venda #${guildConfig.salesCount}`)
          .setDescription(`- **Comprador:** ${buyerName}${buyerMention ? ` (${buyerMention})` : ''}\n- **Vendedor:** <@${ticket.deliveryStatus.sellerId}>\n- **Produto:** ${productName}\n- **Data:** ${new Date().toLocaleDateString('pt-BR')}\n- **Hora:** ${new Date().toLocaleTimeString('pt-BR')}\n\n${productDescription}`)
          .setColor('#242429');

        if (ticket.deliveryStatus.deliveryImage) {
          embed.setImage(ticket.deliveryStatus.deliveryImage);
        }

        await channel.send({
          embeds: [embed],
          components: [row]
        });

        await interaction.followUp({
          content: `✅ Confirmação de entrega enviada! (Venda #${guildConfig.salesCount})`,
          ephemeral: true
        });

        await interaction.channel.send('Venda concluída');

      } catch (error) {
        console.error('Erro ao enviar confirmação:', error);
        await interaction.followUp({
          content: '❌ Erro ao enviar confirmação de entrega.',
          ephemeral: true
        });
      }
    }
  }
}

