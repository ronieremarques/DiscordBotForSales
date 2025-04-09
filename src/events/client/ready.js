module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`Bot logado como ${client.user.tag}`);

        // Definir status do bot
        client.user.setPresence({
            activities: [{ name: 'Vendas Automáticas', type: 'WATCHING' }],
            status: 'online',
        });
    },
};