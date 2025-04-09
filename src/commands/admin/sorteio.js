const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Sale = require('../../models/Sale');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sorteio')
        .setDescription('Inicia um sorteio no servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('premio')
                .setDescription('O que será sorteado')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duracao')
                .setDescription('Duração do sorteio em minutos')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10080)) // Máximo de 7 dias
        .addBooleanOption(option =>
            option.setName('apenas_clientes')
                .setDescription('Apenas clientes podem participar?')
                .setRequired(true)),

    async execute(interaction) {
        const premio = interaction.options.getString('premio');
        const duracao = interaction.options.getInteger('duracao');
        const apenasClientes = interaction.options.getBoolean('apenas_clientes');

        const participantes = new Map(); // Usando Map para armazenar participantes e seus nomes
        
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🎉 Novo Sorteio!')
            .setDescription(`**Prêmio:** ${premio}\n**Duração:** ${duracao} minutos\n${apenasClientes ? '**Apenas para clientes!**' : 'Aberto para todos!'}\n\n**Como participar?**\nClique no botão abaixo para entrar no sorteio!\n\n**Participantes (0):**\nNenhum participante ainda`)
            .setFooter({ text: `Sorteio iniciado por ${interaction.user.tag}` })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('entrar_sorteio')
                    .setLabel('🎉 Participar')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('sair_sorteio')
                    .setLabel('❌ Sair do Sorteio')
                    .setStyle(ButtonStyle.Danger)
            );

        const message = await interaction.reply({ 
            embeds: [embed], 
            components: [row],
            fetchReply: true 
        });

        // Função para atualizar o embed com a lista de participantes
        const atualizarEmbed = async () => {
            let participantesLista = '';
            if (participantes.size === 0) {
                participantesLista = 'Nenhum participante ainda';
            } else {
                participantesLista = Array.from(participantes.values())
                    .map((nome, index) => `${index + 1}. ${nome}`)
                    .join('\n');
            }

            const embedAtualizado = EmbedBuilder.from(message.embeds[0])
                .setDescription(`**Prêmio:** ${premio}\n**Duração:** ${duracao} minutos\n${apenasClientes ? '**Apenas para clientes!**' : 'Aberto para todos!'}\n\n**Como participar?**\nClique no botão abaixo para entrar no sorteio!\n\n**Participantes (${participantes.size}):**\n${participantesLista}`);

            await message.edit({ embeds: [embedAtualizado] });
        };

        // Coletor de interações dos botões
        const collector = message.createMessageComponentCollector({ 
            time: duracao * 60000 
        });

        collector.on('collect', async (i) => {
            try {
                if (!i.isButton()) return;

                if (i.customId === 'entrar_sorteio') {
                    if (participantes.has(i.user.id)) {
                        await i.reply({ 
                            content: '❌ Você já está participando do sorteio!', 
                            ephemeral: true 
                        });
                        return;
                    }

                    if (apenasClientes) {
                        const compras = await Sale.findOne({ userId: i.user.id });
                        if (!compras) {
                            await i.reply({ 
                                content: '❌ Desculpe, mas este sorteio é apenas para clientes que já realizaram compras!', 
                                ephemeral: true 
                            });
                            return;
                        }
                    }

                    participantes.set(i.user.id, i.user.tag);
                    await atualizarEmbed();
                    await i.reply({ 
                        content: `✅ Você entrou no sorteio do item **${premio}** com sucesso! Boa sorte!`, 
                        ephemeral: true 
                    });

                } else if (i.customId === 'sair_sorteio') {
                    if (!participantes.has(i.user.id)) {
                        await i.reply({ 
                            content: '❌ Você não está participando do sorteio!', 
                            ephemeral: true 
                        });
                        return;
                    }

                    participantes.delete(i.user.id);
                    await atualizarEmbed();
                    await i.reply({ 
                        content: '✅ Você saiu do sorteio com sucesso!', 
                        ephemeral: true 
                    });
                }
            } catch (error) {
                console.error('Erro ao processar interação:', error);
                await i.reply({ 
                    content: '❌ Ocorreu um erro ao processar sua solicitação. Tente novamente.', 
                    ephemeral: true 
                });
            }
        });

        collector.on('end', async () => {
            // Desabilita os botões
            row.components.forEach(button => button.setDisabled(true));
            
            if (participantes.size === 0) {
                const embedFinal = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Sorteio Encerrado!')
                    .setDescription('Ninguém participou do sorteio 😢')
                    .setTimestamp();

                await message.edit({ 
                    embeds: [embedFinal], 
                    components: [row] 
                });
                return;
            }

            const arrayParticipantes = Array.from(participantes.keys());
            const vencedorId = arrayParticipantes[Math.floor(Math.random() * arrayParticipantes.length)];
            const vencedorTag = participantes.get(vencedorId);

            const embedFinal = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎉 Sorteio Encerrado!')
                .setDescription(`**Prêmio:** ${premio}\n**Vencedor:** ${vencedorTag} (<@${vencedorId}>)\n\nParabéns! 🎊\n\n**Total de participantes:** ${participantes.size}`)
                .setTimestamp();

            await message.edit({ 
                embeds: [embedFinal], 
                components: [row] 
            });
            
            await interaction.channel.send(`🎉 Parabéns <@${vencedorId}>! Você ganhou: **${premio}**!`);
            
            try {
                const vencedorObj = await interaction.guild.members.fetch(vencedorId);
                await vencedorObj.send(`🎉 Parabéns! Você ganhou o sorteio do item **${premio}**! Entre em contato com a administração para receber seu prêmio.`);
            } catch (err) {
                console.error('Não foi possível enviar mensagem privada ao vencedor:', err);
            }
        });
    },
}; 