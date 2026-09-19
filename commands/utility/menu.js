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
  return d + 'D ' + h + 'H ' + m + 'M';
}

function greeting() {
  const h = moment().tz(config.timezone || 'Asia/Colombo').hour();
  if (h >= 5 && h < 12) return '🌞 Good Morning';
  if (h >= 12 && h < 17) return '🌤️ Good Afternoon';
  if (h >= 17 && h < 21) return '🌆 Good Evening';
  return '🌙 Good Night';
}

function ramUsage() {
  const used = process.memoryUsage().rss;
  return (used / 1024 / 1024).toFixed(2) + ' MB';
}

function buildCategoryBlocks(prefix) {
  const all = getAllCommands() || [];
  const byCat = {};
  const pfx = String(prefix || '.');

  for (const cmd of all) {
    if (!cmd || !cmd.name) continue;
    const cat = String(cmd.category || 'utility').toLowerCase();
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(cmd);
  }

  const ordered = Object.keys(byCat).sort(function (a, b) {
    const oa = (CATEGORY_META[a] && CATEGORY_META[a].order) || 99;
    const ob = (CATEGORY_META[b] && CATEGORY_META[b].order) || 99;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });

  let out = '';
  for (let i = 0; i < ordered.length; i++) {
    const cat = ordered[i];
    const meta = CATEGORY_META[cat] || {
      title: cat.toUpperCase(),
      emoji: '🌹',
    };
    const cmds = byCat[cat].slice().sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });

    out += '\n*╭──┉❰ ' + meta.emoji + ' ' + meta.title + ' ❱┉──•*\n';
    for (let j = 0; j < cmds.length; j++) {
      const name = String(cmds[j].name || '').trim();
      if (!name) continue;
      out += '*│◊│* ✦ `' + pfx + name + '`\n';
    }
    out += '*│◊╰────────────┉•┉*\n*╰──────────────────┉*\n';
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
      const showName = DISPLAY_BOT_NAME;
      const runtime = formatUptime(process.uptime());
      const userJid = msg.key.participant || msg.key.remoteJid || '';
      const user = String(userJid).split('@')[0].split(':')[0];
      const totalCmds = (getAllCommands() || []).length;
      const logo = getMenuLogo(sid);
      const greet = greeting();
      const ram = ramUsage();
      const mentions = userJid ? [userJid] : [];

      // 1) Video note only (optional intro)
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

      // 2) ONE message: logo image + FULL menu as caption when short,
      //    otherwise logo small + single full text (no mid "welcome" split card)
      const menuBody =
        '*╭─┉❰ 💖 ʜɪɪ ϙᴜᴇᴇɴ 💖 ❱┉─┉──•*\n' +
        '*│ 🌹 ʜᴇʟʟᴏ : @' +
        user +
        '*\n' +
        '*╰┉────────────┉─•*\n\n' +
        '*❰🌟 ' +
        greet +
        ' ❱*\n\n' +
        '*🌸🌹💖🌺🌸🌹💖🌺🌸*\n' +
        '*💗  ✨  ᴄᴜᴛᴇ ᴍᴇɴᴜ  ✨  💗*\n' +
        '*🌺💖🌹🌸🌺💖🌹🌸🌺*\n' +
        '*🎀  💕  ǫᴜᴇᴇɴ ᴠɪʙᴇs  💕  🎀*\n' +
        '*🌸🌹💖🌺🌸🌹💖🌺🌸*\n\n' +
        '*╭──┉❰ 👑 ꜱʏꜱᴛᴇᴍ ɪɴꜰᴏ ❱┉──•*\n' +
        '*│◊│* ✦ 🤖 `ʙᴏᴛ` : ' +
        showName +
        '\n' +
        '*│◊│* ✦ 👑 `ᴏᴡɴᴇʀ` : ' +
        FOOTER_DEV +
        '\n' +
        '*│◊│* ✦ 💾 `ʀᴀᴍ` : ' +
        ram +
        '\n' +
        '*│◊│* ✦ ⏱️ `ᴜᴘᴛɪᴍᴇ` : ' +
        runtime +
        '\n' +
        '*│◊│* ✦ 📦 `ᴄᴍᴅꜱ` : ' +
        totalCmds +
        '\n' +
        '*│◊│* ✦ ⚙️ `ᴘʀᴇғɪx` : ' +
        prefix +
        '\n' +
        '*│◊│* ✦ 💗 `ꜱᴛʏʟᴇ` : ɢɪʀʟ ʀᴏꜱᴇ\n' +
        '*│◊╰────────────┉•┉*\n' +
        '*╰──────────────────┉*\n' +
        buildCategoryBlocks(prefix) +
        '*╭━━〔 💬 ɴᴏᴛɪᴄᴇ 〕━━⬣*\n' +
        '*│◊│* 📌 Type a command with *' +
        prefix +
        '*\n' +
        '*│◊│* 🌸 Example: *' +
        prefix +
        'song* *' +
        prefix +
        'tt* *' +
        prefix +
        'gpt*\n' +
        '*│◊│* 💕 Have a soft pretty day queen\n' +
        '*╰━━━━━━━━━━━━━━⬣*\n\n' +
        '_*🌟 ʜᴀᴠᴇ ᴀ ɴɪᴄᴇ ᴅᴀʏ 🌺*_\n' +
        '_*✰┈ ' +
        showName +
        ' ┈✰*_\n\n' +
        '> ' +
        FOOTER_DEV +
        '\n> 🌹 ᴅᴀʀᴋ ǫᴜᴇᴇɴ ᴏꜰᴄ 🌹';

      // Prefer single image+caption if fits (~1024), else single text only (no 2nd split card)
      if (menuBody.length <= 1000) {
        try {
          await sock.sendMessage(
            from,
            {
              image: { url: logo },
              caption: menuBody,
              mentions: mentions,
            },
            { quoted: msg }
          );
          return;
        } catch (e) {
          console.error('Menu image+caption fail:', e.message);
        }
      }

      // Long menu: one image (tiny caption) is skipped — ONLY one full text message
      // so it does not look like "menu split in two"
      try {
        await sock.sendMessage(
          from,
          {
            image: { url: logo },
            caption:
              '*💖 ' +
              showName +
              '*\n*🌹 @' +
              user +
              '* · ' +
              greet,
            mentions: mentions,
          },
          { quoted: msg }
        );
      } catch (_) {}

      await sock.sendMessage(
        from,
        { text: menuBody, mentions: mentions },
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
