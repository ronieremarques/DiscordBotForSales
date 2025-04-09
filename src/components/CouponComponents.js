const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

class CouponComponents {
  static createCouponModal(isEdit = false) {
    const modal = new ModalBuilder()
      .setCustomId(isEdit ? 'edit_coupon_modal' : 'create_coupon_modal')
      .setTitle(isEdit ? 'Editar Cupom de Desconto' : 'Criar Cupom de Desconto');

    const nameInput = new TextInputBuilder()
      .setCustomId('coupon_name')
      .setLabel('Nome do Cupom')
      .setPlaceholder('Nome descritivo para o cupom')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const codeInput = new TextInputBuilder()
      .setCustomId('coupon_code')
      .setLabel('Código do Cupom')
      .setPlaceholder('Código único para o cupom (será convertido para maiúsculas)')
      .setStyle(TextInputStyle.Short)
      .setRequired(!isEdit); // Código não pode ser editado

    const discountTypeInput = new TextInputBuilder()
      .setCustomId('discount_type')
      .setLabel('Tipo de Desconto')
      .setPlaceholder('Digite "fixed" para valor fixo ou "percentage" para porcentagem')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const discountValueInput = new TextInputBuilder()
      .setCustomId('discount_value')
      .setLabel('Valor do Desconto')
      .setPlaceholder('Para fixed: 10 = R$10, Para percentage: 15 = 15%')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const maxUsesInput = new TextInputBuilder()
      .setCustomId('max_uses')
      .setLabel('Limite de Usos')
      .setPlaceholder('Número máximo de vezes que o cupom pode ser usado')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const minOrderValueInput = new TextInputBuilder()
      .setCustomId('min_order_value')
      .setLabel('Valor Mínimo da Compra')
      .setPlaceholder('Valor mínimo da compra para usar o cupom')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const minProductsInput = new TextInputBuilder()
      .setCustomId('min_products')
      .setLabel('Quantidade Mínima de Produtos')
      .setPlaceholder('Quantidade mínima de produtos no carrinho')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const rows = [
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(codeInput),
      new ActionRowBuilder().addComponents(discountTypeInput),
      new ActionRowBuilder().addComponents(discountValueInput),
      new ActionRowBuilder().addComponents(maxUsesInput)
    ];

    if (!isEdit) {
      rows.push(
        new ActionRowBuilder().addComponents(minOrderValueInput),
        new ActionRowBuilder().addComponents(minProductsInput)
      );
    }

    modal.addComponents(rows);
    return modal;
  }

  static createApplyCouponModal() {
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
    
    return modal;
  }

  static createCouponListEmbed(coupons) {
    const embed = new EmbedBuilder()
      .setTitle('Lista de Cupons')
      .setColor('#0099ff')
      .setDescription('Aqui estão todos os cupons disponíveis:');

    coupons.forEach(coupon => {
      const discountText = coupon.discountType === 'fixed' 
        ? `R$ ${coupon.discountValue.toFixed(2)}` 
        : `${coupon.discountValue}%`;

      embed.addFields({
        name: `${coupon.name} (${coupon.code})`,
        value: `Desconto: ${discountText}\nUsos: ${coupon.uses}/${coupon.maxUses}\nMínimo: R$ ${coupon.minOrderValue.toFixed(2)}\nProdutos mínimos: ${coupon.minProducts}\nStatus: ${coupon.active ? '✅ Ativo' : '❌ Inativo'}`
      });
    });

    return embed;
  }

  static createCouponSelectMenu(coupons) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_coupon')
      .setPlaceholder('Selecione um cupom');

    coupons.forEach(coupon => {
      const discountText = coupon.discountType === 'fixed'
        ? `R$ ${coupon.discountValue.toFixed(2)}`
        : `${coupon.discountValue}%`;

      selectMenu.addOptions({
        label: coupon.name,
        description: `Desconto: ${discountText} | Mínimo: R$ ${coupon.minOrderValue.toFixed(2)}`,
        value: coupon._id.toString()
      });
    });

    return new ActionRowBuilder().addComponents(selectMenu);
  }
}

module.exports = CouponComponents; 