const { Events, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Ticket = require('../models/Ticket');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const CouponComponents = require('../components/CouponComponents');
const Config = require('../models/Config');
const { safeMessageEdit } = require('../utils/embedUtils');
const MercadoPagoManager = require('../utils/mercadoPago');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    if (interaction.customId === 'config_ticket') {
      const ticket = await Ticket.findOne({ messageId: interaction.message.id });
      if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({
          content: '❌ Apenas administradores podem validar pagamentos.',
          ephemeral: true
        });
      }
      
      if (!ticket) {
        return interaction.reply({
          content: '❌ Configuração não encontrada.',
          ephemeral: true
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId('config_ticket_menu')
        .setPlaceholder('Selecione uma opção...')
        .addOptions([
          {
            label: 'Título da Embed (OPCIONAL)',
            emoji: "❓",
            description: 'Alterar o título principal',
            value: 'embed_title'
          },
          {
            label: 'Descrição da Embed (OPCIONAL)',
            emoji: "💬",
            description: 'Alterar a descrição',
            value: 'embed_description'
          },
          {
            label: 'Cor da Embed (OPCIONAL)',
            emoji: "🎨",
            description: 'Alterar a cor (HEX)',
            value: 'embed_color'
          },
          {
            label: 'Imagem da Embed (OPCIONAL)',
            emoji: "🖼️",
            description: 'Adicionar/alterar imagem',
            value: 'embed_image'
          },
          {
            label: 'Chave PIX (OBRIGATÓRIO)',
            emoji: "💠",
            description: 'Configurar chave PIX',
            value: 'pix'
          },
          {
            label: 'Cor do Botão (OPCIONAL)',
            emoji: "🎨",
            description: 'Mudar cor do botão',
            value: 'button_color'
          },
          {
            label: 'Nome do Botão (OPCIONAL)',
            emoji: "❓",
            description: 'Mudar texto do botão',
            value: 'button_label'
          },
          {
            label: 'Emoji do Botão (OPCIONAL)',
            emoji: "😀",
            description: 'Adicionar emoji ao botão',
            value: 'button_emoji'
          },
          {
            label: 'Remover Botão de Edição (OPCIONAL)',
            emoji: "⚙️",
            description: 'Esta ação é irreversível',
            value: 'remove_config_button'
          },
          {
            label: 'Tipo de Pagamento (OBRIGATÓRIO)',
            description: 'Vendas Manual ou Vendas Automáticas',
            emoji: "💰",
            value: 'ticket_type'
          },
          {
            label: 'Canal de Avaliações (OPCIONAL)',
            description: 'Selecionar canal para avaliações',
            emoji: "⭐",
            value: 'review_channel'
          },
          {
            label: 'Categoria para Vendas (OPCIONAL)',
            description: 'Selecionar categoria para canais de venda',
            emoji: "📁",
            value: 'sales_category'
          },
          {
            label: 'Setar Estoque (OPCIONAL)',
            emoji: "📦",
            description: 'Configurar produtos em estoque',
            value: 'set_stock'
          },
          {
            label: 'Vendas em Menu (OPCIONAL)',
            emoji: "📝",
            description: 'Usar menu dropdown ao invés de botão',
            value: 'menu_mode'
          },
          {
            label: 'Adicionar Opção ao Menu (DROPDOWN)',
            emoji: "➕",
            description: 'Adicionar opção ao menu dropdown',
            value: 'add_menu_option'
          },
          {
            label: 'Editar Produto (DROPDOWN)',
            emoji: "🔄",
            description: 'Editar produto existente no menu',
            value: 'edit_menu_option'
          },
          {
            label: 'Excluir Produto (DROPDOWN)',
            emoji: "🗑️",
            description: 'Remover produto do menu',
            value: 'delete_menu_option'
          },
          {
            label: 'Exportar Configurações (PRODUTO)',
            emoji: "📤",
            description: 'Exportar configurações em JSON',
            value: 'export_config'
          },
          {
            label: 'Importar Configurações (PRODUTO)',
            emoji: "📥",
            description: 'Importar configurações de JSON',
            value: 'import_config'
          },
          {
            label: 'Gerenciar Cupons',
            emoji: "🎟️",
            description: 'Criar e gerenciar cupons de desconto',
            value: 'manage_coupons'
          },
          {
            label: 'Cargo para Compradores',
            emoji: "👤",
            description: 'Definir cargo para compradores após compra',
            value: 'buyer_role'
          },/* 
          {
            label: 'Estilo de Avaliação',
            emoji: "⭐",
            description: 'Selecionar estilo de avaliação',
            value: 'rating_style'
          },
          {
            label: 'Salvar Configurações',
            emoji: "💾",
            description: 'Salvar configurações atuais',
            value: 'save'
          } */
        ]);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#242429')
            .setTitle('Painel de configuração da embed')
            .setDescription('Selecione o que deseja configurar no menu abaixo:')
        ],
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }

    if (interaction.customId === 'config_ticket_menu') {
      const ticket = await Ticket.findOne({ messageId: interaction.message.reference?.messageId });

      if (!ticket) {
        return interaction.reply({
          content: '❌ Configuração não encontrada.',
          ephemeral: true
        });
      }

      const selectedOption = interaction.values[0];

      if (selectedOption === 'export_config') {
        try {
          // Buscar todos os produtos do ticket
          const products = await Product.find({ ticketId: ticket.messageId });
          
          // Preparar objeto de configuração
          const config = {
            embedSettings: ticket.embedSettings,
            buttonSettings: ticket.buttonSettings,
            products: products.map(product => ({
              label: product.label,
              emoji: product.emoji,
              description: product.originalDescription,
              price: product.price,
              stock: product.stock
            }))
          };
          
          // Converter para JSON
          const jsonConfig = JSON.stringify(config, null, 2);
          
          // Criar nome do arquivo personalizado
          const fileName = `${ticket.embedSettings.title || 'config'}-${ticket.messageId}-${interaction.user.username}-config.json`;
          
          // Criar arquivo temporário
          const buffer = Buffer.from(jsonConfig);
          
          await interaction.reply({
            content: '📤 Aqui está sua configuração exportada:',
            files: [{
              attachment: buffer,
              name: fileName
            }],
            ephemeral: true
          });
        } catch (error) {
          console.error('Erro ao exportar configurações:', error);
          await interaction.reply({
            content: '❌ Erro ao exportar configurações.',
            ephemeral: true
          });
        }
        return;
      }

      if (selectedOption === 'import_config') {
        await interaction.reply({
          content: '📥 Envie o arquivo JSON com as configurações:',
          ephemeral: true
        });

        const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
        try {
          const collected = await interaction.channel.awaitMessages({
            filter,
            max: 1,
            time: 60000,
            errors: ['time']
          });

          const message = collected.first();
          const attachment = message.attachments.first();
          
          if (!attachment.name.endsWith('.json')) {
            await interaction.followUp({
              content: '❌ O arquivo deve ser um JSON válido.',
              ephemeral: true
            });
            return;
          }

          // Extrair informações do nome do arquivo
          const fileNameParts = attachment.name.split('-');
          const originalTitle = fileNameParts[0];
          const originalMessageId = fileNameParts[1];
          const originalUsername = fileNameParts[2];
          
          // Baixar e ler o arquivo JSON
          const response = await fetch(attachment.url);
          const config = await response.json();
          
          // Validar estrutura do JSON
          if (!config.embedSettings || !config.buttonSettings || !Array.isArray(config.products)) {
            throw new Error('Formato de configuração inválido');
          }
          
          // Atualizar configurações do ticket
          ticket.embedSettings = config.embedSettings;
          ticket.buttonSettings = config.buttonSettings;
          await ticket.save();
          
          // Remover produtos antigos
          await Product.deleteMany({ ticketId: ticket.messageId });
          
          // Adicionar novos produtos
          for (const productData of config.products) {
            await Product.create({
              ticketId: ticket.messageId,
              optionId: `option_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              label: productData.label,
              emoji: productData.emoji,
              originalDescription: productData.description,
              description: productData.description.replace('[preco]', `R$ ${productData.price.toFixed(2)}`).replace('[estoque]', productData.stock.toString()),
              price: productData.price,
              stock: productData.stock
            });
          }
          
          await message.delete().catch(() => {});
          await updateEmbed(interaction.channel, ticket);
          
          await interaction.followUp({
            content: `✅ Configurações importadas com sucesso!\nArquivo original: ${originalTitle} (ID: ${originalMessageId})\nExportado por: ${originalUsername}`,
            ephemeral: true
          });
        } catch (error) {
          console.error('Erro ao importar configurações:', error);
          await interaction.followUp({
            content: '❌ Erro ao importar configurações. Verifique se o arquivo JSON é válido.',
            ephemeral: true
          });
        }
        return;
      }

      if (selectedOption === 'embed_image') {
        await interaction.reply({
          content: '🖼️ Envie uma imagem (anexada) ou um link direto da imagem:',
          ephemeral: true
        });

        const filter = m => {
          const hasImage = m.attachments.size > 0;
          const hasValidUrl = m.content.match(/^(http(s?):)([/|.|\w|\s|-])*\.(?:jpg|gif|png|webp)$/);
          return m.author.id === interaction.user.id && (hasImage || hasValidUrl);
        };

        try {
          const collected = await interaction.channel.awaitMessages({
            filter,
            max: 1,
            time: 60000,
            errors: ['time']
          });

          const message = collected.first();
          let imageUrl;

          if (message.attachments.size > 0) {
            // Se for um anexo, fazer upload permanente
            const attachment = message.attachments.first();
            // Aqui você implementaria a lógica de upload para um serviço de hosting
            // Por exemplo, usando imgur, cloudinary, ou seu próprio servidor
            
            // Por enquanto, vamos usar o CDN do Discord (não recomendado para produção)
            imageUrl = attachment.proxyURL;
            
            // Aviso sobre hospedagem
            await interaction.followUp({
              content: '⚠️ Recomendado: Use um link de imagem hospedada permanentemente para evitar que a imagem fique indisponível.',
              ephemeral: true
            });
          } else {
            // Se for um link, usar diretamente
            imageUrl = message.content;
          }

          ticket.embedSettings.image = imageUrl;
          await ticket.save();
          await updateEmbed(interaction.channel, ticket);
          await message.delete().catch(() => {});

          await interaction.followUp({
            content: '✅ Imagem atualizada com sucesso!',
            ephemeral: true
          });

        } catch (error) {
          if (error.name === 'CollectorError') {
            await interaction.followUp({
              content: '❌ Tempo esgotado ou formato de imagem inválido. Use .jpg, .png, .gif ou .webp',
              ephemeral: true
            });
          } else {
            console.error('Erro:', error);
            await interaction.followUp({
              content: '❌ Erro ao atualizar imagem.',
              ephemeral: true
            });
          }
        }
        return;
      }

      if (selectedOption === 'review_channel') {
        // Criar menu com os canais do servidor
        const channels = interaction.guild.channels.cache
          .filter(channel => channel.type === 0) // 0 é o tipo para canais de texto
          .map(channel => ({
            label: channel.name,
            value: channel.id,
            description: `ID: ${channel.id}`
          }));

        if (channels.length === 0) {
          return interaction.reply({
            content: '❌ Não foram encontrados canais de texto neste servidor.',
            ephemeral: true
          });
        }

        const menuOptions = createReviewChannelMenu(channels, 0);
        await interaction.reply(menuOptions);
        return;
      }

      if (selectedOption === 'buyer_role') {
        // Obter o membro do bot no servidor
        const botMember = interaction.guild.members.cache.get(interaction.client.user.id);
        if (!botMember) {
          return interaction.reply({
            content: '❌ Não foi possível encontrar o bot no servidor.',
            ephemeral: true
          });
        }

        // Obter a posição do cargo mais alto do bot
        const botHighestRole = botMember.roles.highest;
        
        // Criar menu com os cargos do servidor que estão abaixo do bot na hierarquia
        const roles = interaction.guild.roles.cache
          .filter(role => 
            !role.managed && 
            role.id !== interaction.guild.id && 
            role.position < botHighestRole.position) // Apenas cargos abaixo do bot
          .map(role => ({
            label: role.name,
            value: role.id,
            description: `ID: ${role.id}`
          }));

        if (roles.length === 0) {
          return interaction.reply({
            content: '❌ Não foram encontrados cargos disponíveis abaixo do cargo do bot na hierarquia.\n\n⚠️ **IMPORTANTE:** Para que o bot possa adicionar cargos aos compradores, o cargo desejado deve estar posicionado **ABAIXO** do cargo do bot na hierarquia de cargos do Discord. Por favor, verifique as configurações de cargos do servidor.',
            ephemeral: true
          });
        }

        const menuOptions = createBuyerRoleMenu(roles, 0);
        await interaction.reply(menuOptions);
        return;
      }

      if (selectedOption === 'sales_category') {
        // Buscar categorias do servidor
        const categories = interaction.guild.channels.cache
          .filter(channel => channel.type === 4) // Categoria
          .map(category => ({
            label: category.name.length > 25 ? category.name.substring(0, 22) + '...' : category.name,
            value: category.id,
            description: `ID: ${category.id}`
          }));

        // Adicionar opção para usar threads (tópicos)
        categories.unshift({
          label: '💬 Usar Tópicos (Threads)',
          value: 'use_threads',
          description: 'Voltar a usar tópicos ao invés de canais'
        });

        if (categories.length === 0) {
          return interaction.reply({
            content: '❌ Não foram encontradas categorias neste servidor.',
            ephemeral: true
          });
        }
        
        const menuOptions = createSalesCategoryMenu(categories, 0);
        await interaction.reply(menuOptions);
        return;
      }

      const promptMessages = {
        'embed_title': '📝 Digite o novo título da embed:',
        'embed_description': '📝 Digite a nova descrição da embed:',
        'embed_color': '🎨 Digite a nova cor em HEX (exemplo: #5865F2):',
        'embed_image': '🖼️ Envie o link da imagem:',
        'button_label': '✏️ Digite o novo texto para o botão:',
        'button_emoji': '😀 Digite o emoji para o botão:',
        'pix': '💳 Digite a chave PIX:'
      };

      if (selectedOption === 'button_color') {
        const colorMenu = new StringSelectMenuBuilder()
          .setCustomId('button_color_select')
          .setPlaceholder('Selecione a cor do botão')
          .addOptions([
            { label: 'Azul', description: 'Cor padrão', value: 'Primary' },
            { label: 'Verde', description: 'Cor de sucesso', value: 'Success' },
            { label: 'Cinza', description: 'Cor secundária', value: 'Secondary' },
            { label: 'Vermelho', description: 'Cor de perigo', value: 'Danger' }
          ]);

        await interaction.reply({
          content: '🎨 Selecione a cor do botão:',
          components: [new ActionRowBuilder().addComponents(colorMenu)],
          ephemeral: true
        });
        return;
      }

      if (selectedOption === 'remove_config_button') {
        await interaction.reply({
          content: '⚠️ **ATENÇÃO**: Esta ação é irreversível! Você não poderá mais editar esta embed depois.\nTem certeza que deseja remover o botão de configuração?\nResponda com `sim` para confirmar ou `não` para cancelar.',
          ephemeral: true
        });

        const filter = m => m.author.id === interaction.user.id && ['sim', 'não'].includes(m.content.toLowerCase());
        
        try {
          const collected = await interaction.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
          });

          const response = collected.first();
          await response.delete().catch(() => {});

          if (response.content.toLowerCase() === 'sim') {
            ticket.buttonSettings.hideConfig = true; // Adicione este campo no modelo Ticket
            await ticket.save();
            await updateEmbed(interaction.channel, ticket);

            await interaction.followUp({
              content: '✅ Botão de configuração removido com sucesso!',
              ephemeral: true
            });
          } else {
            await interaction.followUp({
              content: '❌ Operação cancelada.',
              ephemeral: true
            });
          }
        } catch (error) {
          await interaction.followUp({
            content: '❌ Tempo esgotado ou erro ao processar o comando.',
            ephemeral: true
          });
        }
        return;
      }

      if (selectedOption === 'ticket_type') {
        const typeMenu = new StringSelectMenuBuilder()
          .setCustomId('ticket_type_select')
          .setPlaceholder('Selecione o tipo de pagamento')
          .addOptions([
            {
              label: 'Vendas Manual',
              description: 'Para vendas manuais com PIX',
              value: 'vendas'
            },
            {
              label: 'Vendas Automáticas (Beta)',
              description: 'Para vendas automáticas com Mercado Pago',
              value: 'vendas_auto'
            }
          ]);
      
        await interaction.reply({
          content: 'Selecione o tipo de pagamento, vendas automáticas é beta:',
          components: [new ActionRowBuilder().addComponents(typeMenu)],
          ephemeral: true
        });
        return;
      }

      if (selectedOption === 'set_stock') {
        await interaction.reply({
          content: '📦 Cole o texto do seu estoque no formato:\n```\nproduto key\nproduto key\nproduto key\n-\nproduto key```\nUse `-` para separar produtos diferentes.',
          ephemeral: true
        });
      
        const filter = m => m.author.id === interaction.user.id;
        try {
          const collected = await interaction.channel.awaitMessages({
            filter,
            max: 1,
            time: 120000,
            errors: ['time']
          });
      
          const message = collected.first();
          try {
            // Split text into products by "-" separator
            const products = message.content.split('-').map(block => block.trim());
            
            // Convert to JSON format
            const stockData = products.map(product => {
              const lines = product.split('\n').filter(line => line.trim());
              return {
                name: `Produto ${lines.length} linha(s)`,
                content: lines.join('\n')
              };
            });
      
            ticket.embedSettings.stock = JSON.stringify(stockData);
            await ticket.save();
            await message.delete().catch(() => {});
      
            await interaction.followUp({
              content: `✅ Estoque configurado com sucesso! ${stockData.length} produtos adicionados.`,
              ephemeral: true
            });
          } catch (e) {
            console.error('Erro ao processar estoque:', e);
            await interaction.followUp({
              content: '❌ Formato inválido. Por favor, tente novamente.',
              ephemeral: true
            });
          }
        } catch (error) {
          await interaction.followUp({
            content: '❌ Tempo esgotado ou erro ao configurar estoque.',
            ephemeral: true
          });
        }
        return;
      }

      if (selectedOption === 'menu_mode') {
        const modal = new ModalBuilder()
          .setCustomId('menu_mode_modal')
          .setTitle('Configurar Menu Dropdown');

        const placeholderInput = new TextInputBuilder()
          .setCustomId('menu_placeholder')
          .setLabel('Texto do menu')
          .setPlaceholder('Ex: Selecione um produto...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const modeInput = new TextInputBuilder()
          .setCustomId('menu_mode')
          .setLabel('Modo (botão/menu)')
          .setValue('menu')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(placeholderInput);
        const secondRow = new ActionRowBuilder().addComponents(modeInput);

        modal.addComponents(firstRow, secondRow);
        await interaction.showModal(modal);
        return;
      }
      
      if (selectedOption === 'add_menu_option') {
        const modal = new ModalBuilder()
          .setCustomId('add_menu_option_modal')
          .setTitle('Adicionar Opção ao Menu');

        const nameInput = new TextInputBuilder()
          .setCustomId('option_name')
          .setLabel('Nome da opção')
          .setPlaceholder('Digite o nome que aparecerá no menu')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const emojiInput = new TextInputBuilder()
          .setCustomId('option_emoji')
          .setLabel('Emoji (opcional)')
          .setPlaceholder('Digite um emoji')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const descriptionInput = new TextInputBuilder()
          .setCustomId('option_description')
          .setLabel('Descrição (use [preco] e [estoque])')
          .setPlaceholder('Ex: Preço: [preco] | Estoque: [estoque]')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const priceInput = new TextInputBuilder()
          .setCustomId('option_price')
          .setLabel('Preço')
          .setPlaceholder('Digite o preço (ex: 10.00)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const stockInput = new TextInputBuilder()
          .setCustomId('option_stock')
          .setLabel('Quantidade em estoque')
          .setPlaceholder('Digite a quantidade disponível')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nameInput),
          new ActionRowBuilder().addComponents(emojiInput),
          new ActionRowBuilder().addComponents(descriptionInput),
          new ActionRowBuilder().addComponents(priceInput),
          new ActionRowBuilder().addComponents(stockInput)
        );

        await interaction.showModal(modal);
        return;
      }

      if (selectedOption === 'edit_menu_option') {
        const ticket = await Ticket.findOne({ messageId: interaction.message?.reference?.messageId });
        
        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração não encontrada.',
            ephemeral: true
          });
        }
        
        // Verificar se existem produtos no menu
        if (!ticket.embedSettings?.menuOptions || ticket.embedSettings.menuOptions.length === 0) {
          return interaction.reply({
            content: '❌ Não há produtos no menu para editar.',
            ephemeral: true
          });
        }
        
        // Criar menu para selecionar qual produto editar
        const productsMenu = new StringSelectMenuBuilder()
          .setCustomId('edit_product_select')
          .setPlaceholder('Selecione um produto para editar...');
          
        // Adicionar cada produto como uma opção no menu
        ticket.embedSettings.menuOptions.forEach(option => {
          productsMenu.addOptions([{
            label: option.label,
            description: option.description?.substring(0, 100) || 'Sem descrição',
            value: option.value,
            emoji: option.emoji
          }]);
        });
        
        await interaction.reply({
          content: '🔄 Selecione o produto que deseja editar:',
          components: [new ActionRowBuilder().addComponents(productsMenu)],
          ephemeral: true
        });
        
        return;
      }

      if (selectedOption === 'delete_menu_option') {
        const ticket = await Ticket.findOne({ messageId: interaction.message?.reference?.messageId });
        
        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração não encontrada.',
            ephemeral: true
          });
        }
        
        // Verificar se existem produtos no menu
        if (!ticket.embedSettings?.menuOptions || ticket.embedSettings.menuOptions.length === 0) {
          return interaction.reply({
            content: '❌ Não há produtos no menu para excluir.',
            ephemeral: true
          });
        }
        
        // Criar menu para selecionar qual produto excluir
        const productsMenu = new StringSelectMenuBuilder()
          .setCustomId('delete_product_select')
          .setPlaceholder('Selecione um produto para excluir...');
          
        // Adicionar cada produto como uma opção no menu
        ticket.embedSettings.menuOptions.forEach(option => {
          productsMenu.addOptions([{
            label: option.label,
            description: option.description?.substring(0, 100) || 'Sem descrição',
            value: option.value,
            emoji: option.emoji
          }]);
        });
        
        await interaction.reply({
          content: '🗑️ Selecione o produto que deseja excluir:',
          components: [new ActionRowBuilder().addComponents(productsMenu)],
          ephemeral: true
        });
        
        return;
      }

      if (selectedOption === 'embed_description') {
        await interaction.reply({
          content: promptMessages[selectedOption],
          ephemeral: true
        });

        const filter = m => m.author.id === interaction.user.id;
        const response = await interaction.channel.awaitMessages({
          filter,
          max: 1,
          time: 60000,
          errors: ['time']
        });

        const newValue = response.first().content;

        try {
          ticket.embedSettings.description = newValue;
          await ticket.save();
          await updateEmbed(interaction.channel, ticket);
          await response.first().delete().catch(() => {});

          await interaction.followUp({
            content: '✅ Descrição atualizada com sucesso!',
            ephemeral: true
          });
        } catch (error) {
          console.error('Erro ao atualizar descrição:', error);
          await interaction.followUp({
            content: '❌ Erro ao atualizar descrição.',
            ephemeral: true
          });
        }
        return;
      }

      if (selectedOption === 'manage_coupons') {
        const couponMenu = new StringSelectMenuBuilder()
          .setCustomId('coupon_management_menu')
          .setPlaceholder('Selecione uma ação...')
          .addOptions([
            {
              label: 'Criar Cupom',
              emoji: "➕",
              description: 'Criar um novo cupom de desconto',
              value: 'create_coupon'
            },
            {
              label: 'Listar Cupons',
              emoji: "📋",
              description: 'Ver todos os cupons disponíveis',
              value: 'list_coupons'
            },
            {
              label: 'Editar Cupom',
              emoji: "🔄",
              description: 'Editar um cupom existente',
              value: 'edit_coupon'
            },
            {
              label: 'Excluir Cupom',
              emoji: "🗑️",
              description: 'Remover um cupom',
              value: 'delete_coupon'
            }
          ]);

        await interaction.reply({
          content: 'Selecione uma ação para gerenciar os cupons:',
          components: [new ActionRowBuilder().addComponents(couponMenu)],
          ephemeral: true
        });
        return;
      }

      if (selectedOption === 'rating_style') {
        // Criar menu com os estilos de avaliação disponíveis
        const ratingStyles = [
          {
            label: 'Padrão',
            value: 'default',
            description: '⭐ Avaliação: 5.0/5 (2 avaliações)'
          },
          {
            label: 'Limpo',
            value: 'clean',
            description: '5.0/5 (2)'
          },
          {
            label: 'Estrelas',
            value: 'stars',
            description: '★★★★★ (2)'
          },
          {
            label: 'Emoji',
            value: 'emoji',
            description: '⭐ 5.0/5 (2 avaliações)'
          },
          {
            label: 'Detalhado',
            value: 'detailed',
            description: 'Avaliação: 5.0/5 | Total de avaliações: 2'
          }
        ];

        const menu = new StringSelectMenuBuilder()
          .setCustomId('select_rating_style')
          .setPlaceholder('Selecione o estilo de avaliação')
          .addOptions(ratingStyles);

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({
          content: '**Escolha o estilo de exibição das avaliações:**',
          components: [row],
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: promptMessages[selectedOption],
        ephemeral: true
      });

      const filter = m => m.author.id === interaction.user.id;
      const response = await interaction.channel.awaitMessages({
        filter,
        max: 1,
        time: 60000,
        errors: ['time']
      });

      const newValue = response.first().content;

      try {
        switch (selectedOption) {
          case 'embed_title':
            ticket.embedSettings.title = newValue;
            break;
          case 'embed_color':
            if (!/^#([0-9A-Fa-f]{6})$/.test(newValue)) {
              await interaction.followUp({
                content: '❌ Cor inválida. Use o formato HEX (#RRGGBB)',
                ephemeral: true
              });
              return;
            }
            ticket.embedSettings.color = newValue;
            break;
          case 'button_label': // Corrigindo esta parte
            ticket.buttonSettings.label = newValue;
            break;
          case 'button_emoji':
            ticket.buttonSettings.emoji = newValue;
            break;
          case 'pix':
            ticket.embedSettings.pixKey = newValue;
            break;
        }

        await ticket.save();
        await updateEmbed(interaction.channel, ticket);
        await response.first().delete().catch(() => {});

        await interaction.followUp({
          content: '✅ Configuração atualizada com sucesso!',
          ephemeral: true
        });
      } catch (error) {
        console.error('Erro:', error);
        await interaction.followUp({
          content: '❌ Erro ao atualizar configuração.',
          ephemeral: true
        });
      }
    }

    if (interaction.customId === 'button_color_select') {
      try {
        const selectedColor = interaction.values[0];
        
        // Buscar o ID da mensagem original que está armazenado no banco
        // A mensagem de referência é a mensagem do menu de configuração
        // que foi usada para chegar até aqui
        const originalMessageId = interaction.message.reference?.messageId;
        
        // Primeiro encontramos o ticket pelo ID da mensagem de configuração
        const configMessage = await interaction.channel.messages.fetch(originalMessageId);
        const originalMessageId2 = configMessage.reference?.messageId;
        
        // Agora buscamos o ticket usando o ID da mensagem original
        const ticket = await Ticket.findOne({ messageId: originalMessageId2 });

        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração não encontrada.',
            ephemeral: true
          });
        }

        ticket.buttonSettings.style = selectedColor;
        await ticket.save();
        await updateEmbed(interaction.channel, ticket);

        await interaction.reply({
          content: '✅ Cor do botão atualizada com sucesso!',
          ephemeral: true
        });
      } catch (error) {
        console.error('Erro ao atualizar cor do botão:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao atualizar a cor do botão.',
          ephemeral: true
        });
      }
    }

    if (interaction.customId === 'ticket_type_select') {
      try {
        const selectedType = interaction.values[0]
      
        // Buscar o ticket usando a mesma lógica do button_color_select
        const originalMessageId = interaction.message.reference?.messageId;
        const configMessage = await interaction.channel.messages.fetch(originalMessageId);
        const originalMessageId2 = configMessage.reference?.messageId;
        const ticket = await Ticket.findOne({ messageId: originalMessageId2 });

        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração não encontrada.',
            ephemeral: true
          });
        }

        // Atualizar o tipo do ticket
        ticket.ticketType = selectedType;
        await ticket.save();

        // Se for vendas automáticas, mostrar modal para token
        if (selectedType === 'vendas_auto') {
          const modal = new ModalBuilder()
            .setCustomId('mp_token_modal')
            .setTitle('Configurar Mercado Pago');

          const tokenInput = new TextInputBuilder()
            .setCustomId('mp_token')
            .setLabel('Token de Acesso do Mercado Pago')
            .setPlaceholder('Digite seu token de acesso...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const firstRow = new ActionRowBuilder().addComponents(tokenInput);
          modal.addComponents(firstRow);

          await interaction.showModal(modal);
          return;
        }

        // Mensagem de confirmação baseada no tipo selecionado
        const typeMessages = {
          normal: '✅ Ticket configurado como Normal',
          vendas: '✅ Ticket configurado como Vendas Manual',
          vendas_auto: '✅ Ticket configurado como Vendas Automáticas\n\nPor favor, configure o token de acesso do Mercado Pago usando o comando de configuração.'
        };

        await interaction.reply({
          content: typeMessages[selectedType],
          ephemeral: true
        });

      } catch (error) {
        console.error('Erro ao atualizar tipo do ticket:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao atualizar o tipo do ticket.',
          ephemeral: true
        });
      }
    }

    // Adicionar tratamento do modal de token
    if (interaction.isModalSubmit() && interaction.customId === 'mp_token_modal') {
      try {
        const token = interaction.fields.getTextInputValue('mp_token');
        
        // Buscar o ticket
        const originalMessageId = interaction.message.reference?.messageId;
        const configMessage = await interaction.channel.messages.fetch(originalMessageId);
        const originalMessageId2 = configMessage.reference?.messageId;
        const ticket = await Ticket.findOne({ messageId: originalMessageId2 });

        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração não encontrada.',
            ephemeral: true
          });
        }

        // Validar o token
        const validation = await MercadoPagoManager.validateToken(token);

        if (!validation.valid) {
          return interaction.reply({
            content: `❌ Token inválido!`,
            ephemeral: true
          });
        }

        // Salvar o token e informações do usuário
        ticket.mpToken = token;
        ticket.mpUserInfo = {
          accountType: validation.accountType,
          email: validation.email,
          nickname: validation.nickname
        };
        await ticket.save();

        await interaction.reply({
          content: `Configurado com sucesso!\n\nNome: ${validation.nickname}\nEmail: ${validation.email}\nDados: ${validation.accountType}`,
          ephemeral: true
        });

      } catch (error) {
        console.error('Erro ao validar token do Mercado Pago:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao validar o token do Mercado Pago.',
          ephemeral: true
        });
      }
    }

    if (interaction.customId === 'menu_mode_select') {
      try {
        const selectedMode = interaction.values[0];
        
        // Buscar referência da mensagem original através da propriedade message
        const messageReference = interaction.message?.reference;
        const configMessage = messageReference ? 
          await interaction.channel.messages.fetch(messageReference.messageId) : null;
        
        // Tentar encontrar o ticket usando a referência da configuração
        const ticket = await Ticket.findOne({ 
          messageId: configMessage?.reference?.messageId 
        });

        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração não encontrada. Por favor, tente novamente.',
            ephemeral: true
          });
        }

        // Atualizar configurações do menu
        if (!ticket.embedSettings) {
          ticket.embedSettings = {};
        }

        ticket.embedSettings.useMenu = selectedMode === 'menu';
        if (!ticket.embedSettings.menuOptions) {
          ticket.embedSettings.menuOptions = [];
        }

        await ticket.save();
        
        // Buscar o canal original do ticket
        const originalChannel = interaction.guild.channels.cache.get(ticket.channelId);
        if (!originalChannel) {
          throw new Error('Canal do ticket não encontrado');
        }

        // Atualizar a embed no canal original
        await updateEmbed(originalChannel, ticket);

        await interaction.reply({
          content: `✅ Modo alterado para: ${selectedMode === 'menu' ? 'Menu Dropdown' : 'Botão Normal'}`,
          ephemeral: true
        });

      } catch (error) {
        console.error('Erro ao alterar modo:', error);
        await interaction.reply({
          content: '❌ Erro ao alterar modo. Por favor, tente novamente.',
          ephemeral: true
        });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'menu_mode_modal') {
      try {
        const placeholder = interaction.fields.getTextInputValue('menu_placeholder');
        const selectedMode = interaction.fields.getTextInputValue('menu_mode').toLowerCase();
        
        // Find the original message ID through interaction chain
        const ticket = await Ticket.findOne({
          $or: [
            { messageId: interaction.message?.reference?.messageId },
            { messageId: interaction.message?.id }
          ]
        });

        if (!ticket || !ticket.messageId) {
          return interaction.reply({
            content: '❌ Configuração não encontrada ou ID da mensagem inválido.',
            ephemeral: true
          });
        }

        // Initialize if needed
        if (!ticket.embedSettings) {
          ticket.embedSettings = {};
        }

        ticket.embedSettings.useMenu = selectedMode === 'menu';
        ticket.embedSettings.menuPlaceholder = placeholder;
        
        if (!ticket.embedSettings.menuOptions) {
          ticket.embedSettings.menuOptions = [];
        }

        await ticket.save();

        // Get the channel and validate message exists
        const targetChannel = interaction.guild.channels.cache.get(ticket.channelId);
        if (!targetChannel) {
          throw new Error('Canal não encontrado');
        }

        // Verify message exists before updating
        const messageToUpdate = await targetChannel.messages.fetch(ticket.messageId)
          .catch(() => null);

        if (!messageToUpdate) {
          throw new Error('Mensagem não encontrada');
        }

        const updatedComponents = createComponents(ticket);

        // Atualizar a mensagem mantendo os outros componentes
        await safeMessageEdit(messageToUpdate, messageToUpdate.embeds, updatedComponents);

        await interaction.reply({
          content: `✅ Menu configurado com sucesso!\nModo: ${selectedMode === 'menu' ? 'Menu Dropdown' : 'Botão Normal'}\nTexto do menu: ${placeholder}`,
          ephemeral: true
        });

      } catch (error) {
        console.error('Erro ao configurar menu:', error);
        await interaction.reply({
          content: `❌ Erro ao configurar menu: ${error.message}`,
          ephemeral: true
        });
      }
    }

    // No trecho onde adiciona uma nova opção ao menu
    if (interaction.isModalSubmit() && interaction.customId === 'add_menu_option_modal') {
      try {
        const label = interaction.fields.getTextInputValue('option_name');
        const emoji = interaction.fields.getTextInputValue('option_emoji');
        const description = interaction.fields.getTextInputValue('option_description');
        const price = parseFloat(interaction.fields.getTextInputValue('option_price'));
        const stock = parseInt(interaction.fields.getTextInputValue('option_stock'));

        // Validações...

        const ticket = await Ticket.findOne({ messageId: interaction.message?.reference?.messageId });
        
        if (!ticket) return;

        // Criar ID único para a opção
        const optionId = `option_${Date.now()}`;

        // Criar produto no banco de dados
        const product = await Product.create({
          ticketId: ticket.messageId,
          optionId: optionId,
          label,
          price,
          stock,
          description: description.replace('[preco]', `R$ ${price.toFixed(2)}`).replace('[estoque]', stock.toString()),
          emoji: emoji || undefined,
          originalDescription: description
        });

        // Adicionar opção ao menu do ticket
        if (!ticket.embedSettings.menuOptions) {
          ticket.embedSettings.menuOptions = [];
        }

        ticket.embedSettings.menuOptions.push({
          label,
          emoji: emoji || undefined,
          description: product.description,
          value: optionId
        });

        await ticket.save();
        await updateEmbed(interaction.channel, ticket);

        await interaction.reply({
          content: `✅ Produto adicionado ao menu com sucesso!\nNome: ${label}\nPreço: R$ ${price.toFixed(2)}\nEstoque: ${stock}`,
          ephemeral: true
        });

      } catch (error) {
        console.error('Erro ao adicionar opção:', error);
        await interaction.reply({
          content: '❌ Erro ao adicionar opção ao menu.',
          ephemeral: true
        });
      }
    }

    // Tratamento da seleção de produto para edição
    if (interaction.isStringSelectMenu() && interaction.customId === 'edit_product_select') {
      try {
        const selectedProductId = interaction.values[0];
        
        // Buscar diretamente o produto
        const product = await Product.findOne({ optionId: selectedProductId });
        
        if (!product) {
          return interaction.reply({
            content: '❌ Produto não encontrado.',
            ephemeral: true
          });
        }
        
        // Criar modal para editar o produto
        const modal = new ModalBuilder()
          .setCustomId(`edit_product_modal_${selectedProductId}`)
          .setTitle('Editar Produto');
        
        const nameInput = new TextInputBuilder()
          .setCustomId('option_name')
          .setLabel('Nome do produto')
          .setValue(product.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const emojiInput = new TextInputBuilder()
          .setCustomId('option_emoji')
          .setLabel('Emoji (opcional)')
          .setValue(product.emoji || '')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        
        const descriptionInput = new TextInputBuilder()
          .setCustomId('option_description')
          .setLabel('Descrição (use [preco] e [estoque])')
          .setValue(product.originalDescription)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);
        
        const priceInput = new TextInputBuilder()
          .setCustomId('option_price')
          .setLabel('Preço')
          .setValue(product.price.toString())
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const stockInput = new TextInputBuilder()
          .setCustomId('option_stock')
          .setLabel('Quantidade em estoque')
          .setValue(product.stock.toString())
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        modal.addComponents(
          new ActionRowBuilder().addComponents(nameInput),
          new ActionRowBuilder().addComponents(emojiInput),
          new ActionRowBuilder().addComponents(descriptionInput),
          new ActionRowBuilder().addComponents(priceInput),
          new ActionRowBuilder().addComponents(stockInput)
        );
        
        await interaction.showModal(modal);
        
      } catch (error) {
        console.error('Erro ao preparar edição de produto:', error);
        await interaction.reply({
          content: '❌ Erro ao preparar a edição do produto.',
          ephemeral: true
        });
      }
    }
    
    // Tratamento da submissão do modal de edição de produto
    if (interaction.isModalSubmit() && interaction.customId.startsWith('edit_product_modal_')) {
      try {
        // Extrair o ID do produto do customId
        const productId = interaction.customId.replace('edit_product_modal_', '');
        
        // Obter os valores do formulário
        const label = interaction.fields.getTextInputValue('option_name');
        const emoji = interaction.fields.getTextInputValue('option_emoji');
        const description = interaction.fields.getTextInputValue('option_description');
        const price = parseFloat(interaction.fields.getTextInputValue('option_price'));
        const stock = parseInt(interaction.fields.getTextInputValue('option_stock'));
        
        // Validar valores
        if (isNaN(price) || price <= 0) {
          return interaction.reply({
            content: '❌ Preço inválido. Por favor, insira um número maior que zero.',
            ephemeral: true
          });
        }
        
        if (isNaN(stock) || stock < 0) {
          return interaction.reply({
            content: '❌ Estoque inválido. Por favor, insira um número não negativo.',
            ephemeral: true
          });
        }
        
        // Buscar diretamente o produto primeiro
        const product = await Product.findOne({ optionId: productId });
        
        if (!product) {
          return interaction.reply({
            content: '❌ Produto não encontrado.',
            ephemeral: true
          });
        }
        
        // Verificar se houve reabastecimento de estoque (estoque anterior era 0 e novo estoque > 0)
        const estoqueAnterior = product.stock;
        const houvereabastecimento = estoqueAnterior === 0 && stock > 0;
        
        // Agora buscar o ticket usando o ID do produto
        const ticket = await Ticket.findOne({ messageId: product.ticketId });
        
        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração do ticket não encontrada.',
            ephemeral: true
          });
        }
        
        // Atualizar o produto no banco de dados
        product.label = label;
        product.emoji = emoji || undefined;
        product.originalDescription = description;
        product.description = description.replace('[preco]', `R$ ${price.toFixed(2)}`).replace('[estoque]', stock.toString());
        product.price = price;
        product.stock = stock;
        
        await product.save();
        
        // Atualizar a opção no menu do ticket
        if (ticket.embedSettings?.menuOptions) {
          const menuOptionIndex = ticket.embedSettings.menuOptions.findIndex(opt => opt.value === productId);
          
          if (menuOptionIndex !== -1) {
            ticket.embedSettings.menuOptions[menuOptionIndex] = {
              label,
              emoji: emoji || undefined,
              description: product.description,
              value: productId
            };
            
            await ticket.save();
            
            // Buscar a mensagem original
            const channel = interaction.guild.channels.cache.get(ticket.channelId);
            if (channel) {
              const message = await channel.messages.fetch(ticket.messageId);
              if (message) {
                // Manter os componentes existentes
                const existingComponents = message.components;
                
                // Atualizar apenas o menu
                const updatedComponents = existingComponents.map(row => {
                  if (row.components[0]?.customId === 'create_ticket') {
                    return new ActionRowBuilder().addComponents(
                      new StringSelectMenuBuilder()
                        .setCustomId('create_ticket')
                        .setPlaceholder(ticket.embedSettings.menuPlaceholder || 'Selecione uma opção')
                        .addOptions(ticket.embedSettings.menuOptions.map(option => ({
                          label: option.label || 'Opção',
                          value: option.value || 'option_default',
                          description: option.description || undefined,
                          emoji: option.emoji || undefined
                        })))
                    );
                  }
                  return row;
                });
                
                // Atualizar a mensagem mantendo os outros componentes
                await safeMessageEdit(message, message.embeds, updatedComponents);
              }
            }
            
            // Primeiro responder à interação antes de fazer qualquer followUp
            await interaction.reply({
              content: `✅ Produto atualizado com sucesso!\nNome: ${label}\nPreço: R$ ${price.toFixed(2)}\nEstoque: ${stock}`,
              ephemeral: true
            });
            
            // Enviar notificações se houve reabastecimento
            if (houvereabastecimento && product.stockNotifications && product.stockNotifications.length > 0) {
              let notificacoesEnviadas = 0;
              
              // Criar link para o produto
              const productLink = `https://discord.com/channels/${interaction.guild.id}/${ticket.channelId}/${ticket.messageId}`;
              
              for (const userId of product.stockNotifications) {
                try {
                  const user = await interaction.client.users.fetch(userId);
                  await user.send({
                    embeds: [
                      new EmbedBuilder()
                        .setColor('#242429')
                        .setTitle(':tada: Notificação de Estoque :tada:')
                        .setDescription(`O produto **${product.label}** está disponível novamente!\n\nEstoque atual: **${product.stock}**\nPreço: **R$ ${product.price.toFixed(2)}**\n\n<@${userId}>, clique no botão abaixo para comprar:`)
                    ],
                    components: [
                      new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                          .setLabel('Comprar agora')
                          .setStyle(ButtonStyle.Link)
                          .setURL(productLink),
                        new ButtonBuilder()
                          .setCustomId(`cancel_notify_${productId}`)
                          .setLabel('Cancelar notificação')
                          .setStyle(ButtonStyle.Secondary)
                      )
                    ]
                  });
                  notificacoesEnviadas++;
                } catch (error) {
                  console.error(`Erro ao enviar notificação para o usuário ${userId}:`, error);
                }
              }
              
              // Informar sobre as notificações enviadas (agora usando followUp após já ter um reply)
              if (notificacoesEnviadas > 0) {
                await interaction.followUp({
                  content: `📢 Foram enviadas ${notificacoesEnviadas} notificações sobre disponibilidade de estoque.`,
                  ephemeral: true
                });
              }
            }
          } else {
            throw new Error('Opção não encontrada no menu');
          }
        } else {
          throw new Error('Menu de opções não encontrado');
        }
        
      } catch (error) {
        console.error('Erro ao editar produto:', error);
        
        // Para garantir que sempre haja uma resposta, mesmo em caso de erro
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: `❌ Erro ao editar produto: ${error.message}`,
            ephemeral: true
          });
        } else {
          await interaction.followUp({
            content: `❌ Erro ao editar produto: ${error.message}`,
            ephemeral: true
          });
        }
      }
    }

    // Tratamento da seleção de produto para exclusão
    if (interaction.isStringSelectMenu() && interaction.customId === 'delete_product_select') {
      try {
        const selectedProductId = interaction.values[0];
        
        // Buscar diretamente o produto
        const product = await Product.findOne({ optionId: selectedProductId });
        
        if (!product) {
          return interaction.reply({
            content: '❌ Produto não encontrado.',
            ephemeral: true
          });
        }
        
        // Criar botões de confirmação
        const confirmButton = new ButtonBuilder()
          .setCustomId(`confirm_delete_product_${selectedProductId}`)
          .setLabel('Confirmar Exclusão')
          .setStyle(ButtonStyle.Danger);
        
        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_delete_product')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Secondary);
        
        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
        
        await interaction.reply({
          content: `⚠️ Tem certeza que deseja excluir o produto **${product.label}**?\nEsta ação não pode ser desfeita.`,
          components: [row],
          ephemeral: true
        });
        
      } catch (error) {
        console.error('Erro ao preparar exclusão de produto:', error);
        await interaction.reply({
          content: '❌ Erro ao preparar a exclusão do produto.',
          ephemeral: true
        });
      }
    }
    
    // Tratamento da confirmação de exclusão de produto
    if (interaction.isButton() && interaction.customId.startsWith('confirm_delete_product_')) {
      try {
        // Extrair o ID do produto do customId
        const productId = interaction.customId.replace('confirm_delete_product_', '');
        
        // Buscar diretamente o produto primeiro
        const product = await Product.findOne({ optionId: productId });
        
        if (!product) {
          return interaction.reply({
            content: '❌ Produto não encontrado.',
            ephemeral: true
          });
        }
        
        // Agora buscar o ticket usando o ID do produto
        const ticket = await Ticket.findOne({ messageId: product.ticketId });
        
        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração do ticket não encontrada.',
            ephemeral: true
          });
        }
        
        // Remover o produto do banco de dados
        await Product.deleteOne({ optionId: productId });
        
        // Remover a opção do menu do ticket
        if (ticket.embedSettings?.menuOptions) {
          ticket.embedSettings.menuOptions = ticket.embedSettings.menuOptions.filter(
            opt => opt.value !== productId
          );
          
          await ticket.save();
          await updateEmbed(interaction.channel, ticket);
          
          await interaction.reply({
            content: `✅ Produto **${product.label}** excluído com sucesso!`,
            ephemeral: true
          });
        } else {
          throw new Error('Menu de opções não encontrado');
        }
        
      } catch (error) {
        console.error('Erro ao excluir produto:', error);
        await interaction.reply({
          content: `❌ Erro ao excluir produto: ${error.message}`,
          ephemeral: true
        });
      }
    }
    
    // Tratamento do cancelamento de exclusão de produto
    if (interaction.isButton() && interaction.customId === 'cancel_delete_product') {
      await interaction.reply({
        content: '✅ Exclusão cancelada!',
        ephemeral: true
      });
    }

    // Adicionar o tratamento para o menu de gerenciamento de cupons
    if (interaction.customId === 'coupon_management_menu') {
      const selectedAction = interaction.values[0];
      
      switch (selectedAction) {
        case 'create_coupon':
          // Substituir o modal técnico pelo assistente amigável
          const couponWizard = require('./couponCreationWizard');
          await couponWizard.startWizard(interaction);
          break;
          
        case 'list_coupons':
          const coupons = await Coupon.find({ creatorId: interaction.user.id });
          if (coupons.length === 0) {
            await interaction.reply({
              content: 'Nenhum cupom encontrado.',
              ephemeral: true
            });
            return;
          }
          
          const embed = CouponComponents.createCouponListEmbed(coupons);
          
          await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
          break;
          
        case 'edit_coupon':
          const editCoupons = await Coupon.find({ creatorId: interaction.user.id });
          if (editCoupons.length === 0) {
            await interaction.reply({
              content: 'Nenhum cupom encontrado para editar.',
              ephemeral: true
            });
            return;
          }
          
          const selectEdit = new StringSelectMenuBuilder()
            .setCustomId('edit_coupon_select')
            .setPlaceholder('Selecione um cupom para editar...')
            .addOptions(
              editCoupons.map(coupon => ({
                label: coupon.name,
                description: `${coupon.discountType === 'fixed' ? `R$ ${coupon.discountValue}` : `${coupon.discountValue}%`} | Usos: ${coupon.uses}/${coupon.maxUses}`,
                value: coupon._id.toString()
              }))
            );
          
          await interaction.reply({
            content: 'Selecione o cupom que deseja editar:',
            components: [new ActionRowBuilder().addComponents(selectEdit)],
            ephemeral: true
          });
          break;
          
        case 'delete_coupon':
          const deleteCoupons = await Coupon.find({ creatorId: interaction.user.id });
          if (deleteCoupons.length === 0) {
            await interaction.reply({
              content: 'Nenhum cupom encontrado para excluir.',
              ephemeral: true
            });
            return;
          }
          
          const selectDelete = new StringSelectMenuBuilder()
            .setCustomId('delete_coupon_select')
            .setPlaceholder('Selecione um cupom para excluir...')
            .addOptions(
              deleteCoupons.map(coupon => ({
                label: coupon.name,
                description: `${coupon.discountType === 'fixed' ? `R$ ${coupon.discountValue}` : `${coupon.discountValue}%`} | Usos: ${coupon.uses}/${coupon.maxUses}`,
                value: coupon._id.toString()
              }))
            );
          
          await interaction.reply({
            content: 'Selecione o cupom que deseja excluir:',
            components: [new ActionRowBuilder().addComponents(selectDelete)],
            ephemeral: true
          });
          break;
      }
    }

    // Adicionar o tratamento para a seleção de cupom para edição
    if (interaction.customId === 'edit_coupon_select') {
      const couponId = interaction.values[0];
      const coupon = await Coupon.findById(couponId);
      
      if (!coupon) {
        await interaction.reply({
          content: 'Cupom não encontrado.',
          ephemeral: true
        });
        return;
      }
      
      // Iniciar assistente de edição de cupom
      const couponWizard = require('./couponCreationWizard');
      // Salvar o ID do cupom para edição
      interaction.client.editingCouponId = couponId;
      await couponWizard.startWizard(interaction, coupon); // Passa o cupom para o wizard
    }
    
    // Adicionar o tratamento para a seleção de cupom para exclusão
    if (interaction.customId === 'delete_coupon_select') {
      const couponId = interaction.values[0];
      const coupon = await Coupon.findById(couponId);
      
      if (!coupon) {
        await interaction.reply({
          content: 'Cupom não encontrado.',
          ephemeral: true
        });
        return;
      }
      
      await Coupon.findByIdAndDelete(couponId);
      
      await interaction.reply({
        content: `✅ Cupom "${coupon.name}" excluído com sucesso!`,
        ephemeral: true
      });
    }

    // Adicionar tratamento para os botões de paginação de canais de avaliação
    if (interaction.isButton() && 
        (interaction.customId === 'review_channel_more' || 
         interaction.customId === 'review_channel_reset')) {
      try {
        const channels = interaction.guild.channels.cache
          .filter(channel => channel.type === 0)
          .map(channel => ({
            label: channel.name,
            value: channel.id,
            description: `ID: ${channel.id}`
          }));

        const currentPage = interaction.customId === 'review_channel_more' 
          ? parseInt(interaction.message.components[0].components[0].placeholder.match(/Página (\d+)/)[1])
          : 0;

        const menuOptions = createReviewChannelMenu(channels, currentPage);
        await interaction.update(menuOptions);
        return;
      } catch (error) {
        console.error('Erro ao processar paginação de canais de avaliação:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar a paginação.',
          ephemeral: true
        });
        return;
      }
    }

    if (interaction.customId === 'select_buyer_role') {
      try {
        const roleId = interaction.values[0];
        const role = interaction.guild.roles.cache.get(roleId);
        
        // Salvar na configuração do servidor
        let guildConfig = await Config.findOne({ guildId: interaction.guild.id });
        if (!guildConfig) {
          guildConfig = new Config({ guildId: interaction.guild.id });
        }
        
        guildConfig.buyerRoleId = roleId;
        await guildConfig.save();

        await interaction.reply({
          content: `✅ Cargo para compradores definido como: **${role.name}**\nEste cargo será dado automaticamente aos usuários após finalizarem uma compra.`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Erro ao definir cargo para compradores:', error);
        await interaction.reply({
          content: '❌ Erro ao definir cargo para compradores.',
          ephemeral: true
        });
      }
    }

    if (interaction.customId === 'select_sales_category') {
      try {
        const categoryId = interaction.values[0];
        
        // Verificar se o usuário selecionou a opção de usar threads
        if (categoryId === 'use_threads') {
          // Buscar o ticket de forma segura
          let ticket = null;
          try {
            const messageReference = interaction.message?.reference;
            if (messageReference && messageReference.messageId) {
              const configMessage = await interaction.channel.messages.fetch(messageReference.messageId).catch(() => null);
              
              if (configMessage && configMessage.reference && configMessage.reference.messageId) {
                ticket = await Ticket.findOne({ messageId: configMessage.reference.messageId });
              }
            }
            
            // Se não conseguir encontrar pela referência, tenta pelo ID do usuário
            if (!ticket) {
              ticket = await Ticket.findOne({ userId: interaction.user.id });
            }
          } catch (error) {
            console.error('Erro ao buscar mensagem:', error);
            // Continua tentando encontrar o ticket pelo ID do usuário
            ticket = await Ticket.findOne({ userId: interaction.user.id });
          }

          if (!ticket) {
            return interaction.reply({
              content: '❌ Configuração não encontrada. Tente clicar no botão de configuração novamente.',
              ephemeral: true
            });
          }

          // Remover a categoria para voltar a usar threads
          ticket.categoryId = null;
          await ticket.save();

          return interaction.reply({
            content: `✅ Sistema configurado para usar Tópicos (Threads) novamente.`,
            ephemeral: true
          });
        }
        
        const category = interaction.guild.channels.cache.get(categoryId);
        
        if (!category) {
          return interaction.reply({
            content: '❌ Categoria não encontrada.',
            ephemeral: true
          });
        }

        // Buscar o ticket de forma segura
        let ticket = null;
        try {
          const messageReference = interaction.message?.reference;
          if (messageReference && messageReference.messageId) {
            const configMessage = await interaction.channel.messages.fetch(messageReference.messageId).catch(() => null);
            
            if (configMessage && configMessage.reference && configMessage.reference.messageId) {
              ticket = await Ticket.findOne({ messageId: configMessage.reference.messageId });
            }
          }
          
          // Se não conseguir encontrar pela referência, tenta pelo ID do usuário
          if (!ticket) {
            ticket = await Ticket.findOne({ userId: interaction.user.id });
          }
        } catch (error) {
          console.error('Erro ao buscar mensagem:', error);
          // Continua tentando encontrar o ticket pelo ID do usuário
          ticket = await Ticket.findOne({ userId: interaction.user.id });
        }

        if (!ticket) {
          return interaction.reply({
            content: '❌ Configuração não encontrada. Tente clicar no botão de configuração novamente.',
            ephemeral: true
          });
        }

        // Atualizar a categoria para vendas
        ticket.categoryId = categoryId;
        await ticket.save();

        await interaction.reply({
          content: `✅ Categoria para vendas definida como: ${category.name}`,
          ephemeral: true
        });

      } catch (error) {
        console.error('Erro ao configurar categoria para vendas:', error);
        await interaction.reply({
          content: '❌ Erro ao configurar categoria para vendas.',
          ephemeral: true
        });
      }
    }

    // Handler para seleção de estilo de avaliação
    if (interaction.customId === 'select_rating_style') {
      const selectedStyle = interaction.values[0];
      
      // Obter o ID da mensagem a partir dos metadados da interação ou do componente
      // Verificar se podemos obter a partir da mensagem da interação
      const messageId = interaction.message?.id;
      
      if (!messageId) {
        return interaction.reply({
          content: '❌ Não foi possível identificar a configuração. Tente novamente.',
          ephemeral: true
        });
      }
      
      const ticket = await Ticket.findOne({ messageId: messageId });
      
      if (!ticket) {
        return interaction.reply({
          content: '❌ Configuração não encontrada.',
          ephemeral: true
        });
      }
      
      // Atualizar o estilo de avaliação nas configurações
      if (!ticket.embedSettings) {
        ticket.embedSettings = {};
      }
      
      ticket.embedSettings.ratingStyle = selectedStyle;
      await ticket.save();
      
      // Pré-visualizar o estilo selecionado
      const { formatRating } = require('../utils/embedUtils');
      const previewRating = formatRating(5.0, 2, selectedStyle);
      
      await interaction.reply({
        content: `✅ Estilo de avaliação atualizado para: **${selectedStyle}**\n\nPré-visualização: ${previewRating}\n\nAs avaliações de produtos serão exibidas neste formato.`,
        ephemeral: true
      });
      
      return;
    }

    // Adicionar tratamento para os botões de paginação de categorias de vendas
    if (interaction.isButton() && 
        (interaction.customId === 'sales_category_more' || 
         interaction.customId === 'sales_category_reset')) {
      try {
        const categories = interaction.guild.channels.cache
          .filter(channel => channel.type === 4)
          .map(category => ({
            label: category.name.length > 25 ? category.name.substring(0, 22) + '...' : category.name,
            value: category.id,
            description: `ID: ${category.id}`
          }));

        // Adicionar opção para usar threads (tópicos)
        categories.unshift({
          label: '💬 Usar Tópicos (Threads)',
          value: 'use_threads',
          description: 'Voltar a usar tópicos ao invés de canais'
        });

        const currentPage = interaction.customId === 'sales_category_more' 
          ? parseInt(interaction.message.components[0].components[0].placeholder.match(/Página (\d+)/)[1])
          : 0;

        const menuOptions = createSalesCategoryMenu(categories, currentPage);
        await interaction.update(menuOptions);
        return;
      } catch (error) {
        console.error('Erro ao processar paginação de categorias de vendas:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar a paginação.',
          ephemeral: true
        });
        return;
      }
    }

    // Adicionar tratamento para os botões de paginação de cargos
    if (interaction.isButton() && 
        (interaction.customId === 'buyer_role_more' || 
         interaction.customId === 'buyer_role_reset')) {
      try {
        const botMember = interaction.guild.members.cache.get(interaction.client.user.id);
        if (!botMember) {
          return interaction.reply({
            content: '❌ Não foi possível encontrar o bot no servidor.',
            ephemeral: true
          });
        }

        const botHighestRole = botMember.roles.highest;
        
        const roles = interaction.guild.roles.cache
          .filter(role => 
            !role.managed && 
            role.id !== interaction.guild.id && 
            role.position < botHighestRole.position)
          .map(role => ({
            label: role.name,
            value: role.id,
            description: `ID: ${role.id}`
          }));

        const currentPage = interaction.customId === 'buyer_role_more' 
          ? parseInt(interaction.message.components[0].components[0].placeholder.match(/Página (\d+)/)[1])
          : 0;

        const menuOptions = createBuyerRoleMenu(roles, currentPage);
        await interaction.update(menuOptions);
        return;
      } catch (error) {
        console.error('Erro ao processar paginação de cargos:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar a paginação.',
          ephemeral: true
        });
        return;
      }
    }

    if (interaction.customId === 'select_review_channel') {
      const channelId = interaction.values[0];
      const channel = interaction.guild.channels.cache.get(channelId);

      try {
        // Buscar o ID da mensagem original através da cadeia de referências
        const messageReference = interaction.message?.reference;
        const configMessage = messageReference ? 
          await interaction.channel.messages.fetch(messageReference.messageId) : null;
        
        // O ID da mensagem original está na referência da mensagem de configuração
        const originalMessageId = configMessage?.reference?.messageId;
        
        // Buscar o ticket usando o ID da mensagem original
        const ticket = await Ticket.findOne({ messageId: originalMessageId });
        
        if (!ticket) {
          return interaction.reply({
            content: '❌ Não foi possível encontrar a configuração do ticket.',
            ephemeral: true
          });
        }

        ticket.reviewChannelId = channelId;
        await ticket.save();

        await interaction.reply({
          content: `✅ Canal de avaliações configurado com sucesso: ${channel}`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Erro ao configurar canal de avaliações:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao configurar o canal de avaliações.',
          ephemeral: true
        });
      }
      return;
    }
  }
};

