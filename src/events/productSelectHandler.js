const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Product = require('../models/Product');
const Ticket = require('../models/Ticket');
const { CartManager } = require('../utils/cartManager');
const { createAdditionalProductsMenu } = require('./additionalProductSelector');
const CartComponents = require('../components/CartComponents');
const { safeMessageEdit } = require('../utils/embedUtils');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'product_select') return;

    try {
      const selectedProductId = interaction.values[0];
      const userId = interaction.user.id;

      // Verificar se estamos em um canal de ticket (thread ou canal normal em categoria)
      // 1. Primeiro buscar tickets por threadId (antigo comportamento)
      let ticket = await Ticket.findOne({ threadId: interaction.channel.id });
      
      // 2. Se não for encontrado e não for thread, pode ser um canal normal
      if (!ticket && !interaction.channel.isThread()) {
        ticket = await Ticket.findOne({ threadId: interaction.channel.id, categoryId: { $exists: true } });
      }
      
      if (!ticket) {
        await interaction.reply({
          content: '❌ Este comando só pode ser usado em canais de ticket.',
          ephemeral: true
        });
        return;
      }

      // Buscar o carrinho atual do usuário
      const currentCart = await CartManager.getCart(userId);
      
      // Verificar se o produto já está no carrinho
      const productAlreadyInCart = currentCart.items.find(item => item.productId === selectedProductId);
      if (productAlreadyInCart) {
        await interaction.reply({
          content: '⚠️ Este produto já está no seu carrinho. Você pode ajustar a quantidade utilizando os botões +1/-1.',
          ephemeral: true
        });
        return;
      }

      // Buscar o produto no banco de dados
      const selectedProduct = await Product.findOne({
        ticketId: ticket.messageId,
        optionId: selectedProductId
      });

      if (!selectedProduct) {
        await interaction.reply({
          content: '❌ Produto não encontrado ou sem estoque.',
          ephemeral: true
        });
        return;
      }

      // Verificar estoque
      if (selectedProduct.stock <= 0) {
        await interaction.reply({
          content: '❌ Este produto está sem estoque no momento.',
          ephemeral: true
        });
        return;
      }

      // Atualizar as informações do ticket
      ticket.selectedOption = selectedProductId;
      ticket.cart = {
        productId: selectedProductId,
        quantity: 1,
        totalPrice: selectedProduct.price
      };

      // Adicionar o produto ao carrinho
      await CartManager.addItem(
        userId,
        {
          id: selectedProduct.optionId,
          name: selectedProduct.label,
          price: parseFloat(selectedProduct.price) || 0
        },
        true // É um produto principal
      );

      // Salvar as alterações no ticket
      await ticket.save();

      // Obter o carrinho atualizado
      const cart = await CartManager.getCart(userId);

      // Usar o CartComponents para criar a embed e botões
      const { EmbedBuilder } = require('discord.js');
      
      const embed = new EmbedBuilder()
        .setTitle(`Compra: ${selectedProduct.label}`)
        .setColor("#242429")
        .setDescription(`Olá ${interaction.user}, para finalizar sua compra do produto **${selectedProduct.label}**:\n\n` +
          '1. Clique no botão Finalizar para copiar a chave pix\n' +
          '2. Realize o pagamento\n' +
          '3. Envie o comprovante neste canal\n' +
          '4. Aguarde a validação do pagamento');

      if (selectedProduct.description) {
        embed.addFields({ 
          name: 'Detalhes do Produto', 
          value: selectedProduct.description 
        });
      }
      
      embed.addFields({ 
        name: 'Quantidade e Valor',
        value: `Quantidade: **1**\nValor unitário: **R$ ${selectedProduct.price.toFixed(2)}**\nValor total: **R$ ${selectedProduct.price.toFixed(2)}**`
      });

      // Criar os botões usando CartComponents
      const buttons = CartComponents.createCartButtons(cart, !!cart.coupon);

      // Enviar a mensagem do produto
      const productMessage = await interaction.reply({
        embeds: [embed],
        components: buttons,
        fetchReply: true
      });

      // Salvar o ID da mensagem para atualizações futuras
      ticket.cart.messageId = productMessage.id;
      await ticket.save();

      // Verificar se há produtos adicionais disponíveis
      const additionalProductsMenu = await createAdditionalProductsMenu(selectedProduct.optionId, userId);
      
      // Se existirem produtos adicionais, exibir o menu para o usuário
      if (additionalProductsMenu) {
        await interaction.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("#242429")
              .setTitle('Produtos adicionais disponíveis')
              .setDescription('Selecione abaixo para adicionar itens complementares à sua compra:')
          ],
          components: [additionalProductsMenu]
        });
      }

    } catch (error) {
      console.error('Erro ao processar seleção de produto:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar a seleção do produto.',
        ephemeral: true
      });
    }
  }
}; 