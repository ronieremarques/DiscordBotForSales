const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

class CouponImageGenerator {
  static async generateCouponImage(coupon) {
    try {
      // Configuração do canvas
      const width = 800;
      const height = 400;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Carregar fonte personalizada (se necessário)
      // registerFont(path.join(__dirname, 'fonts', 'CustomFont.ttf'), { family: 'Custom' });

      // Fundo gradiente
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#4CAF50');
      gradient.addColorStop(1, '#2196F3');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Estilo do texto
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Título
      ctx.font = 'bold 48px Arial';
      ctx.fillText('CUPOM DE DESCONTO', width / 2, 80);

      // Código do cupom
      ctx.font = 'bold 72px Arial';
      ctx.fillText(coupon.name, width / 2, height / 2);

      // Detalhes do desconto
      ctx.font = '36px Arial';
      const discountText = coupon.discountType === 'fixed' 
        ? `R$ ${coupon.discountValue.toFixed(2)}`
        : `${coupon.discountValue}%`;
      ctx.fillText(`Desconto de ${discountText}`, width / 2, height - 120);

      // Condições
      ctx.font = '24px Arial';
      ctx.fillText(
        `Mínimo: R$ ${coupon.minOrderValue.toFixed(2)} | ${coupon.minProducts} produtos`,
        width / 2,
        height - 80
      );

      // Usos restantes
      ctx.fillText(
        `Usos restantes: ${coupon.maxUses - coupon.currentUses}`,
        width / 2,
        height - 40
      );

      // Converter para buffer
      return canvas.toBuffer('image/png');
    } catch (error) {
      throw new Error(`Erro ao gerar imagem do cupom: ${error.message}`);
    }
  }
}

module.exports = CouponImageGenerator; 