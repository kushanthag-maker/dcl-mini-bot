const config = require('../../config');
const moment = require('moment-timezone');
const { getAllCommands } = require('../../lib/commandHandler');

const MENU_LOGO = 'https://files.catbox.moe/4dvou4.png';

const CATEGORY_META = {
  owner:    { title: '𝗢𝗪𝗡𝗘𝗥',    emoji: '👑', order: 1 },
  group:    { title: '𝗚𝗥𝗢𝗨𝗣',    emoji: '👥', order: 2 },
  download: { title: '𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗', emoji: '📥', order: 3 },
  ai:       { title: '𝗔𝗜',       emoji: '🤖', order: 4 },
  utility:  { title: '𝗨𝗧𝗜𝗟𝗜𝗧𝗬',  emoji: '🛠️', order: 5 },
  fun:      { title: '𝗙𝗨𝗡',      emoji: '🎮', order: 6 },
};

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

function buildCategoryBlocks(prefix) {
  const all = getAllCommands();
  const byCat = {};

  for (const cmd of all) {
    const cat = cmd.category || 'utility';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(cmd);
  }

  const ordered = Object.keys(byCat).sort((a, b) => {
    const oa = (CATEGORY_META[a] && CATEGORY_META[a].order) || 99;
    const ob = (CATEGORY_META[b] && CATEGORY_META[b].order) || 99;
    return oa - ob;
  });

  let out = '';
  for (const cat of ordered) {
    const meta = CATEGORY_META[cat] || { title: cat.toUpperCase(), emoji: '📌' };
    const cmds = byCat[cat].sort((a, b) => a.name.localeCompare(b.name));

    out += `\n╭───「 ${meta.emoji} *${meta.title}* 」───╮\n│\n`;

    for (const cmd of cmds) {
      const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length
        ? `  _${cmd.aliases.slice(0, 3).join(', ')}_`
        : '';
      const pad = cmd.name.length < 10 ? ' '.repeat(10 - cmd.name.length) : ' ';
      out += `│  ▸ *${prefix}${cmd.name}*${pad}${aliases}\n`;
    }

    out += `│\n╰──────────────────────╯\n`;
  }
  return out;
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm', 'commands'],
  description: 'Show all available commands with banner',
  category: 'utility',
  async execute({ sock, msg, from }) {
    try {
      const prefix = config.prefix || '.';
      const botName = config.botName || 'ZAYRAX MINI';
      const runtime = formatUptime(process.uptime());
      const now = moment().tz(config.timezone || 'Asia/Colombo').format('YYYY-MM-DD  HH:mm');
      const userJid = msg.key.participant || msg.key.remoteJid || '';
      const user = String(userJid).split('@')[0].split(':')[0];
      const totalCmds = getAllCommands().length;

      const header = `
╭═══════════════╮
│  ⚡ *${botName}*
╰═══════════════╯

╭───「 📋 *𝗦𝗧𝗔𝗧𝗨𝗦* 」───╮
│
│  👤 *User*     ›  @${user}
│  🤖 *Bot*      ›  ${botName}
│  ⚙️ *Prefix*   ›  *${prefix}*
│  📦 *Commands* ›  *${totalCmds}*
│  ⏱ *Runtime*  ›  _${runtime}_
│  🕐 *Time*     ›  _${now}_
│  📶 *Status*   ›  Online ✅
│
╰──────────────────────╯
`.trim();

      const body = buildCategoryBlocks(prefix);

      const footer = `
╭───「 ℹ️ *𝗜𝗡𝗙𝗢* 」───╮
│
│  💡 Type *${prefix}menu* anytime
│  🔥 *ZAYRAX MINI* › _v1.0_
│  💜 Fast · Stable · Secure
│
╰──────────────────────╯
`.trim();

      const menuText = `${header}\n${body}\n${footer}`;

      await sock.sendMessage(
        from,
        {
          image: { url: MENU_LOGO },
          caption: menuText,
          mentions: [userJid],
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('Menu Error:', err.message);
      try {
        await sock.sendMessage(
          from,
          { text: '❌ Menu load වෙන්නේ නැහැ. ටිකකින් නැවත try කරන්න.' },
          { quoted: msg }
        );
      } catch (_) {}
    }
  },
};
