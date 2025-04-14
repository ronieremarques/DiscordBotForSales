const { Events, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const Ticket = require('../models/Ticket');
const { createWorker } = require('tesseract.js');
const pdf = require('pdf-parse');
const fetch = require('node-fetch');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { createAdditionalProductsMenu } = require('./additionalProductSelector');
const { CartManager } = require('../utils/cartManager');
const Config = require('../models/Config');

// Função para extrair texto de PDF
async function extractTextFromPDF(buffer) {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error('Erro ao ler PDF:', error);
    return null;
  }
}

// Função para extrair valor do pagamento do texto
async function extractPaymentAmount(text) {
  if (!text) return null;
  
  const normalizedText = text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  
  // Padrões para buscar valores monetários em comprovantes brasileiros
  // Vários formatos comuns em comprovantes de PIX, transferências e outros
  const regexPatterns = [
    // PIX e transferências (formatos comuns) - incluindo valores inteiros
    /r\$\s*(\d+[,.]\d+)/i,                                       // R$ 100,00
    /r\$\s*(\d+)(?!\d)/i,                                        // R$ 100 (valor inteiro)
    /valor\s*(?:de|do|:)?\s*(?:pix|pagamento|transferencia)?\s*r\$?\s*(\d+[,.]\d+)/i,  // valor do pix R$ 100,00
    /valor\s*(?:de|do|:)?\s*(?:pix|pagamento|transferencia)?\s*r\$?\s*(\d+)(?!\d)/i,   // valor do pix R$ 100 (inteiro)
    /(?:pagamento|transferencia|pix|total)[^\d]*r\$?\s*(\d+[,.]\d+)/i,   // pagamento: R$ 100,00
    /(?:pagamento|transferencia|pix|total)[^\d]*r\$?\s*(\d+)(?!\d)/i,    // pagamento: R$ 100 (inteiro)
    /(?:valor|quantia)[^\d]*(\d+[,.]\d+)/i,                      // valor: 100,00
    /(?:valor|quantia)[^\d]*(\d+)(?!\d)/i,                       // valor: 100 (inteiro)
    /total[^\d]*(\d+[,.]\d+)/i,                                  // total: 100,00
    /total[^\d]*(\d+)(?!\d)/i,                                   // total: 100 (inteiro)
    /(\d+[,.]\d+)\s*(?:reais|brl|real)/i,                        // 100,00 reais
    /(\d+)\s*(?:reais|brl|real)/i,                               // 100 reais (inteiro)
    
    // Padrões específicos Banco do Brasil
    /valor\s*(?:enviado|recebido)[^\d]*r\$?\s*(\d+[,.]\d+)/i,    // valor enviado R$ 100,00
    /valor\s*(?:enviado|recebido)[^\d]*r\$?\s*(\d+)(?!\d)/i,     // valor enviado R$ 100 (inteiro)
    
    // Padrões específicos Nubank
    /enviou\s*r\$\s*(\d+[,.]\d+)/i,                              // enviou R$ 100,00
    /enviou\s*r\$\s*(\d+)(?!\d)/i,                               // enviou R$ 100 (inteiro)
    /recebeu\s*r\$\s*(\d+[,.]\d+)/i,                             // recebeu R$ 100,00
    /recebeu\s*r\$\s*(\d+)(?!\d)/i,                              // recebeu R$ 100 (inteiro)
    
    // Padrões específicos Itaú
    /valor\s*(?:da\s*)?(?:transacao|transferencia)[^\d]*r\$?\s*(\d+[,.]\d+)/i, // valor da transação R$ 100,00
    /valor\s*(?:da\s*)?(?:transacao|transferencia)[^\d]*r\$?\s*(\d+)(?!\d)/i,  // valor da transação R$ 100 (inteiro)
    
    // Padrões específicos PicPay e aplicativos similares
    /(?:transferiu|enviou|pagou)[^\d]*r\$?\s*(\d+[,.]\d+)/i,     // transferiu R$ 100,00
    /(?:transferiu|enviou|pagou)[^\d]*r\$?\s*(\d+)(?!\d)/i,      // transferiu R$ 100 (inteiro)
    
    // Padrões genéricos para capturar valores monetários
    /r\$?\s*(\d+[,.]\d+)\s*(?:para|de|a)/i,                      // R$ 100,00 para João
    /r\$?\s*(\d+)(?!\d)\s*(?:para|de|a)/i,                       // R$ 100 para João (inteiro)
    
    // Qualquer valor acompanhado de R$
    /r\$\s*(\d+)/i,                                              // R$ seguido de qualquer número
    
    // Último caso - qualquer número com vírgula ou ponto (com limite de dígitos para evitar falsos positivos)
    /(\d+[,.]\d+)(?!\d)/                                         // Qualquer número com vírgula ou ponto
  ];
  
  // Array para armazenar todos os valores encontrados
  const foundValues = [];
  
  // Buscar todos os valores possíveis no texto
  for (const regex of regexPatterns) {
    const matches = normalizedText.matchAll(new RegExp(regex, 'gi'));
    for (const match of matches) {
      if (match && match[1]) {
        // Normalizar o valor (substituir vírgula por ponto)
        const valueText = match[1].replace(',', '.');
        const value = parseFloat(valueText);
        
        if (!isNaN(value) && value > 0) {
          foundValues.push(value);
        }
      }
    }
  }
  
  // Se não encontrou nenhum valor, retorna null
  if (foundValues.length === 0) {
    return null;
  }
  
  // Se encontrou apenas um valor, retorna ele
  if (foundValues.length === 1) {
    return foundValues[0];
  }
  
  // Se encontrou múltiplos valores, retorna o mais provável
  // (geralmente o valor que mais se repete ou o mais alto)
  // Fazemos contagem de frequência e priorizamos valores precedidos por R$
  const valueCounts = {};
  const valueWeights = {}; // Peso para cada valor (maior para valores com R$)
  let maxWeightedScore = 0;
  let bestValue = null;
  
  // Primeiro vamos encontrar valores monetários explícitos no texto original
  const monetaryPatterns = [
    /r\$\s*(\d+(?:[,.]\d+)?)/gi,  // R$ seguido de número (com ou sem decimais)
    /valor\s*(?:de|do|:)?\s*r\$\s*(\d+(?:[,.]\d+)?)/gi, // "valor de R$" seguido de número
    /pagamento\s*(?:de|:)?\s*r\$\s*(\d+(?:[,.]\d+)?)/gi // "pagamento de R$" seguido de número
  ];
  
  const monetaryValues = new Set();
  for (const pattern of monetaryPatterns) {
    const matches = normalizedText.matchAll(pattern);
    for (const match of matches) {
      if (match && match[1]) {
        const valueText = match[1].replace(',', '.');
        const value = parseFloat(valueText);
        if (!isNaN(value) && value > 0) {
          monetaryValues.add(Math.round(value * 100) / 100);
        }
      }
    }
  }
  
  // Contar frequência e atribuir pesos
  for (const value of foundValues) {
    const roundedValue = Math.round(value * 100) / 100; // Arredonda para 2 casas decimais
    
    // Inicializar contagem e peso se não existirem
    valueCounts[roundedValue] = (valueCounts[roundedValue] || 0) + 1;
    valueWeights[roundedValue] = valueWeights[roundedValue] || 0;
    
    // Adicionar peso extra se o valor for explicitamente monetário (precedido por R$)
    if (monetaryValues.has(roundedValue)) {
      valueWeights[roundedValue] += 5; // Peso extra para valores com R$
    }
    
    // Peso baseado na frequência
    const frequencyWeight = valueCounts[roundedValue];
    
    // Calcular pontuação ponderada
    const weightedScore = frequencyWeight + valueWeights[roundedValue];
    
    if (weightedScore > maxWeightedScore) {
      maxWeightedScore = weightedScore;
      bestValue = roundedValue;
    }
  }
  
  // Se não houver valor com alta pontuação mas houver um valor monetário explícito
  if (bestValue === null && monetaryValues.size > 0) {
    // Pegar o primeiro valor monetário explícito
    bestValue = Array.from(monetaryValues)[0];
  }
  
  return bestValue;
}

