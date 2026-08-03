const config = require('../../config');
const moment = require('moment-timezone');

module.exports = {
  name: 'alive',
  aliases: ['bot'],
  description: 'Check if bot is alive',
  category: 'utility',
  async execute({ sock, msg, from }) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = Math.floor(uptime % 60);

    const text = `
🤖 *${config.botName}* is Alive!

✅ Status: Online
⏱ Uptime: ${hours}h ${mins}m ${secs}s
📅 ${moment().tz(config.timezone).format('YYYY-MM-DD HH:mm:ss')}
🌐 Multi-Device + MongoDB Session

_Powered by Baileys_
    `.trim();

    await sock.sendMessage(from, { text }, { quoted: msg });
  },
};
