const { Events, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || interaction.customId !== 'create_ticket') return;

    try {
      const ticket = await Ticket.findOne({ messageId: interaction.message.id });
      
      if (!ticket) {
        return interaction.reply({
          content: '❌ Configuração não encontrada.',
          ephemeral: true
        });
      }

      if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({
          content: '❌ Apenas administradores podem configurar.',
          ephemeral: true
        });
      }

      const existingThread = interaction.channel.threads.cache.find(
        thread => thread.name === `ticket-${interaction.user.username}`
      );

      if (existingThread) {
        return interaction.reply({
          content: '❌ Você já possui um ticket aberto!',
          ephemeral: true
        });
      }

      const thread = await interaction.channel.threads.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.PrivateThread
      });

      ticket.threadId = thread.id;
      ticket.status = 'open';
      await ticket.save();

      await thread.members.add(interaction.user.id);

      const threadEmbed = new EmbedBuilder();

      if (ticket.ticketType === 'vendas') {
        threadEmbed
          .setTitle('Venda Manual - ' + ticket.embedSettings.title)
          .setDescription(`Olá ${interaction.user}, para finalizar sua compra:\n\n` +
            '1. Clique no botão PIX para copiar a chave\n' +
            '2. Realize o pagamento\n' +
            '3. Envie o comprovante neste canal\n' +
            '4. Aguarde a validação do pagamento');
      } else {
        threadEmbed
          .setTitle('Ticket Aberto')
          .setDescription(`Olá ${interaction.user}, obrigado por abrir um ticket!`);
      }

      const buttons = [
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
      ];

      if (ticket.embedSettings.pixKey) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('pix_button')
            .setLabel('Pix')
            .setStyle(ButtonStyle.Success)
        );
      }

      // Enviar e fixar a mensagem inicial
      const welcomeMessage = await thread.send({
        embeds: [threadEmbed],
        components: [new ActionRowBuilder().addComponents(buttons)]
      });

      // Fixar a mensagem
      await welcomeMessage.pin('Mensagem inicial do ticket');

      // Atualizar a função do collector
      const proofCollector = thread.createMessageCollector({
        filter: m => {
          // Verifica apenas anexos
          if (m.attachments.size > 0) {
            const attachment = m.attachments.first();
            const fileName = attachment.name.toLowerCase();
            
            // Verifica nome do arquivo ou extensão
            return fileName.includes('comprovante') || 
                   fileName.includes('comprov') || 
                   fileName.includes('payment') || 
                   fileName.includes('pix') ||
                   ['.png', '.jpg', '.jpeg', '.pdf'].some(ext => fileName.endsWith(ext));
          }
          return false; // Ignora mensagens sem anexos
        }
      });

      proofCollector.on('collect', async message => {
        try {
          const attachment = message.attachments.first();
          const fileName = attachment.name.toLowerCase();
          
          // Verifica se é um comprovante válido
          const isProof = fileName.includes('comprovante') || 
                          fileName.includes('comprov') || 
                          fileName.includes('payment') || 
                          fileName.includes('pix') ||
                          ['.png', '.jpg', '.jpeg', '.pdf'].some(ext => fileName.endsWith(ext));

          if (isProof) {
            // Criar botão de validação apenas para administradores
            const validationButton = new ButtonBuilder()
              .setCustomId('validate_payment')
              .setLabel('Validar Pagamento')
              .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(validationButton);

            // Enviar mensagem com botão de validação
            await thread.send({
              content: '✅ Comprovante recebido! Aguardando validação do administrador.',
              components: [row]
            });

            // Armazenar informações do comprovante no ticket
            await Ticket.findOneAndUpdate(
              { threadId: thread.id },
              { 
                'deliveryStatus.proofImage': attachment.url,
                'deliveryStatus.buyerId': message.author.id
              }
            );
          }
        } catch (error) {
          console.error('Erro ao processar comprovante:', error);
          await thread.send('❌ Ocorreu um erro ao processar o comprovante.');
        }
      });

      // Adicionar tratamento de erro para o collector
      proofCollector.on('end', collected => {
        if (collected.size === 0) {
          thread.send('⚠️ Nenhum comprovante detectado ainda. Por favor, envie o comprovante de pagamento.');
        }
      });

      await interaction.reply({
        content: '✅ Ticket criado com sucesso!',
        ephemeral: true
      });

    } catch (error) {
      console.error('Erro:', error);
      await interaction.reply({
        content: '❌ Erro ao criar ticket.',
        ephemeral: true
      });
    }
  }
};