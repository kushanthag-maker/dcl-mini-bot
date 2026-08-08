const { getAllCommands, getCommandsByCategory } = require('../../lib/commandHandler');
const config = require('../../config');
const moment = require('moment-timezone');
const os = require('os');

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm'],
  description: 'Show all available commands with banner',
  category: 'utility',
  async execute({ sock, msg, from }) {
    try {
      // Uptime
      const uptime = process.uptime();
      const d = Math.floor(uptime / 86400);
      const h = Math.floor((uptime % 86400) / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);
      const runtime = `${d}d ${h}h ${m}m ${s}s`;

      const now = moment().tz(config.timezone || 'Asia/Colombo').format('HH:mm:ss');
      const totalCmds = getAllCommands().length;

      const categories = {
        owner:    { title: '👑 𝗢𝗪𝗡𝗘𝗥',     emoji: '👑' },
        group:    { title: '👥 𝗚𝗥𝗢𝗨𝗣',     emoji: '👥' },
        download: { title: '📥 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗', emoji: '📥' },
        ai:       { title: '🤖 𝗔𝗜',         emoji: '🤖' },
        utility:  { title: '🛠️ 𝗨𝗧𝗜𝗟𝗜𝗧𝗬',   emoji: '🛠️' },
        fun:      { title: '🎮 𝗙𝗨𝗡',        emoji: '🎮' },
      };

      let menuText = `
╭───「 ⚡ *${config.botName}* 」───╮
│
│  👤 *User*     ›  @${(msg.key.participant || msg.key.remoteJid || '').split('@')[0]}
│  🤖 *Bot*      ›  ${config.botName}
│  ⚙️ *Prefix*   ›  ${config.prefix}
│  📚 *Commands* ›  ${totalCmds}
│  ⏱ *Runtime*  ›  ${runtime}
│  🕐 *Time*     ›  ${now}
│  📶 *Status*   ›  Online ✅
│
╰──────────────────────╯
`.trim();

      // Add each category
      for (const [cat, meta] of Object.entries(categories)) {
        const cmds = getCommandsByCategory(cat);
        if (!cmds.length) continue;

        menuText += `\n\n╭───「 ${meta.title} 」───╮\n│\n`;

        cmds.forEach((cmd) => {
          const aliases = cmd.aliases?.length
            ? ` (${cmd.aliases.slice(0, 2).join(', ')})`
            : '';
          menuText += `│  ▸ \( {config.prefix} \){cmd.name}${aliases}\n`;
        });

        menuText += `│\n╰──────────────────────╯`;
      }

      menuText += `\n\n╭───「 ℹ️ *INFO* 」───╮
│
│  💡 Type *${config.prefix}help <cmd>*
│     for command details
│
│  🔥 *DCL MINI* › v1.0
│  🖤 Dark Cyber Lidarz
│
╰──────────────────────╯`;

      // Banner image
      const banner = 'https://files.catbox.moe/xvos88.png';

      await sock.sendMessage(
        from,
        {
          image: { url: banner },
          caption: menuText,
          mentions: [msg.key.participant || msg.key.remoteJid],
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('Menu Error:', err.message);
      await sock.sendMessage(from, {
        text: '❌ Menu load වෙන්නේ නැහැ. නැවත try කරන්න.',
      }, { quoted: msg });
    }
  },
};