async function isPaymentProof(attachment) {
  const keywords = ['comprovante', 'comprov', 'payment', 'pix', 'transferencia', 'pagamento', 'recibo'];
  
  try {
    // Check filename first
    const filename = attachment.name.toLowerCase();
    
    // Improved filename check
    const hasKeywordInName = keywords.some(keyword => 
      filename.includes(keyword.toLowerCase())
    );
    
    if (hasKeywordInName) {
      return { isProof: true, text: null, amount: null };
    }

    // Get file extension
    const fileType = filename.split('.').pop().toLowerCase();
    
    // Check if file type is supported
    if (!['png', 'jpg', 'jpeg', 'pdf'].includes(fileType)) {
      return { isProof: false, text: null, amount: null };
    }

    // Rest of OCR logic...
    let text = '';
    const response = await fetch(attachment.url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (fileType === 'pdf') {
      const data = await pdf(buffer);
      text = data.text;
    } else {
      const worker = await createWorker('por');
      const { data } = await worker.recognize(attachment.url);
      text = data.text;
      await worker.terminate();
    }

    if (!text) return { isProof: false, text: null, amount: null };

    const normalizedText = text.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    
    const matchedKeywords = keywords.filter(keyword => 
      normalizedText.includes(keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    );

    // Extrair valor do pagamento
    const amount = await extractPaymentAmount(text);

    return { 
      isProof: matchedKeywords.length >= 2, 
      text, 
      amount 
    };

  } catch (error) {
    console.error('Erro na análise do arquivo:', error);
    return { isProof: false, text: null, amount: null };
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'create_ticket') return;

    try {
      await interaction.deferReply({ ephemeral: true });

      const ticket = await Ticket.findOne({ messageId: interaction.message.id });
      
      if (!ticket) {
        return interaction.editReply({
          content: '❌ Configuração não encontrada.'
        });
      }

      // Check stock if it's a menu selection
      if (interaction.isStringSelectMenu()) {
        const selectedValue = interaction.values[0];
        const selectedOption = ticket.embedSettings.menuOptions.find(
          opt => opt.value === selectedValue
        );

        const message = interaction.message
        message.edit();
        // Find product in database
        const product = await Product.findOne({
          ticketId: ticket.messageId,
          optionId: selectedValue
        });

        // Check if product exists and has stock
        if (!product || product.stock <= 0) {
          // Criar um botão para notificação de estoque
          const notifyButton = new ButtonBuilder()
            .setCustomId(`notify_stock_${selectedValue}`)
            .setLabel('Receber notificação')
            .setEmoji('🔔')
            .setStyle(ButtonStyle.Secondary);
            
          const row = new ActionRowBuilder().addComponents(notifyButton);
          
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#242429')
                .setTitle('Produto sem estoque')
                .setDescription(`Desculpe, este produto está sem estoque no momento. Você pode receber uma notificação quando ele estiver disponível.`)
            ],
            components: [row],
            ephemeral: true
          });
        }
      }

      // Verificar se o usuário já possui um carrinho em thread ou canal
      // Nova função para verificar todos os canais do servidor
      let existingUserChannel = null;
      let existingUserThread = null;
      
      // Buscar todas as threads/canais que possam pertencer ao usuário
      try {
        // Verificar threads por nome de usuário
        existingUserThread = interaction.channel.threads.cache.find(
          thread => thread.name === `${interaction.user.username}`
        );
        
        // Se for do tipo vendas, verificar canais em todas as categorias
        if (ticket.ticketType === 'vendas') {
          // Verificar todos os canais de texto do servidor que pertencem ao usuário
          // usando ID do usuário para garantir que não há confusão entre nomes de usuário similares
          existingUserChannel = interaction.guild.channels.cache.find(
            ch => ch.type === ChannelType.GuildText && 
                 ch.name.startsWith('carrinho-') && 
                 ch.topic && 
                 ch.topic.includes(`user-id:${interaction.user.id}`)
          );
          
          // Remover a verificação por nome do usuário, pois pode causar confusão
          // especialmente se o usuário estiver apenas em um canal que não é dele
        }
      } catch (error) {
        console.error('Erro ao verificar canais existentes:', error);
      }
      
      // Verificar se já existe ticket no banco de dados para este usuário
      let existingTicket = null;
      
      try {
        // Verificar por canais/threads existentes no banco de dados
        if (existingUserChannel) {
          existingTicket = await Ticket.findOne({ 
            threadId: existingUserChannel.id,
            userId: interaction.user.id, // Garantir que o ticket pertence a este usuário
            status: { $ne: 'closed' }
          });
        } else if (existingUserThread) {
          existingTicket = await Ticket.findOne({ 
            threadId: existingUserThread.id,
            userId: interaction.user.id, // Garantir que o ticket pertence a este usuário
            status: { $ne: 'closed' }
          });
        }
        
        // Se não encontrou um ticket para canais existentes, procura em geral
        if (!existingTicket) {
          existingTicket = await Ticket.findOne({ 
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            status: 'open'
          });
          
          // Se encontrou um ticket, verificar se o canal ainda existe
          if (existingTicket && existingTicket.threadId) {
            try {
              const channelExists = await interaction.client.channels.fetch(existingTicket.threadId)
                .catch(() => null);
              
              // Verificar se o usuário tem permissão para ver o canal e é realmente o dono
              let isOwner = false;
              if (channelExists) {
                if (channelExists.isThread()) {
                  isOwner = channelExists.ownerId === interaction.user.id || 
                           channelExists.name === interaction.user.username;
                } else {
                  // Para canais regulares, verificar o tópico
                  isOwner = channelExists.topic && 
                            channelExists.topic.includes(`user-id:${interaction.user.id}`);
                }
              }
              
              if (!channelExists || !isOwner) {
                console.log(`Canal do ticket ID ${existingTicket._id} não existe mais ou não pertence ao usuário, marcando como fechado.`);
                existingTicket.status = 'closed';
                await existingTicket.save();
                existingTicket = null;
              }
            } catch (error) {
              console.error(`Erro ao verificar existência do canal do ticket ${existingTicket?._id}:`, error);
              // Marcar o ticket como fechado já que o canal não existe mais
              existingTicket.status = 'closed';
              await existingTicket.save();
              existingTicket = null;
            }
          }
        }
      } catch (error) {
        console.error('Erro ao buscar ticket no banco de dados:', error);
      }

      // Verificar carrinhos que o usuário pode ver mas que não pertencem a ele
      // e ignorá-los para não causar falsos positivos
      if (existingUserChannel) {
        // Verificar se o tópico do canal tem o user-id do usuário atual
        const belongsToUser = existingUserChannel.topic && 
                             existingUserChannel.topic.includes(`user-id:${interaction.user.id}`);
        
        if (!belongsToUser) {
          console.log(`Canal ${existingUserChannel.name} não pertence ao usuário ${interaction.user.username}, ignorando.`);
          existingUserChannel = null;
        }
      }
      
      // Se existir algum carrinho aberto (thread, canal ou registro no banco)
      // que realmente pertence ao usuário
      if (existingUserThread || existingUserChannel || existingTicket) {
        const isVendas = ticket.ticketType === 'vendas';
        let targetId = existingUserThread ? existingUserThread.id : 
                      (existingUserChannel ? existingUserChannel.id : 
                      (existingTicket ? existingTicket.threadId : null));
        
        // Verificar se o canal/thread ainda existe
        let channelExists = false;
        try {
          if (targetId) {
            const channel = await interaction.client.channels.fetch(targetId).catch(() => null);
            channelExists = channel !== null;
          }
        } catch (error) {
          console.error('Erro ao verificar canal:', error);
          channelExists = false;
        }
        
        // Se o canal não existir, atualizar o registro e permitir criar um novo
        if (!channelExists) {
          // Atualizar o status do ticket existente para fechado
          if (existingTicket) {
            existingTicket.status = 'closed';
            await existingTicket.save();
          }
          
          // Não retornar aqui, continuar a execução para criar um novo carrinho/ticket
          console.log(`Canal não existe mais, permitindo criação de novo ticket para ${interaction.user.username}`);
        } else {
          // Se o canal ainda existir, mostrar a mensagem de erro
          return interaction.editReply({
            content: isVendas ? 
              '❌ Você já possui um carrinho aberto!' : 
              '❌ Você já possui um ticket aberto!',
            components: (isVendas && targetId && channelExists) ? [
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setLabel('Ir para o carrinho')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/channels/${interaction.guild.id}/${targetId}`)
                )
            ] : []
          });
        }
      }

      // Verificar se há uma categoria configurada para vendas (apenas para ticketType === 'vendas')
      let ticketChannel;
      if (ticket.ticketType === 'vendas' && ticket.categoryId) {
        // Criar canal normal dentro da categoria
        try {
          const category = interaction.guild.channels.cache.get(ticket.categoryId);
          if (!category) {
            throw new Error('Categoria não encontrada');
          }
          
          // Verificar se o ID do vendedor está disponível e é válido
          const permissionOverwrites = [
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            }
          ];
          
          // Adicionar permissões para o vendedor apenas se o ID estiver disponível e for válido
          if (ticket.userId && interaction.guild.members.cache.has(ticket.userId)) {
            permissionOverwrites.push({
              id: ticket.userId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            });
          }

          // Criar canal dentro da categoria com o ID do usuário no tópico
          ticketChannel = await interaction.guild.channels.create({
            name: `carrinho-${interaction.user.username}`,
            type: ChannelType.GuildText,
            topic: `Carrinho de ${interaction.user.username} | user-id:${interaction.user.id}`,
            parent: ticket.categoryId,
            permissionOverwrites: permissionOverwrites
          });
          
          ticket.threadId = ticketChannel.id;
          ticket.status = 'open';
          await ticket.save();
          
          // Enviar mensagem com ping para o vendedor apenas se o ID for válido
          const usersToPing = new Set([interaction.user.id]);
          if (ticket.userId && interaction.guild.members.cache.has(ticket.userId)) {
            usersToPing.add(ticket.userId);
          }
          
          await ticketChannel.send({
            content: `||${Array.from(usersToPing).map(id => `<@${id}>`).join('')}||`,
            allowedMentions: { users: Array.from(usersToPing) }
          });
        } catch (error) {
          console.error('Erro ao criar canal de vendas:', error);
          return interaction.editReply({
            content: '❌ Erro ao criar canal de vendas. Por favor, tente novamente mais tarde.',
            ephemeral: true
          });
        }
      } else {
        // Criar thread como é feito atualmente
        const thread = await interaction.channel.threads.create({
          name: `${interaction.user.username}`,
          type: ChannelType.PrivateThread
        });
        
        // Pingar o vendedor apenas se o ID for válido
        const usersToPing = new Set([interaction.user.id]);
        if (ticket && ticket.userId && interaction.guild.members.cache.has(ticket.userId)) {
          usersToPing.add(ticket.userId);
          
          await thread.send({
            content: `||${Array.from(usersToPing).map(id => `<@${id}>`).join('')}||`,
            allowedMentions: { users: Array.from(usersToPing) }
          });
        } else {
          // Se não tiver um vendedor válido, apenas enviar mensagem para o usuário
          await thread.send({
            content: `||<@${interaction.user.id}>||`,
            allowedMentions: { users: [interaction.user.id] }
          });
        }
        
        if (ticket) {
          ticket.threadId = thread.id;
          ticket.status = 'open';
          await ticket.save();
        }
        
        await thread.members.add(interaction.user.id);
        ticketChannel = thread;
      }

      // Get selected option if it's a menu interaction
      let selectedOption = null;
      let selectedProduct = null;
      if (interaction.isStringSelectMenu()) {
        const selectedValue = interaction.values[0];
        selectedOption = ticket.embedSettings.menuOptions.find(
          opt => opt.value === selectedValue
        );
        ticket.selectedOption = selectedValue; // Store selected option value
        
        // Buscar o produto no banco de dados
        selectedProduct = await Product.findOne({
          ticketId: ticket.messageId,
          optionId: selectedValue
        });
        
        // Limpar qualquer carrinho existente do usuário antes de inicializar um novo
        await CartManager.clearCart(interaction.user.id);
        
        // Inicializa o carrinho
        if (selectedProduct) {
          ticket.cart = {
            productId: selectedValue,
            quantity: 1,
            totalPrice: selectedProduct.price
          };
        }
        
        await ticket.save();
      }

      const threadEmbed = new EmbedBuilder();

      if (ticket.ticketType === 'vendas') {
        threadEmbed
          .setTitle(selectedOption ? `${selectedOption.label}` : ticket.embedSettings.title)
          .setColor("#242429")
          .setDescription(`Olá ${interaction.user}, para finalizar sua compra${selectedOption ? ` do produto **${selectedOption.label}**` : ''}:\n\n` +
            '1. Clique no botão Finalizar para copiar a chave\n' +
            '2. Realize o pagamento\n' +
            '3. Envie o comprovante neste canal\n' +
            '4. Aguarde a validação do pagamento');

        if (selectedOption?.description) {
          threadEmbed.addFields({ 
            name: 'INFORMAÇÕES', 
            value: `${selectedOption.description}` 
          });
        }
        
        // Adicionar campo com a quantidade e valor total se um produto foi selecionado
        if (selectedProduct) {
          threadEmbed.addFields({ 
            name: 'Quantidade e Valor',
            value: `> Quantidade: **${ticket.cart.quantity}**\n> Valor unitário: **R$ ${selectedProduct.price.toFixed(2)}**\n> Valor total: **R$ ${ticket.cart.totalPrice.toFixed(2)}**`
          });
        }
      } else {
        threadEmbed
          .setTitle(selectedOption ? `Ticket: ${selectedOption.label}` : 'Ticket Aberto')
          .setColor("#242429")
          .setDescription(`Olá ${interaction.user}, obrigado por abrir um ticket${selectedOption ? ` sobre **${selectedOption.label}**` : ''}!\nComo podemos ajudar?`);
      }

      const buttons = [
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
      ];

      // Adicionar botões de controle de quantidade se for vendas e houver produto selecionado
      if (ticket.ticketType === 'vendas' && selectedProduct) {
        buttons.unshift(
          new ButtonBuilder()
            .setCustomId(`decrease_${selectedProduct.optionId}`)
            .setLabel('-1')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(ticket.cart.quantity <= 1), // Desabilitar se estiver no mínimo
          new ButtonBuilder()
            .setCustomId(`increase_${selectedProduct.optionId}`)
            .setLabel('+1')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(ticket.cart.quantity >= selectedProduct.stock) // Desabilitar se estiver no máximo
        );
      }

      // Only add PIX button if it's a sales ticket and has PIX key configured
      if (ticket.ticketType === 'vendas' && ticket.embedSettings.pixKey) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('view_coupons')
            .setLabel('Cupom')
            .setStyle(ButtonStyle.Secondary)
        );
        buttons.push(
          new ButtonBuilder()
            .setCustomId('pix_button')
            .setLabel('Finalizar')
            .setStyle(ButtonStyle.Success)
        );
      }

      // Enviar e fixar a mensagem inicial
      const welcomeMessage = await ticketChannel.send({
        embeds: [threadEmbed],
        components: [new ActionRowBuilder().addComponents(buttons)]
      });

      // Se for ticket de vendas, adicionar também os botões de cupom
      if (ticket.ticketType === 'vendas' && selectedProduct) {
        
        // Adicionar os botões de cupom em uma nova linha
        await welcomeMessage.edit({
          embeds: [threadEmbed],
          components: [
            new ActionRowBuilder().addComponents(buttons)
          ]
        });
      }

      // Salvar ID da mensagem do carrinho para atualizações futuras
      if (ticket.ticketType === 'vendas' && selectedProduct) {
        ticket.cart.messageId = welcomeMessage.id;
        await ticket.save();

        // Inicializar o carrinho do usuário com o produto principal selecionado
        try {
          // Verificar se todos os dados do produto estão presentes
          if (selectedProduct && selectedProduct.optionId && selectedProduct.label) {
            const productData = {
              id: selectedProduct.optionId,
              name: selectedProduct.label,
              price: parseFloat(selectedProduct.price) || 0
            };
            
            // Verificar valores
            if (isNaN(productData.price)) {
              productData.price = 0;
            }
            
            await CartManager.addItem(
              interaction.user.id, 
              productData, 
              true // É um produto principal
            );
  
            // Verificar se há produtos adicionais disponíveis
            const additionalProductsMenu = await createAdditionalProductsMenu(selectedProduct.optionId, interaction.user.id);
            
            // Se existirem produtos adicionais, exibir o menu para o usuário
            if (additionalProductsMenu) {
              await ticketChannel.send({
                content: '**🔥 Mais produtos adicionais disponíveis:**\n-# Clique no menu abaixo para ver todos os produtos que temos disponíveis para você comprar.',
                components: additionalProductsMenu
              });
            }
          } else {
            console.warn("Dados do produto incompletos:", selectedProduct);
          }
        } catch (error) {
          console.error("Erro ao inicializar carrinho:", error);
          // Continuar a execução mesmo com erro no carrinho
        }
      }

      // Fixar a mensagem
      await welcomeMessage.pin('Mensagem inicial do ticket');

      // Modificar o collector para usar a nova função
      const proofCollector = ticketChannel.createMessageCollector({
        filter: async m => {
          if (m.attachments.size > 0) {
            const attachment = m.attachments.first();
            
            const result = await isPaymentProof(attachment);
            
            return result.isProof;
          }
          return false;
        }
      });

      proofCollector.on('collect', async message => {
        try {
          const attachment = message.attachments.first();
          
          // Obter o resultado completo da função isPaymentProof
          const proofResult = await isPaymentProof(attachment);
          
          if (proofResult.isProof) {
            // Obter o total atual do ticket e também o carrinho completo para ter todos os detalhes
            const currentTicket = await Ticket.findOne({ threadId: ticket.threadId });
            
            // Verificar se há carrinho e produtos adicionais ou descontos
            let cartTotal = ticket.cart.totalPrice || 0;
            const buyerCart = await CartManager.getCart(message.author.id);
            if (buyerCart && buyerCart.items && buyerCart.items.length > 0) {
              // Usar o valor final do carrinho, que já inclui todos os produtos e descontos
              cartTotal = buyerCart.finalTotal || cartTotal;
              console.log(`Verificação de comprovante - Total do carrinho: R$ ${cartTotal} (userId: ${message.author.id})`);
              console.log(`Itens no carrinho: ${buyerCart.items.length}`);
              buyerCart.items.forEach((item, i) => {
                console.log(`Item ${i+1}: ${item.name} - ${item.quantity}x R$${item.price}`);
              });
            }
            
            // Verificar se o valor do comprovante corresponde ao valor total
            let verificationMessage = '';
            
            if (proofResult.amount) {
              // Valor foi encontrado no comprovante
              if (Math.abs(proofResult.amount - cartTotal) < 0.01) {
                // Valores são iguais (com uma pequena tolerância)
                verificationMessage = '✅ O valor do comprovante corresponde ao valor total da compra.';
              } else if (proofResult.amount < cartTotal) {
                // Valor do comprovante é menor que o total
                const missingAmount = (cartTotal - proofResult.amount).toFixed(2);
                verificationMessage = `⚠️ O valor do comprovante (R$ ${proofResult.amount.toFixed(2)}) é menor que o valor total (R$ ${cartTotal.toFixed(2)}).\nAinda falta pagar: R$ ${missingAmount}`;
              } else {
                // Valor do comprovante é maior que o total
                verificationMessage = `ℹ️ O valor do comprovante (R$ ${proofResult.amount.toFixed(2)}) é maior que o valor total (R$ ${cartTotal.toFixed(2)}).`;
              }
            } else {
              // Não foi possível identificar o valor
              verificationMessage = '⚠️ Não foi possível identificar o valor do pagamento no comprovante.';
            }
            
            // Criar botão de validação apenas para administradores
            const validationButton = new ButtonBuilder()
              .setCustomId('validate_payment')
              .setLabel('JÁ FIZ A ENTREGA!')
              .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(validationButton);

            // Enviar mensagem com botão de validação
            await ticketChannel.send({
              content: `||<@${ticket.userId}>||`,
              embeds: [
                new EmbedBuilder()
                  .setTitle('Comprovante de Pagamento')
                  .setColor('Green')
                  .setDescription(`Comprovante enviado por ${message.author}!\n\n${verificationMessage}\n\n-# Aguarde a validação do pagamento, por um administrador.\n-# Administradores, só cliquem no botão abaixo se já tiver feito a entrega do produto.\n-# Caso contrário, não cliquem.\nAdministradores, sempre verifiquem se o pagamento foi recebido no seu banco e se o comprovante é válido, antes de fazer a entrega, cuidado com comprovante fake, sempre verifique seu banco se caiu o valor.`)
              ],
              components: [row]
            });

            // Armazenar informações do comprovante no ticket
            await Ticket.findOneAndUpdate(
              { threadId: ticket.threadId },
              { 
                'deliveryStatus.proofImage': attachment.url,
                'deliveryStatus.buyerId': message.author.id,
                'deliveryStatus.paidAmount': proofResult.amount,
                'cart.totalPrice': buyerCart?.finalTotal || cartTotal // Atualizar o valor total no ticket também
              }
            );
          }
        } catch (error) {
          console.error('Erro ao processar comprovante:', error);
          await ticketChannel.send('❌ Ocorreu um erro ao processar o comprovante.');
        }
      });

      // Adicionar tratamento de erro mais robusto
      proofCollector.on('error', error => {
        console.error('Erro no collector:', error);
        ticketChannel.send('❌ Ocorreu um erro ao processar o arquivo. Por favor, tente novamente.');
      });

      // Adicionar tratamento de erro para o collector
      proofCollector.on('end', async collected => {
        try {
          // Check if thread still exists before sending message
          const threadExists = await interaction.client.channels.fetch(ticket.threadId)
            .catch(() => null);
            
          if (threadExists && collected.size === 0) {
            await ticketChannel.send('⚠️ Nenhum comprovante detectado ainda. Por favor, envie o comprovante de pagamento.')
              .catch(console.error);
          }
        } catch (error) {
          console.error('Erro ao verificar thread:', error);
        }
      });

      // Final success message
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('Green')
            .setDescription(ticket.ticketType === 'vendas' ? 
              '🛒 Carrinho criado com sucesso!' : 
              '✅ Ticket criado com sucesso!')
        ],
        components: (ticket.ticketType === 'vendas' && ticket.threadId) ? [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setLabel('Ir para o carrinho')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${interaction.guild.id}/${ticket.threadId}`)
            )
        ] : []
      });

    } catch (error) {
      console.error('Erro:', error);
      // If there's an error, edit the deferred reply
      await interaction.editReply({
        content: '❌ Erro ao criar ticket.'
      });
    }

    // Adicione este handler para o botão apply_coupon
    if (interaction.customId === 'apply_coupon') {
      const modal = new ModalBuilder()
        .setCustomId('apply_coupon_modal')
        .setTitle('Aplicar Cupom de Desconto');

      const couponInput = new TextInputBuilder()
        .setCustomId('coupon_code')
        .setLabel('Código do Cupom')
        .setPlaceholder('Digite o código do cupom')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const actionRow = new ActionRowBuilder().addComponents(couponInput);
      modal.addComponents(actionRow);
      
      await interaction.showModal(modal);
      return;
    }

    // Adicione este handler para o modal
    if (interaction.isModalSubmit() && interaction.customId === 'apply_coupon_modal') {
      const couponCode = interaction.fields.getTextInputValue('coupon_code');
      const ticket = await Ticket.findOne({ threadId: interaction.channelId });
      
      if (!ticket) {
        await interaction.reply({
          content: '❌ Erro ao encontrar informações do ticket.',
          ephemeral: true
        });
        return;
      }
      
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), active: true });
      
      if (!coupon) {
        await interaction.reply({
          content: '❌ Cupom não encontrado.',
          ephemeral: true
        });
        return;
      }
      
      if (coupon.uses >= coupon.maxUses) {
        await interaction.reply({
          content: '❌ Este cupom atingiu o limite de uso.',
          ephemeral: true
        });
        return;
      }
      
      // Verificar valor mínimo
      const selectedProduct = await Product.findOne({
        ticketId: ticket.messageId,
        optionId: ticket.selectedOption
      });
      
      if (!selectedProduct) {
        await interaction.reply({
          content: '❌ Produto não encontrado.',
          ephemeral: true
        });
        return;
      }
      
      // Buscar o carrinho do usuário para calcular o valor total corretamente
      const buyerCart = await CartManager.getCart(ticket.userId);
      let totalPrice = 0;
      
      // Verificar se há carrinho e itens
      if (buyerCart && buyerCart.items && buyerCart.items.length > 0) {
        // Calcular o total usando todos os itens (principais e adicionais)
        totalPrice = buyerCart.total;
      } else {
        // Se não houver carrinho, usar apenas o produto principal
        totalPrice = selectedProduct.price * ticket.cart.quantity;
      }
      
      if (totalPrice < coupon.minOrderValue) {
        await interaction.reply({
          content: `❌ Valor mínimo para usar este cupom: R$ ${coupon.minOrderValue.toFixed(2)}`,
          ephemeral: true
        });
        return;
      }
      
      // Verificar quantidade mínima de produtos
      let totalQuantity = 0;
      if (buyerCart && buyerCart.items) {
        // Somar quantidade de todos os itens
        totalQuantity = buyerCart.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      } else {
        totalQuantity = ticket.cart.quantity;
      }
      
      if (totalQuantity < coupon.minProducts) {
        await interaction.reply({
          content: `❌ Quantidade mínima para usar este cupom: ${coupon.minProducts} produtos`,
          ephemeral: true
        });
        return;
      }
      
      // Calcular desconto
      let discount = 0;
      if (coupon.discountType === 'percentage') {
        discount = totalPrice * (coupon.discountValue / 100);
      } else {
        discount = Math.min(coupon.discountValue, totalPrice); // Não permitir desconto maior que o total
      }
      
      const finalPrice = totalPrice - discount;
      
      // Atualizar o carrinho com o cupom
      if (buyerCart) {
        try {
          // Aplicar cupom ao carrinho usando o CartManager
          await CartManager.applyCoupon(ticket.userId, {
            code: coupon.code,
            name: coupon.name,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue
          });
          
          // Recalcular totais do carrinho
          await CartManager.updateCartTotals(buyerCart);
          
          // Utilizar o valor final do carrinho para o ticket
          const finalPrice = buyerCart.finalTotal;
          
          // Atualizar o carrinho no ticket
          ticket.cart.coupon = {
            code: coupon.code,
            name: coupon.name,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discount: buyerCart.discount
          };
          
          ticket.cart.totalPrice = finalPrice;
        } catch (error) {
          console.error('Erro ao aplicar cupom ao carrinho:', error);
        }
      } else {
        // Se não houver carrinho, aplicar o cupom direto no ticket (método antigo)
        ticket.cart.coupon = {
          code: coupon.code,
          name: coupon.name,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          discount: discount
        };
        
        ticket.cart.totalPrice = finalPrice;
      }
      
      await ticket.save();
      
      // Atualizar a mensagem do carrinho
      const message = await interaction.channel.messages.fetch(ticket.cart.messageId);
      
      const threadEmbed = new EmbedBuilder()
        .setTitle(`${selectedProduct.name}`)
        .setColor("#242429")
        .setDescription(`Olá ${interaction.user}, para finalizar sua compra do produto **${selectedProduct.name}**:\n\n` +
          '1. Clique no botão Finalizar para copiar a chave\n' +
          '2. Realize o pagamento\n' +
          '3. Envie o comprovante neste canal\n' +
          '4. Aguarde a validação do pagamento');
          
      if (selectedProduct.description) {
        threadEmbed.addFields({ 
          name: 'Descrição', 
          value: `||\`\`\`${selectedProduct.description}\`\`\`||` 
        });
      }
      
      let valueText = `Quantidade: **${ticket.cart.quantity}**\n`;
      valueText += `Valor unitário: **R$ ${selectedProduct.price.toFixed(2)}**\n`;
      valueText += `Subtotal: **R$ ${totalPrice.toFixed(2)}**\n`;
      
      if (ticket.cart.coupon) {
        valueText += `Cupom: **${ticket.cart.coupon.name}**\n`;
        valueText += `Desconto: **R$ ${ticket.cart.coupon.discount.toFixed(2)}**\n`;
      }
      
      valueText += `Valor total: **R$ ${finalPrice.toFixed(2)}**`;
      
      threadEmbed.addFields({ 
        name: 'Quantidade e Valor',
        value: valueText
      });
      
      const buttons = [
        new ButtonBuilder()
          .setCustomId('decrease_quantity')
          .setLabel('-1')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(ticket.cart.quantity <= 1),
        new ButtonBuilder()
          .setCustomId('increase_quantity')
          .setLabel('+1')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(ticket.cart.quantity >= selectedProduct.stock),
        new ButtonBuilder()
          .setCustomId('view_coupons')
          .setLabel('Aplicar Cupom')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(ticket.cart.coupon !== undefined),
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
      ];
      
      if (ticket.cart.coupon) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('remove_coupon')
            .setLabel('Remover Cupom')
            .setStyle(ButtonStyle.Danger)
        );
      }
      
      if (ticket.embedSettings.pixKey) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('pix_button')
            .setLabel('Finalizar')
            .setStyle(ButtonStyle.Success)
        );
      }
      
      await message.edit({
        embeds: [threadEmbed],
        components: [new ActionRowBuilder().addComponents(buttons)]
      });
      
      await interaction.reply({
        content: `✅ Cupom aplicado com sucesso! Desconto: R$ ${discount.toFixed(2)}`,
        ephemeral: true
      });
      
      // Incrementar uso do cupom
      coupon.uses += 1;
      await coupon.save();
      
      return;
    }

    // Adicione este handler para remover cupom
    if (interaction.customId === 'remove_coupon') {
      // Buscar informações do ticket usando o método aprimorado
      // 1. Primeiro buscar tickets por threadId (comportamento original)
      let ticket = await Ticket.findOne({ 
        threadId: interaction.channelId,
        status: { $ne: 'closed' }
      });
      
      // 2. Se não for encontrado e não for thread, pode ser um canal normal
      if (!ticket && !interaction.channel.isThread()) {
        ticket = await Ticket.findOne({ 
          threadId: interaction.channelId, 
          categoryId: { $exists: true },
          status: { $ne: 'closed' }
        });
      }
      
      // 3. Tentar encontrar pelo ID do canal como último recurso
      if (!ticket) {
        ticket = await Ticket.findOne({
          channelId: interaction.channelId,
          status: { $ne: 'closed' }
        });
      }
      
      if (!ticket || !ticket.cart.coupon) {
        await interaction.reply({
          content: '❌ Não há cupom aplicado.',
          ephemeral: true
        });
        return;
      }
      
      const selectedProduct = await Product.findOne({
        ticketId: ticket.messageId,
        optionId: ticket.selectedOption
      });
      
      if (!selectedProduct) {
        await interaction.reply({
          content: '❌ Produto não encontrado.',
          ephemeral: true
        });
        return;
      }
      
      // Recalcular o preço total sem o cupom
      const totalPrice = selectedProduct.price * ticket.cart.quantity;
      
      // Remover o cupom
      const cupomRemovido = ticket.cart.coupon;
      ticket.cart.coupon = undefined;
      ticket.cart.totalPrice = totalPrice;
      await ticket.save();
      
      // Atualizar a mensagem do carrinho
      const message = await interaction.channel.messages.fetch(ticket.cart.messageId);
      
      const threadEmbed = new EmbedBuilder()
        .setTitle(`Compra: ${selectedProduct.name}`)
        .setColor("#242429")
        .setDescription(`Olá ${interaction.user}, para finalizar sua compra do produto **${selectedProduct.name}**:\n\n` +
          '1. Clique no botão Finalizar para copiar a chave\n' +
          '2. Realize o pagamento\n' +
          '3. Envie o comprovante neste canal\n' +
          '4. Aguarde a validação do pagamento');
          
      if (selectedProduct.description) {
        threadEmbed.addFields({ 
          name: 'Descrição', 
          value: `||\`\`\`${selectedProduct.description}\`\`\`||` 
        });
      }
      
      threadEmbed.addFields({ 
        name: 'Quantidade e Valor',
        value: `Quantidade: **${ticket.cart.quantity}**\nValor unitário: **R$ ${selectedProduct.price.toFixed(2)}**\nValor total: **R$ ${totalPrice.toFixed(2)}**`
      });
      
      const buttons = [
        new ButtonBuilder()
          .setCustomId('decrease_quantity')
          .setLabel('-1')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(ticket.cart.quantity <= 1),
        new ButtonBuilder()
          .setCustomId('increase_quantity')
          .setLabel('+1')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(ticket.cart.quantity >= selectedProduct.stock),
        new ButtonBuilder()
          .setCustomId('view_coupons')
          .setLabel('Aplicar Cupom')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
      ];
      
      if (ticket.embedSettings.pixKey) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('pix_button')
            .setLabel('Finalizar')
            .setStyle(ButtonStyle.Success)
        );
      }
      
      await message.edit({
        embeds: [threadEmbed],
        components: [new ActionRowBuilder().addComponents(buttons)]
      });
      
      await interaction.reply({
        content: `✅ Cupom "${cupomRemovido.code}" removido com sucesso!`,
        ephemeral: true
      });
      
      return;
    }

    // Após adicionar um produto adicional ao carrinho, atualizar o menu
    if (interaction.customId.startsWith('additional_product_')) {
      try {
        const productId = interaction.customId.replace('additional_product_', '');
        const ticketId = interaction.channelId;
        
        // Buscar o ticket e o produto adicional
        const ticket = await Ticket.findOne({ threadId: ticketId });
        const additionalProduct = await Product.findOne({ 
          $or: [
            { optionId: productId },
            { _id: productId }
          ]
        });
        
        if (!ticket || !additionalProduct) {
          return await interaction.reply({
            content: '❌ Não foi possível encontrar informações do produto ou ticket.',
            ephemeral: true
          });
        }
        
        console.log(`Produto adicional encontrado: ${additionalProduct.label}, ID: ${additionalProduct._id}, optionId: ${additionalProduct.optionId}`);
        
        // Buscar o ID do produto principal
        const mainProductId = ticket.selectedOption;
        
        // Adicionar o produto adicional ao carrinho
        const { CartManager } = require('../utils/cartManager');
        const userId = ticket.userId;
        
        // Adicionar ao carrinho
        await CartManager.addAdditionalProduct(userId, mainProductId, {
          id: additionalProduct.optionId || additionalProduct._id.toString(),
          name: additionalProduct.label,
          price: additionalProduct.price
        });
        
        console.log(`Produto adicional adicionado ao carrinho: ${additionalProduct.label}`);
        
        // Verificar e atualizar a descrição do produto no menu
        if (ticket.embedSettings?.menuOptions?.length > 0) {
          // Encontrar a opção no menu
          const optionIndex = ticket.embedSettings.menuOptions.findIndex(
            opt => opt.value === productId || 
                  (opt.label && additionalProduct.label && opt.label.toLowerCase() === additionalProduct.label.toLowerCase())
          );
          
          if (optionIndex !== -1) {
            console.log(`Atualizando descrição do produto adicional no menu: ${additionalProduct.label}`);
            
            // Atualizar a descrição com o estoque real atual (sem reduzir)
            // Verificar se o produto usa [estoque] ou tem descrição no formato "Estoque: X"
            const menuDescription = ticket.embedSettings.menuOptions[optionIndex].description;
            
            // Se tiver [estoque], substituir pelo valor real
            if (menuDescription.includes('[estoque]')) {
              ticket.embedSettings.menuOptions[optionIndex].description = 
                menuDescription.replace(/\[estoque\]/g, additionalProduct.stock.toString());
              
              console.log(`Descrição com [estoque] atualizada: ${ticket.embedSettings.menuOptions[optionIndex].description}`);
            } 
            // Se tiver "Estoque: X", atualizar para o valor atual
            else if (menuDescription.match(/Estoque: \d+/)) {
              ticket.embedSettings.menuOptions[optionIndex].description = 
                menuDescription.replace(/Estoque: \d+/, `Estoque: ${additionalProduct.stock}`);
              
              console.log(`Descrição com "Estoque: X" atualizada: ${ticket.embedSettings.menuOptions[optionIndex].description}`);
            }
            
            // Salvar as alterações no ticket
            await ticket.save();
            
            // Atualizar o menu no canal
            const channel = await interaction.client.channels.fetch(ticket.channelId);
            if (channel) {
              try {
                const message = await channel.messages.fetch(ticket.messageId);
                if (message) {
                  const { updateEmbed } = require('./paymentValidation');
                  await updateEmbed(channel, ticket);
                  console.log(`Menu atualizado no canal para o produto: ${additionalProduct.label}`);
                }
              } catch (err) {
                console.error(`Erro ao atualizar menu: ${err.message}`);
              }
            }
          }
        }
        
        // Verificar se a interação já foi respondida antes de continuar
        if (interaction.replied || interaction.deferred) {
          return; // Não continuar com o código que pode levar a erros
        }

        // Mostrar confirmação para o usuário
        if (!interaction.replied && !interaction.deferred) {
          return await interaction.reply({
            content: `✅ Produto adicional **${additionalProduct.label}** adicionado ao carrinho!\nPreço: R$ ${additionalProduct.price.toFixed(2)}\nEstoque atual: ${additionalProduct.stock}`,
            ephemeral: true
          });
        } else {
          return await interaction.followUp({
            content: `✅ Produto adicional **${additionalProduct.label}** adicionado ao carrinho!\nPreço: R$ ${additionalProduct.price.toFixed(2)}\nEstoque atual: ${additionalProduct.stock}`,
            ephemeral: true
          });
        }
      } catch (error) {
        console.error('Erro ao adicionar produto adicional:', error);
        
        if (!interaction.replied && !interaction.deferred) {
          return await interaction.reply({
            content: '❌ Ocorreu um erro ao adicionar o produto adicional.',
            ephemeral: true
          });
        } else {
          return await interaction.followUp({
            content: '❌ Ocorreu um erro ao adicionar o produto adicional.',
            ephemeral: true
          });
        }
      }
    }

    // Verificar se a interação já foi respondida antes de continuar
    if (interaction.replied || interaction.deferred) {
      return; // Não continuar com o código que pode levar a erros
    }

    // Botões para o comprador avaliar o vendedor
    const reviewRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('review_positive')
        .setLabel('👍 Positivo')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('review_negative')
        .setLabel('👎 Negativo')
        .setStyle(ButtonStyle.Danger)
    );

    // Definir a variável que estava faltando
    const paymentInfoMessage = '';

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
    const channels = interaction.guild.channels.cache
      .filter(c => c.type === 0) // Text channels
      .map(c => ({
        label: c.name.length > 25 ? c.name.substring(0, 22) + '...' : c.name, // Limita o tamanho do nome
        value: c.id
      }))
      .slice(0, 25); // Limita a 25 canais

    if (channels.length === 0) {
      return interaction.followUp({
        content: '❌ Não encontrei nenhum canal de texto no servidor.',
        ephemeral: true
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('delivery_channel')
      .setPlaceholder('Selecione o canal de entrega')
      .addOptions(channels);

    await interaction.followUp({
      content: '📢 Selecione o canal para enviar a confirmação:',
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });

      // Save delivery info - Usando a mesma variável ticket ao invés de redeclarar
      // Atualizamos o ticket já carregado anteriormente
    ticket.deliveryStatus = {
        ...ticket.deliveryStatus,
      delivered: true,
      deliveryImage,
      buyerId: interaction.channel.name.split('-')[1], // Gets username from thread name
      sellerId: interaction.user.id
    };
    await ticket.save();

    if (interaction.customId === 'delivery_channel') {
      try {
        const channelId = interaction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);
        
        // Buscar informações do ticket usando o método aprimorado
        // 1. Primeiro buscar tickets por threadId (comportamento original)
        let ticket = await Ticket.findOne({ 
          threadId: interaction.channel.id,
          status: { $ne: 'closed' }
        });
        
        // 2. Se não for encontrado e não for thread, pode ser um canal normal
        if (!ticket && !interaction.channel.isThread()) {
          ticket = await Ticket.findOne({ 
            threadId: interaction.channel.id, 
            categoryId: { $exists: true },
            status: { $ne: 'closed' }
          });
        }
        
        // 3. Tentar encontrar pelo ID do canal como último recurso
        if (!ticket) {
          ticket = await Ticket.findOne({
            channelId: interaction.channel.id,
            status: { $ne: 'closed' }
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
      } catch (error) {
        console.error('Erro ao atualizar contador de vendas:', error);
      }
    }
  }
};