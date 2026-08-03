module.exports = {
  name: 'restart',
  aliases: ['reboot'],
  description: 'Restart the bot (Owner only)',
  category: 'owner',
  ownerOnly: true,
  async execute({ sock, msg, from }) {
    await sock.sendMessage(from, { text: '🔄 Restarting bot... Please wait.' }, { quoted: msg });
    if (global.restartBot) {
      setTimeout(() => global.restartBot(), 1500);
    }
  },
};
