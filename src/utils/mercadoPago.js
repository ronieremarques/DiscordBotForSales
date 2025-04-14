const { MercadoPagoConfig, User } = require('mercadopago');

class MercadoPagoManager {
  static async validateToken(accessToken) {
    try {
      // Configurar o token de acesso
      const client = new MercadoPagoConfig({
        accessToken: accessToken
      });

      // Obter informações do usuário
      const user = new User(client);
      const userInfo = await user.get();

      return {
        valid: true,
        accountType: `${userInfo.identification.type} ${userInfo.identification.number.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`,
        email: userInfo.email,
        nickname: `${userInfo.first_name} ${userInfo.last_name}`
      };
    } catch (error) {
      console.error('Erro ao validar token do Mercado Pago:', error);
      return {
        valid: false,
        error: error.message || 'Erro ao validar token'
      };
    }
  }

  static async createPayment(accessToken, amount, description, externalReference) {
    try {
      // Configurar o token de acesso
      const client = new MercadoPagoConfig({
        accessToken: accessToken
      });

      // Criar pagamento
      const payment = new Payment(client);
      const paymentData = {
        transaction_amount: amount,
        description: description,
        payment_method_id: 'pix',
        payer: {
          email: 'customer@email.com' // Será substituído pelo email do comprador
        },
        external_reference: externalReference
      };

      const result = await payment.create({ body: paymentData });

      return {
        success: true,
        paymentId: result.id,
        qrCode: result.point_of_interaction?.transaction_data?.qr_code,
        qrCodeBase64: result.point_of_interaction?.transaction_data?.qr_code_base64,
        ticketUrl: result.point_of_interaction?.transaction_data?.ticket_url
      };
    } catch (error) {
      console.error('Erro ao criar pagamento no Mercado Pago:', error);
      return {
        success: false,
        error: error.message || 'Erro ao criar pagamento'
      };
    }
  }

  static async getPaymentStatus(accessToken, paymentId) {
    try {
      // Configurar o token de acesso
      const client = new MercadoPagoConfig({
        accessToken: accessToken
      });

      // Buscar informações do pagamento
      const payment = new Payment(client);
      const result = await payment.get({ id: paymentId });

      return {
        status: result.status,
        statusDetail: result.status_detail,
        amount: result.transaction_amount,
        dateApproved: result.date_approved
      };
    } catch (error) {
      console.error('Erro ao verificar status do pagamento:', error);
      return {
        error: error.message || 'Erro ao verificar status do pagamento'
      };
    }
  }
}

module.exports = MercadoPagoManager; 