module.exports = {
  name: 'shutdown',
  aliases: ['stop'],
  description: 'Shutdown the bot (Owner only)',
  category: 'owner',
  ownerOnly: true,
  async execute({ sock, msg, from }) {
    await sock.sendMessage(from, { text: '🛑 Shutting down... Bye!' }, { quoted: msg });
    if (global.shutdownBot) {
      setTimeout(() => global.shutdownBot(), 1500);
    }
  },
};