// And update the updateEmbed function to properly handle interactions
async function updateEmbed(channel, ticket) {
  if (!channel || !ticket) {
    throw new Error('Canal ou ticket inválido');
  }

  try {
    const embed = createEmbed(ticket);
    const components = createComponents(ticket);

    // Try to find existing message
    let message;
    if (ticket.messageId) {
      try {
        message = await channel.messages.fetch(ticket.messageId);
      } catch (error) {
        console.log('Mensagem não encontrada, criando nova');
      }
    }

    if (message) {
      // Update existing message usando a função segura para preservar componentes
      await safeMessageEdit(message, embed, components);
    } else {
      // Create new message
      message = await createNewMessage(channel, embed, components, ticket);
    }

    return message;

  } catch (error) {
    console.error('Erro ao atualizar embed:', error);
    throw error;
  }
}

async function createNewMessage(channel, embed, components, ticket) {
  try {
    const message = await channel.send({
      embeds: [embed],
      components: components
    });

    // Update ticket with new message ID
    ticket.messageId = message.id;
    await ticket.save();

    return message;
  } catch (error) {
    console.error('Error creating new message:', error);
    throw new Error('Failed to create new message');
  }
}

// Helper functions to create embed and components
function createEmbed(ticket) {
  const embed = new EmbedBuilder()
    .setColor(ticket.embedSettings?.color || '#5865F2')
    .setTitle(ticket.embedSettings?.title || 'Sistema de Tickets')
    .setDescription(ticket.embedSettings?.description || 'Clique no botão abaixo para abrir um ticket.');

  if (ticket.embedSettings?.image) {
    embed.setImage(ticket.embedSettings.image);
  }

  return embed;
}

