const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Ticket = require('../models/Ticket');
const MercadoPagoManager = require('../utils/mercadoPago');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || interaction.customId !== 'check_payment_status') return;

    try {
      // Buscar o ticket relacionado à mensagem
      const ticket = await Ticket.findOne({ 
        threadId: interaction.channel.id,
        status: { $ne: 'closed' }
      });

      if (!ticket || !ticket.cart?.paymentId) {
        await interaction.reply({
          content: '❌ Não foi possível encontrar informações do pagamento.',
          ephemeral: true
        });
        return;
      }

      // Verificar status do pagamento no Mercado Pago
      const paymentStatus = await MercadoPagoManager.getPaymentStatus(
        ticket.embedSettings.mercadoPagoToken,
        ticket.cart.paymentId
      );

      if (paymentStatus.error) {
        await interaction.reply({
          content: '❌ Erro ao verificar status do pagamento. Por favor, tente novamente mais tarde.',
          ephemeral: true
        });
        return;
      }

      // Criar embed com status do pagamento
      const statusMessages = {
        'pending': '⏳ Aguardando pagamento',
        'approved': '✅ Pagamento aprovado',
        'rejected': '❌ Pagamento rejeitado',
        'cancelled': '❌ Pagamento cancelado',
        'refunded': '↩️ Pagamento reembolsado',
        'charged_back': '↩️ Pagamento estornado'
      };

      const embed = new EmbedBuilder()
        .setTitle('Status do Pagamento')
        .setDescription(`Status: ${statusMessages[paymentStatus.status] || 'Desconhecido'}\n\nValor: R$ ${paymentStatus.amount?.toFixed(2) || '0.00'}`)
        .setColor(paymentStatus.status === 'approved' ? '#00ff00' : '#ff0000');

      if (paymentStatus.dateApproved) {
        embed.addFields({
          name: 'Data de Aprovação',
          value: new Date(paymentStatus.dateApproved).toLocaleString('pt-BR')
        });
      }

      // Adicionar botão para verificar novamente
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('check_payment_status')
            .setLabel('Verificar Novamente')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });

      // Se o pagamento foi aprovado, atualizar o status do ticket
      if (paymentStatus.status === 'approved') {
        ticket.deliveryStatus = {
          ...ticket.deliveryStatus,
          delivered: true,
          buyerId: interaction.user.id,
          paidAmount: paymentStatus.amount
        };
        await ticket.save();

        // Notificar o vendedor
        const seller = await interaction.client.users.fetch(ticket.userId);
        if (seller) {
          await seller.send({
            content: `✅ Pagamento aprovado para o pedido no canal ${interaction.channel.name}\nValor: R$ ${paymentStatus.amount.toFixed(2)}`
          });
        }
      }

    } catch (error) {
      console.error('Erro ao verificar status do pagamento:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao verificar o status do pagamento.',
        ephemeral: true
      });
    }
  }
}; 