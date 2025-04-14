const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

class CouponComponents {
  static createCouponModal(isEdit = false) {
    const modal = new ModalBuilder()
      .setCustomId(isEdit ? 'edit_coupon_modal' : 'create_coupon_modal')
      .setTitle(isEdit ? 'Editar Cupom de Desconto' : 'Criar Cupom de Desconto');

    // Primeira ActionRow - Informações básicas
    const nameInput = new TextInputBuilder()
      .setCustomId('coupon_name')
      .setLabel('Nome do Cupom')
      .setPlaceholder('Nome descritivo para o cupom')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    // Segunda ActionRow - Código
    const codeInput = new TextInputBuilder()
      .setCustomId('coupon_code')
      .setLabel('Código do Cupom')
      .setPlaceholder('Código único para o cupom (maiúsculas)')
      .setStyle(TextInputStyle.Short)
      .setRequired(!isEdit); // Código não pode ser editado

    // Terceira ActionRow - Tipo e valor do desconto
    const discountInput = new TextInputBuilder()
      .setCustomId('discount_info')
      .setLabel('Desconto (tipo:valor)')
      .setPlaceholder('fixed:10 ou percentage:15')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    // Quarta ActionRow - Usos e valor mínimo
    const usageInput = new TextInputBuilder()
      .setCustomId('usage_info')
      .setLabel('Usos máximos:Valor mínimo (R$)')
      .setPlaceholder('Ex: 100:50.00 (100 usos, mínimo R$50)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    // Quinta ActionRow - Qtd mínima, dias expiração, clientes antigos
    const otherInfoInput = new TextInputBuilder()
      .setCustomId('other_info')
      .setLabel('Mín. produtos:Dias expirar:Clientes antigos?')
      .setPlaceholder('Ex: 1:30:sim (1 produto, 30 dias, só p/ antigos)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    // Montagem dos componentes (máximo 5)
    const rows = [
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(codeInput),
      new ActionRowBuilder().addComponents(discountInput),
      new ActionRowBuilder().addComponents(usageInput),
      new ActionRowBuilder().addComponents(otherInfoInput)
    ];

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
      
      const expiresText = coupon.expiresAt 
        ? `Expira: ${new Date(coupon.expiresAt).toLocaleDateString('pt-BR')}` 
        : 'Sem validade';
        
      const onlyPreviousCustomers = coupon.onlyForPreviousCustomers 
        ? '✅ Apenas clientes antigos' 
        : '✅ Qualquer cliente';

      embed.addFields({
        name: `${coupon.name} (${coupon.code})`,
        value: `Desconto: ${discountText}\nUsos: ${coupon.uses}/${coupon.maxUses}\nMínimo: R$ ${coupon.minOrderValue.toFixed(2)}\nProdutos mínimos: ${coupon.minProducts}\n${expiresText}\n${onlyPreviousCustomers}\nStatus: ${coupon.active ? '✅ Ativo' : '❌ Inativo'}`
      });
    });

    return embed;
  }

  static createCouponSelectMenu(coupons, isFirstPurchase = false, totalValue = 0, productsCount = 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_coupon')
      .setPlaceholder('Selecione um cupom');

    // Filtrar cupons disponíveis com base nos critérios
    const availableCoupons = coupons.filter(coupon => {
      // Verificar se o cupom é apenas para clientes antigos
      if (coupon.onlyForPreviousCustomers && isFirstPurchase) {
        return false;
      }
      
      // Verificar valor mínimo
      if (coupon.minOrderValue > totalValue) {
        return false;
      }
      
      // Verificar quantidade mínima de produtos
      if (coupon.minProducts > productsCount) {
        return false;
      }
      
      // Verificar se o cupom expirou
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return false;
      }
      
      // Verificar se o cupom ainda tem usos disponíveis
      if (coupon.uses >= coupon.maxUses) {
        return false;
      }
      
      return coupon.active;
    });

    if (availableCoupons.length === 0) {
      selectMenu.addOptions({
        label: 'Nenhum cupom disponível',
        description: 'Não há cupons disponíveis para você no momento',
        value: 'no_coupon'
      });
      return new ActionRowBuilder().addComponents(selectMenu);
    }

    availableCoupons.forEach(coupon => {
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

  // Adicionar a nova função para criar um menu de seleção de cupons
  static createCouponSelectionMenu(coupons) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_coupon')
      .setPlaceholder('Selecione um cupom para aplicar');
    
    // Se não houver cupons disponíveis, adicionar opção de indisponibilidade
    if (!coupons || coupons.length === 0) {
      selectMenu.addOptions([
        {
          label: 'Nenhum cupom disponível',
          description: 'Não há cupons disponíveis para você no momento',
          value: 'no_coupon',
          emoji: '❌'
        }
      ]);
    } else {
      // Adicionar cada cupom como uma opção
      coupons.forEach(coupon => {
        // Criar descrição amigável baseada no tipo de desconto
        let description = '';
        if (coupon.discountType === 'percentage') {
          description = `${coupon.discountValue}% de desconto`;
        } else {
          description = `R$ ${coupon.discountValue.toFixed(2)} de desconto`;
        }
        
        // Adicionar requisitos, se houver
        if (coupon.minOrderValue > 0) {
          description += ` (min: R$ ${coupon.minOrderValue.toFixed(2)})`;
        }
        
        // Definir emoji com base no tipo de desconto
        const emoji = coupon.discountType === 'percentage' ? '💯' : '💰';
        
        selectMenu.addOptions([
          {
            label: coupon.name || coupon.code,
            description: description.substring(0, 100), // Limitar a 100 caracteres
            value: coupon._id.toString(),
            emoji: emoji
          }
        ]);
      });
    }
    
    return new ActionRowBuilder().addComponents(selectMenu);
  }
}

module.exports = CouponComponents; 