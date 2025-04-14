const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('limpar-dm')
        .setDescription('Limpa todas as mensagens enviadas pelo bot nas DMs do usuário que usou o comando.'),

    async execute(interaction) {
        const user = interaction.user;

        try {
            // Criar um canal de DM com o usuário
            const dmChannel = await user.createDM();

            // Mensagem de aviso pública no servidor
            await interaction.reply({
                content: `**⚠️ | ${user}, estou limpando minhas mensagens antigas na sua DM. Aguarde um momento...**`,
                ephemeral: true
            });

            // Mensagem privada de aviso antes da limpeza
            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ffcc00')
                        .setTitle('Aviso de Limpeza')
                        .setDescription(`**⚠️ | Olá ${user.username}, estou apagando todas as mensagens enviadas por mim (bot) na sua DM.**\n\nIsso ajudará a manter sua DM mais organizada. Suas mensagens **não** serão afetadas, apenas as mensagens que eu enviei.\n\nAguarde enquanto o processo acontece!`)
                ],
                ephemeral: true
            });

            // Buscar as últimas 100 mensagens
            const messages = await dmChannel.messages.fetch({ limit: 100 });

            // Filtrar apenas as mensagens do bot
            const botMessages = messages.filter(msg => msg.author.id === interaction.client.user.id);

            if (botMessages.size === 0) {
                return interaction.followUp({
                    content: `**❌ | Não há mensagens minhas na sua DM para apagar.**`,
                    ephemeral: false,
                });
            }

            // Apagar todas as mensagens do bot
            for (const message of botMessages.values()) {
                await message.delete();
            }

            // Confirmação pública no servidor
            interaction.followUp({
                content: `**✅ | Todas as minhas mensagens na DM de ${user} foram apagadas!**`,
                ephemeral: false
            });

        } catch (error) {
            console.error('Erro ao tentar limpar as DMs do usuário:', error);

            interaction.followUp({
                content: `**❌ | Não consegui acessar sua DM, verifique se você tem mensagens diretas ativadas.**`,
                ephemeral: false,
            });
        }
    }
}; 