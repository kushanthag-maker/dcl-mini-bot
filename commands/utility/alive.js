const config = require('../../config');
const moment = require('moment-timezone');
const os = require('os');

const ALIVE_LOGO = 'https://files.catbox.moe/4dvou4.png';

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatBytes(bytes) {
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

module.exports = {
  name: 'alive',
  aliases: ['bot', 'online', 'status'],
  description: 'Check if bot is alive with system status',
  category: 'utility',

  async execute({ sock, msg, from }) {
    try {
      const botName = config.botName || 'ZAYRAX MINI';
      const prefix = config.prefix || '.';
      const runtime = formatUptime(process.uptime());
      const now = moment()
        .tz(config.timezone || 'Asia/Colombo')
        .format('YYYY-MM-DD  HH:mm:ss');

      const mem = process.memoryUsage();
      const usedMem = formatBytes(mem.heapUsed);
      const totalMem = formatBytes(os.totalmem());
      const freeMem = formatBytes(os.freemem());
      const platform = `${os.type()} ${os.arch()}`;
      const nodeVer = process.version;

      const userJid = msg.key.participant || msg.key.remoteJid || '';
      const user = String(userJid).split('@')[0].split(':')[0];

      const caption = `
╭═══════════════╮
│  ⚡ *${botName}*
╰═══════════════╯

╭───「 ✅ *𝗔𝗟𝗜𝗩𝗘* 」───╮
│
│  👤 *User*      ›  @${user}
│  🤖 *Bot*       ›  ${botName}
│  ⚙️ *Prefix*    ›  *${prefix}*
│  📶 *Status*    ›  Online ✅
│  ⏱ *Runtime*   ›  _${runtime}_
│  🕐 *Time*      ›  _${now}_
│
╰──────────────────────╯

╭───「 💻 *𝗦𝗬𝗦𝗧𝗘𝗠* 」───╮
│
│  🧠 *RAM*       ›  ${usedMem}
│  💾 *Free*      ›  ${freeMem}
│  🖥️ *OS*        ›  ${platform}
│  🟢 *Node*      ›  ${nodeVer}
│
╰──────────────────────╯

╭───「 ℹ️ *𝗜𝗡𝗙𝗢* 」───╮
│
│  💡 Type *${prefix}menu* for commands
│  💜 Fast · Stable · Secure
│  🔥 *ZAYRAX MINI* › _v1.0_
│
╰──────────────────────╯
`.trim();

      await sock.sendMessage(
        from,
        {
          image: { url: ALIVE_LOGO },
          caption,
          mentions: [userJid],
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('Alive Error:', err.message);
      // Fallback text-only
      const runtime = formatUptime(process.uptime());
      await sock.sendMessage(
        from,
        {
          text: `✅ *${config.botName || 'Bot'}* is Online!\n⏱ Runtime: ${runtime}`,
        },
        { quoted: msg }
      );
    }
  },
};