// Helper function to validate emoji
function isValidEmoji(emoji) {
  if (!emoji) return false;
  
  // Check for Unicode emoji
  const emojiRegex = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F680}-\u{1F6FF}\u{1F1F2}\u{1F1F4}]$/u;
  
  // Check for Discord custom emoji format (<:name:id> or <a:name:id>)
  const discordEmojiRegex = /^<a?:[a-zA-Z0-9_]+:\d+>$/;
  
  return emojiRegex.test(emoji) || discordEmojiRegex.test(emoji);
}

function createComponents(ticket) {
  const components = [];
  const mainRow = new ActionRowBuilder();

  if (ticket.embedSettings?.useMenu && Array.isArray(ticket.embedSettings?.menuOptions) && ticket.embedSettings.menuOptions.length > 0) {
    const menuOptions = ticket.embedSettings.menuOptions
      .filter(option => option && option.label)
      .map(option => {
        const formattedOption = {
          label: option.label || 'Opção',
          value: option.value || `option_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          description: option.description || undefined
        };

        // Only add emoji if it's valid
        if (option.emoji && isValidEmoji(option.emoji)) {
          formattedOption.emoji = option.emoji;
        }

        return formattedOption;
      });

    if (menuOptions.length > 0) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('create_ticket')
        .setPlaceholder(ticket.embedSettings.menuPlaceholder || 'Selecione uma opção')
        .addOptions(menuOptions);

      mainRow.addComponents(menu);
      components.push(mainRow);

      if (!ticket.buttonSettings?.hideConfig) {
        components.push(new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('config_ticket')
              .setLabel('⚙️')
              .setStyle(ButtonStyle.Secondary)
          ));
      }
    }
  } else {
    const createTicketButton = new ButtonBuilder()
      .setCustomId('create_ticket')
      .setLabel(ticket.buttonSettings?.label || 'Abrir Ticket')
      .setStyle(ButtonStyle[ticket.buttonSettings?.style] || ButtonStyle.Primary);

    if (ticket.buttonSettings?.emoji) {
      createTicketButton.setEmoji(ticket.buttonSettings.emoji);
    }

    mainRow.addComponents(createTicketButton);

    if (!ticket.buttonSettings?.hideConfig) {
      mainRow.addComponents(
        new ButtonBuilder()
          .setCustomId('config_ticket')
          .setLabel('⚙️')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    components.push(mainRow);
  }

  return components;
}

/**
 * Atualiza componentes de um tipo específico, mantendo os demais intactos
 * @param {Array} existingComponents - Componentes existentes na mensagem
 * @param {Array} targetComponents - Novos componentes para o tipo específico
 * @param {string} customId - ID personalizado do componente a ser atualizado
 * @returns {Array} - Array de componentes atualizado
 */
function updateComponentsSafely(existingComponents, targetComponents, customId) {
  if (!existingComponents || !Array.isArray(existingComponents) || existingComponents.length === 0) {
    return targetComponents;
  }
  
  if (!targetComponents || !Array.isArray(targetComponents) || targetComponents.length === 0) {
    return existingComponents;
  }

  // Criar um novo array para os componentes atualizados
  const updatedComponents = [];
  let targetComponentFound = false;
  
  // Para cada ActionRow existente
  for (const row of existingComponents) {
    // Verificar se esta linha contém o componente que queremos atualizar
    const hasTargetComponent = row.components.some(comp => comp.customId === customId);
    
    if (hasTargetComponent) {
      // Adicionar o novo componente no lugar
      targetComponentFound = true;
      updatedComponents.push(...targetComponents);
    } else {
      // Manter o componente original
      updatedComponents.push(row);
    }
  }
  
  // Se não encontramos o componente alvo, adicionar os novos ao final
  if (!targetComponentFound) {
    updatedComponents.push(...targetComponents);
  }
  
  return updatedComponents;
}

// Função auxiliar para criar botões de navegação
function createNavigationButtons(currentPage, totalPages) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder();

  // Botão para voltar ao início
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('review_channel_reset')
      .setLabel('↩️ Voltar ao Início')
      .setStyle(ButtonStyle.Secondary)
  );

  // Botão para carregar mais canais
  if (currentPage < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('review_channel_more')
        .setLabel('⏩ Carregar Mais')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return row;
}

// Função para criar o menu de canais com paginação
function createReviewChannelMenu(channels, page = 0) {
  const CHANNELS_PER_PAGE = 25;
  const totalPages = Math.ceil(channels.length / CHANNELS_PER_PAGE);
  const startIndex = page * CHANNELS_PER_PAGE;
  const endIndex = startIndex + CHANNELS_PER_PAGE;
  const currentChannels = channels.slice(startIndex, endIndex);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_review_channel')
    .setPlaceholder(`Selecione o canal de avaliações (Página ${page + 1}/${totalPages})`)
    .addOptions(currentChannels);

  const menuRow = new ActionRowBuilder().addComponents(menu);
  const navigationRow = createNavigationButtons(page, totalPages);

  return {
    content: `⭐ Selecione o canal onde as avaliações serão enviadas${channels.length > 25 ? ' (mostrando primeiros 25 canais)' : ''}:`,
    components: [menuRow, navigationRow],
    ephemeral: true
  };
}

// Função auxiliar para criar botões de navegação de categorias
function createCategoryNavigationButtons(currentPage, totalPages) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder();

  // Botão para voltar ao início
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('sales_category_reset')
      .setLabel('↩️ Voltar ao Início')
      .setStyle(ButtonStyle.Secondary)
  );

  // Botão para carregar mais categorias
  if (currentPage < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('sales_category_more')
        .setLabel('⏩ Carregar Mais')
        .setStyle(ButtonStyle.Primary)
    );
  }

  return row;
}

// Função para criar o menu de categorias com paginação
function createSalesCategoryMenu(categories, page = 0) {
  const CATEGORIES_PER_PAGE = 25;
  const totalPages = Math.ceil(categories.length / CATEGORIES_PER_PAGE);
  const startIndex = page * CATEGORIES_PER_PAGE;
  const endIndex = startIndex + CATEGORIES_PER_PAGE;
  const currentCategories = categories.slice(startIndex, endIndex);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_sales_category')
    .setPlaceholder(`Selecione a categoria para vendas (Página ${page + 1}/${totalPages})`)
    .addOptions(currentCategories);

  const menuRow = new ActionRowBuilder().addComponents(menu);
  const navigationRow = createCategoryNavigationButtons(page, totalPages);

  return {
    content: `📁 Selecione a categoria onde os canais de venda serão criados ou escolha "Usar Tópicos" para voltar ao modo padrão${categories.length > 25 ? ' (mostrando primeiras 25 categorias)' : ''}:`,
    components: [menuRow, navigationRow],
    ephemeral: true
  };
}

// Função auxiliar para criar botões de navegação de cargos
function createRoleNavigationButtons(currentPage, totalPages) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder();

  // Botão para voltar ao início
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('buyer_role_reset')
      .setLabel('↩️ Voltar ao Início')
      .setStyle(ButtonStyle.Secondary)
  );

  // Botão para carregar mais cargos
  if (currentPage < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('buyer_role_more')
        .setLabel('⏩ Carregar Mais')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return row;
}

// Função para criar o menu de cargos com paginação
function createBuyerRoleMenu(roles, page = 0) {
  const ROLES_PER_PAGE = 25;
  const totalPages = Math.ceil(roles.length / ROLES_PER_PAGE);
  const startIndex = page * ROLES_PER_PAGE;
  const endIndex = startIndex + ROLES_PER_PAGE;
  const currentRoles = roles.slice(startIndex, endIndex);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_buyer_role')
    .setPlaceholder(`Selecione o cargo para compradores (Página ${page + 1}/${totalPages})`)
    .addOptions(currentRoles);

  const menuRow = new ActionRowBuilder().addComponents(menu);
  const navigationRow = createRoleNavigationButtons(page, totalPages);

  return {
    content: `👤 Selecione o cargo que será dado aos compradores após a compra${roles.length > 25 ? ' (mostrando primeiros 25 cargos)' : ''}:\n\n⚠️ **IMPORTANTE:** Apenas cargos abaixo do bot na hierarquia do Discord são mostrados. Se o cargo desejado não aparecer, você precisará mover o cargo do bot para uma posição mais alta nas configurações do servidor.`,
    components: [menuRow, navigationRow],
    ephemeral: true
  };
}