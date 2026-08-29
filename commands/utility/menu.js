const os = require('os');
const config = require('../../config');
const { getSettings } = require('../../lib/botSettings');
const moment = require('moment-timezone');
const { getAllCommands } = require('../../lib/commandHandler');

const MENU_VIDEO = 'https://files.catbox.moe/jz1qbc.mp4';
const DEFAULT_LOGO = 'https://files.catbox.moe/bp9p86.png';
const DISPLAY_BOT_NAME = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const FOOTER_DEV = 'RED DEVIL AND ZAYRA DEV';

function getMenuLogo(sessionId) {
  try {
    const logo = getSettings(sessionId).logo || DEFAULT_LOGO;
    // ignore legacy default logo
    if (!logo || logo.includes('4dvou4.png')) return DEFAULT_LOGO;
    return logo;
  } catch {
    return DEFAULT_LOGO;
  }
}

const CATEGORY_META = {
  download: { title: '𝐃ᴏᴡɴʟᴏᴀᴅ', emoji: '💎', order: 1 },
  media: { title: '𝐌ᴇᴅɪᴀ', emoji: '🌸', order: 2 },
  ai: { title: '𝐀ɪ', emoji: '🤖', order: 3 },
  tools: { title: '𝐓ᴏᴏʟꜱ', emoji: '🛠️', order: 4 },
  utility: { title: '𝐆ᴇɴᴇʀᴀʟ', emoji: '💖', order: 5 },
  group: { title: '𝐆ʀᴏᴜᴘ', emoji: '🦋', order: 6 },
  owner: { title: '𝐀ᴅᴍɪɴ', emoji: '👑', order: 7 },
  fun: { title: '𝐅ᴜɴ', emoji: '🌟', order: 8 },
  movie: { title: '𝐌ᴏᴠɪᴇ', emoji: '🌺', order: 9 },
};

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}D ${h}H ${m}M`;
}

function greeting() {
  const h = moment().tz(config.timezone || 'Asia/Colombo').hour();
  if (h >= 5 && h < 12) return '🌞 GOOD MORNING';
  if (h >= 12 && h < 17) return '🌞 GOOD AFTERNOON';
  if (h >= 17 && h < 21) return '🌆 GOOD EVENING';
  return '🌙 GOOD NIGHT';
}

function ramUsage() {
  const used = process.memoryUsage().rss;
  return (used / 1024 / 1024).toFixed(2) + ' MB';
}

function buildCategoryBlocks(prefix) {
  const all = getAllCommands();
  const byCat = {};

  for (const cmd of all) {
    let cat = (cmd.category || 'utility').toLowerCase();
    if (cat === 'tools') cat = 'tools';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(cmd);
  }

  const ordered = Object.keys(byCat).sort((a, b) => {
    const oa = (CATEGORY_META[a] && CATEGORY_META[a].order) || 99;
    const ob = (CATEGORY_META[b] && CATEGORY_META[b].order) || 99;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });

  let out = '';
  for (const cat of ordered) {
    const meta = CATEGORY_META[cat] || {
      title: cat.toUpperCase(),
      emoji: '📌',
    };
    const cmds = byCat[cat].sort((a, b) => a.name.localeCompare(b.name));

    out += `\n*╭──┉❰ ${meta.emoji} ${meta.title} ❱┉──•*\n`;
    for (const cmd of cmds) {
      out += `*│◊│* ✦ \`${prefix}${cmd.name}\`\n`;
    }
    out += `*│◊╰────────────┉•┉*\n*╰──────────────────┉*\n`;
  }
  return out;
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm', 'commands'],
  description: 'Show all available commands with banner',
  category: 'utility',

  async execute({ sock, msg, from, sessionId }) {
    try {
      const prefix = config.prefix || '.';
      const sid = sessionId || null;
      const settings = getSettings(sid);
      const botName =
        settings.botName || config.botName || DISPLAY_BOT_NAME;
      const showName = DISPLAY_BOT_NAME;
      const runtime = formatUptime(process.uptime());
      const userJid = msg.key.participant || msg.key.remoteJid || '';
      const user = String(userJid).split('@')[0].split(':')[0];
      const totalCmds = getAllCommands().length;
      const logo = getMenuLogo(sid);
      const greet = greeting();
      const ram = ramUsage();

      // 1) Video note first (circular video if supported)
      try {
        await sock.sendMessage(
          from,
          {
            video: { url: MENU_VIDEO },
            mimetype: 'video/mp4',
            ptv: true, // video note
          },
          { quoted: msg }
        );
      } catch (e1) {
        console.error('Menu video note fail:', e1.message);
        try {
          await sock.sendMessage(
            from,
            {
              video: { url: MENU_VIDEO },
              mimetype: 'video/mp4',
              gifPlayback: true,
            },
            { quoted: msg }
          );
        } catch (e2) {
          console.error('Menu video fail:', e2.message);
        }
      }

      // 2) Fancy menu caption + logo
      const menuText = `
*╭─┉❰ 🌸 𝐖𝙴𝙻𝙲𝙾𝙼𝙴 𝐔𝚂𝙴𝚁 🌸 ❱┉─┉──•*
*│ 🌺 𝐇𝙴𝙻𝙻𝙾 : @${user}*
*╰┉────────────┉─•*

*❰🌟 𝐆ʀᴇᴇᴛɪɴɢ : ${greet} ❱*

┆  •    ┆    °  ┆  •°    ┆✦ ˟˞ˁ㋞˟˖˟ˣˣ🌸
┆     ° ┆  +   ┆     ×🌟˖˟ˠ˟ͣͥͬ🌺
┆  •ʹ  °┆      💖 ◊ʅ⃛⃰˃˪෴˥
┆        🌺°•°✦┋
🌸.°•°°🌟┇
_*🌟✦•°🌸↝❰💖✦•°🌺↝🤭*_

*╭──┉❰ 👑 𝐒𝐘𝐒𝐓𝐄𝐌 𝐈𝐍𝐅𝐎 ❱┉──•*
*│◊│* ✦ 🤖 \`ʙᴏᴛ\` : ${showName}
*│◊│* ✦ 👑 \`ᴏᴡɴᴇʀ\` : ${FOOTER_DEV}
*│◊│* ✦ 💾 \`ʀᴀᴍ\` : ${ram}
*│◊│* ✦ ⏱️ \`ᴜᴘᴛɪᴍᴇ\` : ${runtime}
*│◊│* ✦ 📦 \`ᴄᴍᴅꜱ\` : ${totalCmds}
*│◊│* ✦ ⚙️ \`ᴘʀᴇғɪx\` : ${prefix}
*│◊╰────────────┉•┉*
*╰──────────────────┉*
${buildCategoryBlocks(prefix)}
*╭━━〔 💬 𝐍𝐎𝐓𝐈𝐂𝐄 〕━━⬣*
*│◊│* 📌 Type a command with prefix *${prefix}*
*│◊│* 🌸 Example: *${prefix}song* *${prefix}tt* *${prefix}gpt*
*╰━━━━━━━━━━━━━━⬣*

_*🌟 𝐇𝐀𝐕𝐄 𝐀 𝐍𝐈𝐂𝐄 𝐃𝐀𝐘 🌺*_
_*✰┈ ${showName} ┈✰*_

> ${FOOTER_DEV}
`.trim();

      // One message only — never split menu into parts
      // Image caption max ~1024; if longer send as single text (full UI kept)
      const mentions = userJid ? [userJid] : [];
      if (menuText.length <= 1024) {
        await sock.sendMessage(
          from,
          { image: { url: logo }, caption: menuText, mentions },
          { quoted: msg }
        );
      } else {
        // Single text message with full menu (no 2nd part)
        await sock.sendMessage(
          from,
          { text: menuText, mentions },
          { quoted: msg }
        );
      }
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
