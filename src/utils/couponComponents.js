const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const CouponManager = require('./couponManager');

class CouponComponents {
  static createCouponModal() {
    const modal = new ModalBuilder()
      .setCustomId('create_coupon_modal')
      .setTitle('Criar Cupom de Desconto');

    const nameInput = new TextInputBuilder()
      .setCustomId('coupon_name')
      .setLabel('Nome do Cupom')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const discountTypeInput = new TextInputBuilder()
      .setCustomId('discount_type')
      .setLabel('Tipo de Desconto (fixed/percentage)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const discountValueInput = new TextInputBuilder()
      .setCustomId('discount_value')
      .setLabel('Valor do Desconto')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const maxUsesInput = new TextInputBuilder()
      .setCustomId('max_uses')
      .setLabel('Limite de Usos')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const minOrderValueInput = new TextInputBuilder()
      .setCustomId('min_order_value')
      .setLabel('Valor Mínimo da Compra')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const minProductsInput = new TextInputBuilder()
      .setCustomId('min_products')
      .setLabel('Quantidade Mínima de Produtos')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
    const secondActionRow = new ActionRowBuilder().addComponents(discountTypeInput);
    const thirdActionRow = new ActionRowBuilder().addComponents(discountValueInput);
    const fourthActionRow = new ActionRowBuilder().addComponents(maxUsesInput);
    const fifthActionRow = new ActionRowBuilder().addComponents(minOrderValueInput);
    const sixthActionRow = new ActionRowBuilder().addComponents(minProductsInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow, fifthActionRow, sixthActionRow);
    return modal;
  }

  static createChannelSelectMenu(channels) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('coupon_channel_select')
      .setPlaceholder('Selecione um canal para divulgação')
      .addOptions(
        channels.map(channel => ({
          label: channel.name,
          value: channel.id,
          description: `Enviar cupom para #${channel.name}`
        }))
      );

    return new ActionRowBuilder().addComponents(selectMenu);
  }

  static async createCouponEmbed(coupon) {
    const embed = new EmbedBuilder()
      .setTitle('🎉 Novo Cupom de Desconto!')
      .setDescription('Aproveite este cupom exclusivo para sua próxima compra!')
      .addFields(
        { name: 'Código', value: coupon.name, inline: true },
        { name: 'Tipo de Desconto', value: coupon.discountType === 'fixed' ? 'Valor Fixo' : 'Porcentagem', inline: true },
        { name: 'Valor', value: coupon.discountType === 'fixed' ? `R$ ${coupon.discountValue}` : `${coupon.discountValue}%`, inline: true },
        { name: 'Valor Mínimo', value: `R$ ${coupon.minOrderValue}`, inline: true },
        { name: 'Produtos Mínimos', value: `${coupon.minProducts}`, inline: true },
        { name: 'Usos Restantes', value: `${coupon.maxUses - coupon.currentUses}`, inline: true }
      )
      .setColor('#4CAF50')
      .setTimestamp();

    try {
      const imageBuffer = await CouponManager.generateCouponImage(coupon);
      embed.setImage('attachment://coupon.png');
      return { embed, files: [{ attachment: imageBuffer, name: 'coupon.png' }] };
    } catch (error) {
      console.error('Erro ao gerar imagem do cupom:', error);
      return { embed };
    }
  }
}

module.exports = CouponComponents; 