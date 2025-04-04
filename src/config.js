module.exports = {
    token: process.env.DISCORD_TOKEN || 'your_token_here', // Substitua pelo seu token do Discord
    mongoURI: process.env.MONGO_URI || 'mongodb://localhost:27017/your_database_name', // Substitua pela url de conexão do seu MongoDB
    ownerId: 'your_id_here', // Substitua pelo ID do dono do bot
};