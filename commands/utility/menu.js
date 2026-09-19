const config = require('../../config');
const { getSettings } = require('../../lib/botSettings');
const moment = require('moment-timezone');
const { getAllCommands } = require('../../lib/commandHandler');

const MENU_VIDEO = 'https://files.catbox.moe/jz1qbc.mp4';
const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';
const DISPLAY_BOT_NAME = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const FOOTER_DEV = 'RED DEVIL AND ZAYRA DEV';

function getMenuLogo(sessionId) {
  try {
    const logo = getSettings(sessionId).logo || DEFAULT_LOGO;
    if (!logo || logo.includes('4dvou4.png') || logo.includes('bp9p86.png')) {
      return DEFAULT_LOGO;
    }
    return logo;
  } catch {
    return DEFAULT_LOGO;
  }
}

const CATEGORY_META = {
  download: { title: '𝐃ᴏᴡɴʟᴏᴀᴅ', emoji: '💎', order: 1 },
  media: { title: '𝐌ᴇᴅɪᴀ', emoji: '🌸', order: 2 },
  movie: { title: '𝐌ᴏᴠɪᴇ', emoji: '🌺', order: 3 },
  ai: { title: '𝐀ɪ', emoji: '💗', order: 4 },
  tools: { title: '𝐓ᴏᴏʟꜱ', emoji: '✨', order: 5 },
  utility: { title: '𝐆ᴇɴᴇʀᴀʟ', emoji: '💖', order: 6 },
  group: { title: '𝐆ʀᴏᴜᴘ', emoji: '🦋', order: 7 },
  owner: { title: '𝐀ᴅᴍɪɴ', emoji: '👑', order: 8 },
  fun: { title: '𝐅ᴜɴ', emoji: '🎀', order: 9 },
};

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}D ${h}H ${m}M`;
}

function greeting() {
  const h = moment().tz(config.timezone || 'Asia/Colombo').hour();
  if (h >= 5 && h < 12) return '🌞 𝐆𝐎𝐎𝐃 𝐌𝐎𝐑𝐍𝐈𝐍𝐆';
  if (h >= 12 && h < 17) return '🌤️ 𝐆𝐎𝐎𝐃 𝐀𝐅𝐓𝐄𝐑𝐍𝐎𝐎𝐍';
  if (h >= 17 && h < 21) return '🌆 𝐆𝐎𝐎𝐃 𝐄𝐕𝐄𝐍𝐈𝐍𝐆';
  return '🌙 𝐆𝐎𝐎𝐃 𝐍𝐈𝐆𝐇𝐓';
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
      emoji: '🌹',
    };
    const cmds = byCat[cat].sort((a, b) => a.name.localeCompare(b.name));

    out += `\n*╭──┉❰ ${meta.emoji} ${meta.title} ❱┉──•*\n`;
    for (const cmd of cmds) {
      out += `*│◊│* 🌸 \`\( {prefix} \){cmd.name}\`\n`;
    }
    out += `*│◊╰────────────┉•┉*\n*╰──────────────────┉*\n`;
  }
  return out;
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm', 'commands'],
  description: 'Show all available commands — girl rose style',
  category: 'utility',

  async execute({ sock, msg, from, sessionId }) {
    try {
      const prefix = config.prefix || '.';
      const sid = sessionId || null;
      const settings = getSettings(sid);
      const showName = DISPLAY_BOT_NAME;
      const runtime = formatUptime(process.uptime());
      const userJid = msg.key.participant || msg.key.remoteJid || '';
      const user = String(userJid).split('@')[0].split(':')[0];
      const totalCmds = getAllCommands().length;
      const logo = getMenuLogo(sid);
      const greet = greeting();
      const ram = ramUsage();
      const mentions = userJid ? [userJid] : [];

      // 1) Video note
      try {
        await sock.sendMessage(
          from,
          {
            video: { url: MENU_VIDEO },
            mimetype: 'video/mp4',
            ptv: true,
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

      // 2) Logo
      const shortCaption = `
*╭─┉❰ 💖 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝐐𝐔𝐄𝐄𝐍 💖 ❱┉─┉──•*
*│ 🌹 𝐇𝐄𝐋𝐋𝐎 : @${user}*
*│ ✨ ${greet}*
*╰┉────────────┉─•*

*🌸 ${showName} 🌸*
*💕 Your pretty menu is ready*`.trim();

      try {
        await sock.sendMessage(
          from,
          {
            image: { url: logo },
            caption: shortCaption,
            mentions,
          },
          { quoted: msg }
        );
      } catch (logoErr) {
        console.error('Menu logo fail:', logoErr.message);
        try {
          await sock.sendMessage(
            from,
            {
              image: { url: DEFAULT_LOGO },
              caption: shortCaption,
              mentions,
            },
            { quoted: msg }
          );
        } catch (_) {}
      }

      // 3) Full menu — emoji only design
      const menuText = `
*╭─┉❰ 🌸 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝐔𝐒𝐄𝐑 🌸 ❱┉─┉──•*
*│ 🌺 𝐇𝐄𝐋𝐋𝐎 : @${user}*
*╰┉────────────┉─•*

*❰🌟 𝐆𝐑𝐄𝐄𝐓𝐈𝐍𝐆 : ${greet} ❱*

*🌸🌹💖🌺🌸🌹💖🌺🌸*
*💗  ✨  𝐂𝐔𝐓𝐄 𝐌𝐄𝐍𝐔  ✨  💗*
*🌺💖🌹🌸🌺💖🌹🌸🌺*
*🎀  💕  𝐐𝐔𝐄𝐄𝐍 𝐕𝐈𝐁𝐄𝐒  💕  🎀*
*🌸🌹💖🌺🌸🌹💖🌺🌸*

*╭──┉❰ 👑 𝐒𝐘𝐒𝐓𝐄𝐌 𝐈𝐍𝐅𝐎 ❱┉──•*
*│◊│* ✦ 🤖 \`ʙᴏᴛ\` : ${showName}
*│◊│* ✦ 👑 \`ᴏᴡɴᴇʀ\` : ${FOOTER_DEV}
*│◊│* ✦ 💾 \`ʀᴀᴍ\` : ${ram}
*│◊│* ✦ ⏱️ \`ᴜᴘᴛɪᴍᴇ\` : ${runtime}
*│◊│* ✦ 📦 \`ᴄᴍᴅꜱ\` : ${totalCmds}
*│◊│* ✦ ⚙️ \`ᴘʀᴇғɪx\` : ${prefix}
*│◊│* ✦ 💗 \`ꜱᴛʏʟᴇ\` : 𝐆ɪʀʟ 𝐑ᴏ𝐬ᴇ
*│◊╰────────────┉•┉*
*╰──────────────────┉*
${buildCategoryBlocks(prefix)}
*╭━━〔 💬 𝐍𝐎𝐓𝐈𝐂𝐄 〕━━⬣*
*│◊│* 📌 Type a command with *${prefix}*
*│◊│* 🌸 Example: *\( {prefix}song* * \){prefix}tt* *${prefix}gpt*
*│◊│* 💕 Have a soft pretty day queen
*╰━━━━━━━━━━━━━━⬣*

_*🌟 𝐇𝐀𝐕𝐄 𝐀 𝐍𝐈𝐂𝐄 𝐃𝐀𝐘 🌺*_
_*✰┈ ${showName} ┈✰*_

> ${FOOTER_DEV}
> 🌹 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐎𝐅𝐂 🌹
`.trim();

      await sock.sendMessage(
        from,
        { text: menuText, mentions },
        { quoted: msg }
      );
    } catch (err) {
      console.error('Menu Error:', err.message);
      try {
        await sock.sendMessage(
          from,
          { text: '❌ Menu load වෙන්නේ නැහැ. ටිකකින් නැවත try කරන්න. 💕' },
          { quoted: msg }
        );
      } catch (_) {}
    }
  },
};
