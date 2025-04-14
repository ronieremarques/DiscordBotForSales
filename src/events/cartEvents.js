const { Events, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { CartManager } = require('../utils/cartManager');
const CartComponents = require('../components/CartComponents');
const Ticket = require('../models/Ticket');
const Product = require('../models/Product');
const MercadoPagoManager = require('../utils/mercadoPago');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    if (interaction.customId !== 'checkout' && interaction.customId !== 'clear_cart') {
      return;
    }

    try {
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      const cartMessages = messages.filter(msg => 
        msg.content.includes('🔥 **Mais produtos adicionais disponíveis:**')
      );
      const produtosMessages = messages.filter(msg => 
        msg.embeds[0]?.data?.type === 'rich' && 
        (msg.embeds[0]?.data?.title === '🛍️ Produto')
      );

      for (const [_, msg] of cartMessages) {
        await msg.delete().catch(err => console.error('Erro ao remover mensagem antiga:', err));
      }

      for (const [_, msg] of produtosMessages) {
        await msg.delete().catch(err => console.error('Erro ao remover mensagem antiga:', err));
      }

      const userId = interaction.user.id;
      const cart = await CartManager.getCart(userId);

      // Buscar o ticket relacionado ao canal atual (thread ou canal normal)
      // 1. Primeiro buscar tickets por threadId (antigo comportamento)
      let ticket = await Ticket.findOne({ threadId: interaction.channel.id });
      
      // 2. Se não for encontrado e não for thread, pode ser um canal normal
      if (!ticket && !interaction.channel.isThread()) {
        ticket = await Ticket.findOne({ threadId: interaction.channel.id, categoryId: { $exists: true } });
      }

      if (interaction.customId === 'checkout') {
        await handleCheckout(interaction, cart, ticket);
      } else if (interaction.customId === 'clear_cart') {
        // Verificar se temos um ticket válido
        if (!ticket) {
          return interaction.reply({
            content: '❌ Este comando só pode ser usado dentro de um ticket.',
            ephemeral: true
          });
        }

        // Se for um canal normal, excluir o canal
        if (!interaction.channel.isThread() && ticket.categoryId) {
          // Confirmar que o usuário quer fechar o ticket
          await interaction.reply({
            content: '🗑️ Carrinho cancelado. Este canal será excluído em 3 segundos.',
            ephemeral: false
          });

          // Aguardar um pouco antes de excluir
          setTimeout(async () => {
            try {
              await interaction.channel.delete('Ticket fechado pelo usuário.');
            } catch (error) {
              console.error('Erro ao excluir canal:', error);
            }
          }, 3000);
        } else {
          // Comportamento original para threads
          const thread = interaction.channel;
          await thread.delete('Ticket fechado pelo usuário.');
        }
      }

    } catch (error) {
      console.error('Erro ao processar ação do carrinho:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar sua solicitação.',
        ephemeral: true
      });
    }
  }
};

