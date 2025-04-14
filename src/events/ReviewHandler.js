const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');
const Ticket = require('../models/Ticket');
const Product = require('../models/Product');
const Review = require('../models/Review');
const { updateProductEmbed, formatRating } = require('../utils/embedUtils');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Verificar se é uma interação que devemos tratar
    if (!interaction.customId?.startsWith('review_') && 
        interaction.customId !== 'validate_payment') return;

    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    // Quando o pagamento é validado, enviar mensagem para avaliar
    if (interaction.customId === 'validate_payment') {
      try {
        // Verificar permissões do usuário (apenas administradores podem validar)
        const member = interaction.guild.members.cache.get(interaction.user.id);
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return; // Retorna imediatamente se não tiver permissão
        }

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
        
        if (!ticket || !ticket.selectedOption) return;

        // Verificar se existe canal de avaliações configurado
        if (!ticket.reviewChannelId) return;

        // Buscar o produto
        const product = await Product.findOne({
          optionId: ticket.selectedOption
        });

        if (!product) return;

        console.log('Debug - Validate Payment:', {
          ticketId: ticket.threadId,
          productId: ticket.selectedOption,
          reviewChannelId: ticket.reviewChannelId
        });

        // Tentar enviar mensagem privada para o comprador
        try {
          // Obter o ID do comprador - das informações de entrega ou do nome do canal
          let buyerId = ticket.deliveryStatus?.buyerId;
          
          // Se não tiver ID do comprador nas informações de entrega,
          // tenta extrair do nome do canal (que pode ser thread ou canal normal)
          if (!buyerId) {
            // Tenta obter o canal
            const channel = await interaction.client.channels.fetch(ticket.threadId);
            if (channel) {
              // Extrai o username da parte do nome após "carrinho-" ou do nome da thread
              const channelName = channel.name;
              if (channelName.startsWith('carrinho-')) {
                buyerId = channelName.substring('carrinho-'.length);
              } else {
                buyerId = channelName;
              }
            }
          }
          
          if (!buyerId) {
            console.error('Não foi possível identificar o comprador');
            return;
          }
          
          // Buscar o usuário pelo ID ou nome de usuário
          let buyer;
          try {
            // Primeiro tenta como ID
            buyer = await interaction.client.users.fetch(buyerId);
          } catch (error) {
            // Se não conseguir como ID, tenta buscar pelo nome no servidor
            const members = await interaction.guild.members.fetch();
            const member = members.find(m => m.user.username === buyerId);
            if (member) {
              buyer = member.user;
            }
          }
          
          if (!buyer) {
            console.error('Usuário comprador não encontrado');
            return;
          }
          
          // Buscar o canal de avaliações
          const reviewChannel = await interaction.client.channels.fetch(ticket.reviewChannelId);
          if (!reviewChannel) {
            console.error('Canal de avaliações não encontrado');
            return;
          }
          
          // Enviar mensagem no canal de avaliações mencionando o usuário
          const reviewMessage = await reviewChannel.send({
            content: `<@${buyer.id}>, por favor avalie sua compra.`
          });
          
          // Enviar mensagem privada informando ao usuário sobre a avaliação
          await buyer.send({
            content: `Olá! Você pode avaliar sua compra do produto **${product.label}** no canal <#${ticket.reviewChannelId}>. Sua avaliação é muito importante para nós!`
          });
          
          // Configurar um coletor para aguardar a resposta do usuário
          const filter = m => m.author.id === buyer.id && m.channelId === reviewChannel.id;
          const collector = reviewChannel.createMessageCollector({ filter, time: 7200000 }); // 2 horas
          
          collector.on('collect', async (message) => {
            // Quando o usuário enviar sua avaliação, reagir à mensagem
            const reactions = ['❤️'];
            for (const reaction of reactions) {
              await message.react(reaction);
            }
            
            // Registrar a avaliação no banco de dados
            await Review.create({
              userId: buyer.id,
              productId: ticket.selectedOption,
              purchaseId: ticket.threadId,
              status: 'completed',
              description: message.content,
              rating: 5 // Valor padrão
            });
            
            // Atualizar estatísticas do produto
            const allReviews = await Review.find({ 
              productId: ticket.selectedOption, 
              status: 'completed' 
            });
            
            product.rating = {
              average: 5,
              count: allReviews.length
            };
            
            await product.save();
            
            // Atualizar a embed do produto se existir
            try {
              await updateProductEmbed(interaction.client, product);
              
              // Se o update não funcionar, enviar uma mensagem com a avaliação atual
              const ticket = await Ticket.findOne({ threadId: message.channel.id });
              const ratingStyle = ticket?.embedSettings?.ratingStyle || 'default';
              const formattedRating = formatRating(product.rating.average, product.rating.count, ratingStyle);
              
              // Enviar mensagem de avaliação atualizada no canal original
              const originalChannel = await interaction.client.channels.fetch(ticket.channelId);
              if (originalChannel) {
                await originalChannel.send({
                  content: `📊 **Avaliação atualizada para ${product.label}**: ${formattedRating}`
                });
              }
            } catch (error) {
              console.error('Erro ao atualizar embed do produto:', error);
            }
            
            // Apagar a mensagem de menção após avaliação
            try {
              await reviewMessage.delete();
              console.log(`Mensagem de menção apagada após avaliação do usuário ${buyer.id}`);
            } catch (error) {
              console.error('Erro ao apagar mensagem de menção:', error);
            }
            
            // Encerrar o coletor após receber a avaliação
            collector.stop();
          });
          
          // Quando o tempo expirar (2 horas), apagar a mensagem de menção
          collector.on('end', async (collected) => {
            if (collected.size === 0) {
              // Se não houver mensagens coletadas, significa que o usuário não avaliou
              try {
                await reviewMessage.delete();
                console.log(`Mensagem de menção apagada por timeout para o usuário ${buyer.id}`);
              } catch (error) {
                console.error('Erro ao apagar mensagem de menção após timeout:', error);
              }
            }
          });
          
        } catch (error) {
          console.error('Erro ao enviar mensagem de avaliação:', error);
        }
      } catch (error) {
        console.error('Erro ao processar avaliação:', error);
      }
      return;
    }
    
    // Não precisamos mais dos handlers antigos para o botão de avaliação e modal
  }
}; 