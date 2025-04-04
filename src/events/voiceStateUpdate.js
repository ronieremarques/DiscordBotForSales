const Config = require("../models/Config")

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
      // Verifica se foi o bot que saiu do canal
      if (oldState.member.id === oldState.client.user.id && !newState.channelId) {
        const config = await Config.findOne({ guildId: oldState.guild.id });
        if (config) {
          config.voiceChannel = null;
          await config.save();
        }
      }
    }
  };