async function handleCheckout(interaction, cart, ticket) {
  if (!cart || !cart.items || cart.items.length === 0) {
    await interaction.reply({
      content: '❌ Seu carrinho está vazio!',
      ephemeral: true
    });
    return;
  }

  // Garantir que temos o valor total correto, incluindo produtos adicionais e descontos
  const totalOriginal = parseFloat(cart.total) || 0;
  const desconto = parseFloat(cart.discount) || 0;
  const totalFinal = parseFloat(cart.finalTotal) || totalOriginal;
  
  // Log para debug
  console.log(`Checkout - Valores do carrinho: Total=${totalOriginal}, Desconto=${desconto}, Final=${totalFinal}`);
  console.log(`Items no carrinho: ${cart.items.length}`);
  cart.items.forEach((item, index) => {
    console.log(`Item ${index+1}: ${item.name} - ${item.quantity}x R$${item.price}`);
  });

  // Verificar o tipo de ticket para determinar o método de pagamento
  if (ticket.ticketType === 'vendas_auto') {
    // Verificar se o token do Mercado Pago está configurado
    if (!ticket.embedSettings?.mercadoPagoToken) {
      await interaction.reply({
        content: '❌ O vendedor ainda não configurou o token do Mercado Pago. Por favor, entre em contato com o vendedor.',
        ephemeral: true
      });
      return;
    }

    // Criar pagamento no Mercado Pago
    const paymentResult = await MercadoPagoManager.createPayment(
      ticket.embedSettings.mercadoPagoToken,
      totalFinal,
      `Compra de ${cart.items.length} item(ns)`,
      `discord_${interaction.user.id}_${Date.now()}`
    );

    if (!paymentResult.success) {
      await interaction.reply({
        content: '❌ Erro ao criar pagamento. Por favor, tente novamente mais tarde.',
        ephemeral: true
      });
      return;
    }

    // Criar embed com QR Code e informações do pagamento
    const embed = new EmbedBuilder()
      .setTitle('Pagamento via PIX')
      .setDescription(`Valor total: R$ ${totalFinal.toFixed(2)}\n\nEscaneie o QR Code abaixo ou copie o código PIX para realizar o pagamento.`)
      .setColor('#0099ff');

    if (paymentResult.qrCodeBase64) {
      embed.setImage(`data:image/png;base64,${paymentResult.qrCodeBase64}`);
    }

    // Adicionar botão para verificar status do pagamento
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('check_payment_status')
          .setLabel('Verificar Status do Pagamento')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false
    });

    // Armazenar informações do pagamento no ticket
    ticket.cart.paymentId = paymentResult.paymentId;
    ticket.cart.totalPrice = totalFinal;
    await ticket.save();

  } else if (ticket.ticketType === 'vendas') {
    // Verificar se o ticket tem uma chave PIX configurada
    if (!ticket || !ticket.embedSettings || !ticket.embedSettings.pixKey) {
      await interaction.reply({
        content: `✅ Seu pedido foi finalizado! Valor total: R$ ${totalFinal.toFixed(2)}.\nPor favor, entre em contato com o vendedor para obter os dados de pagamento.`,
        ephemeral: false
      });
      return;
    }

    // Enviar chave PIX para facilitar o pagamento
    const pixKey = ticket.embedSettings.pixKey;

    // Criar uma mensagem mais informativa sobre o pagamento
    let mensagemPagamento = `# Valor total: R$ ${totalFinal.toFixed(2)}\n`;
    
    if (desconto > 0) {
      mensagemPagamento += `✅ Subtotal: R$ ${totalOriginal.toFixed(2)}\n`;
      mensagemPagamento += `💰 Desconto aplicado: R$ ${desconto.toFixed(2)}\n`;
      mensagemPagamento += `💳 Total a pagar: R$ ${totalFinal.toFixed(2)}\n\n`;
    }
    
    mensagemPagamento += `-# Pague e envie o comprovante neste canal.\n-# A chave pix está logo acima dessa mensagem.`;
    
    // Guardar o valor final no ticket para referência futura
    if (ticket) {
      ticket.cart.totalPrice = totalFinal;
      await ticket.save();
      console.log(`Ticket atualizado com novo valor total: ${totalFinal}`);
    }

    await interaction.reply({
      content: `${pixKey}`,
      ephemeral: false
    });
    
    await interaction.channel.send({
      content: mensagemPagamento,
      ephemeral: false
    });
  } else {
    // Ticket normal - apenas confirmar o pedido
    await interaction.reply({
      content: `✅ Seu pedido foi finalizado! Valor total: R$ ${totalFinal.toFixed(2)}.\nPor favor, aguarde o atendimento.`,
      ephemeral: false
    });
  }
}

async function handleClearCart(interaction, userId, ticket) {
  try {
    // Limpar o carrinho do usuário
    await CartManager.clearCart(userId);

    // Responder ao usuário
    await interaction.reply({
      content: '🗑️ Carrinho cancelado. Você será removido deste ticket.',
      ephemeral: false
    });

    // Aguardar um pouco para que o usuário veja a mensagem
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Remover o usuário do thread em vez de arquivá-lo
    if (interaction.channel && interaction.channel.isThread()) {
      try {
        // Remover o usuário do thread
        await interaction.channel.members.remove(interaction.user.id);

        // Informar o vendedor que o cliente cancelou o carrinho
        await interaction.channel.send({
          content: `O usuário ${interaction.user.tag} cancelou o carrinho e saiu do ticket.`
        });
      } catch (error) {
        console.error('Erro ao remover usuário do thread:', error);
        await interaction.channel.send('❌ Não foi possível remover você do ticket automaticamente. Por favor, contate um administrador.');
      }
    }
  } catch (error) {
    console.error('Erro ao cancelar carrinho:', error);
    await interaction.reply({
      content: '❌ Ocorreu um erro ao cancelar o carrinho.',
      ephemeral: true
    });
  }
} 