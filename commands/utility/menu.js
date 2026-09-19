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
  if (h < 5) return '💗 Early Morning';
  if (h < 12) return '🌸 Good Morning';
  if (h < 18) return '🌤️ Good Afternoon';
  if (h < 22) return '🌙 Good Evening';
  return '🌌 Sweet Dreams';
}

function ramUsage() {
  return (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB';
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

    out += '\n╭─❖ ' + meta.emoji + ' ' + meta.title + ' ❖─╮\n│\n';
    for (let j = 0; j < cmds.length; j++) {
      const name = String(cmds[j].name || '').trim();
      if (!name) continue;
      out += '│  🔹 `' + pfx + name + '`\n';
    }
    out += '│\n╰─────────────────╯\n';
  }
  return out;
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm', 'commands'],
  description: 'Show menu — DCT-style UI + video note',
  category: 'utility',

  async execute({ sock, msg, from, sessionId }) {
    try {
      // react
      try {
        await sock.sendMessage(from, {
          react: { text: '🫧', key: msg.key },
        });
      } catch (_) {}

      const prefix = config.prefix || '.';
      const sid = sessionId || null;
      const settings = (() => {
        try {
          return getSettings(sid) || {};
        } catch {
          return {};
        }
      })();

      const showName =
        settings.botName || config.botName || DISPLAY_BOT_NAME;
      const runtime = formatUptime(process.uptime());
      const userJid = msg.key.participant || msg.key.remoteJid || '';
      const user = String(userJid).split('@')[0].split(':')[0];
      const userTag = '@' + user;
      const totalCmds = (getAllCommands() || []).length;
      const logo = getMenuLogo(sid);
      const greet = greeting();
      const ram = ramUsage();
      const mentions = userJid ? [userJid] : [];

      const slNow = moment().tz(config.timezone || 'Asia/Colombo');
      const timeStr = slNow.format('hh:mm A');
      const dateStr = slNow.format('MMM DD, YYYY');

      const quotes = [
        'DARK QUEEN OFC 💗',
        'ZAYRA DEV ✨',
        'RED DEVIL 🔥',
        'QUEEN VIBES 🌹',
        'SOFT POWER 🌸',
        'GIRL ROSE STYLE 💕',
      ];
      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

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

      // 2) Logo (optional short)
      try {
        await sock.sendMessage(
          from,
          {
            image: { url: logo },
            caption: '🌸 *' + DISPLAY_BOT_NAME + '*\n' + greet,
            mentions: mentions,
          },
          { quoted: msg }
        );
      } catch (_) {}

      // 3) Main UI (your design style)
      const menuText = (
        '╭━━━━━━━━━━━━━━━━━━━━━━╮\n' +
        '┃   🌸 ' +
        DISPLAY_BOT_NAME +
        ' 🌸   ┃\n' +
        '┃      𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍      ┃\n' +
        '╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n' +
        '        ✨ 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 ✨\n\n' +
        '╭─❖ 𝐔𝐒𝐄𝐑 𝐈𝐍𝐅𝐎 ❖─╮\n' +
        '│\n' +
        '│  👤 𝐔𝐒𝐄𝐑 : ' +
        userTag +
        '\n' +
        '│  🌸 𝐆𝐑𝐄𝐄𝐓𝐈𝐍𝐆 : ' +
        greet +
        '\n' +
        '│\n' +
        '╰─────────────────╯\n\n' +
        '╭─❖ 𝐁𝐎𝐓 𝐈𝐍𝐅𝐎 ❖─╮\n' +
        '│\n' +
        '│  🤖 𝐁𝐎𝐓     : ' +
        showName +
        '\n' +
        '│  👑 𝐎𝐖𝐍𝐄𝐑   : ' +
        FOOTER_DEV +
        '\n' +
        '│  💾 𝐑𝐀𝐌     : ' +
        ram +
        '\n' +
        '│  ⏱️ 𝐔𝐏𝐓𝐈𝐌𝐄  : ' +
        runtime +
        '\n' +
        '│  🕐 𝐓𝐈𝐌𝐄    : ' +
        timeStr +
        '\n' +
        '│  📅 𝐃𝐀𝐓𝐄    : ' +
        dateStr +
        '\n' +
        '│  📦 𝐂𝐌𝐃𝐒    : ' +
        totalCmds +
        '\n' +
        '│  ⚙️ 𝐏𝐑𝐄𝐅𝐈𝐗  : ' +
        prefix +
        '\n' +
        '│\n' +
        '╰─────────────────╯\n\n' +
        '╭─❖ 𝐒𝐘𝐒𝐓𝐄𝐌 ❖─╮\n' +
        '│\n' +
        '│  🟢 𝐒𝐓𝐀𝐓𝐔𝐒 : 𝐎𝐍𝐋𝐈𝐍𝐄\n' +
        '│  ⚡ 𝐌𝐎𝐃𝐄   : 𝐏𝐔𝐁𝐋𝐈𝐂\n' +
        '│  🛡️ 𝐒𝐄𝐂𝐔𝐑𝐈𝐓𝐘 : 𝐀𝐂𝐓𝐈𝐕𝐄\n' +
        '│\n' +
        '╰─────────────────╯\n\n' +
        '        ❝ ' +
        randomQuote +
        ' ❞\n\n' +
        '🌸 *𝐇𝐄𝐋𝐋𝐎 𝐁𝐎𝐓 𝐔𝐒𝐄𝐑* 🌸\n\n' +
        '╭────────────────────╮\n' +
        '│  💖 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐎𝐅𝐂\n' +
        '│\n' +
        '│  𝐓𝐇𝐈𝐒 𝐈𝐒 𝐓𝐇𝐄\n' +
        '│  𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐌𝐈𝐍𝐈\n' +
        '│  𝐖𝐇𝐀𝐓𝐒𝐀𝐏𝐏 𝐁𝐎𝐓\n' +
        '╰────────────────────╯\n' +
        buildCategoryBlocks(prefix) +
        '\n╭─❖ 𝐌𝐄𝐍𝐔 𝐀𝐂𝐂𝐄𝐒𝐒 ❖─╮\n' +
        '│\n' +
        '│  🔹 ' +
        prefix +
        'menu\n' +
        '│  🔹 ' +
        prefix +
        'list\n' +
        '│\n' +
        '╰────────────────────╯\n\n' +
        '        💗 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘\n' +
        '       ' +
        FOOTER_DEV +
        '\n\n' +
        '╰━━━━━━━━━━━━━━━━━━━━━━╯'
      ).trim();

      await sock.sendMessage(
        from,
        {
          text: menuText,
          mentions: mentions,
          contextInfo: {
            mentionedJid: mentions,
            isForwarded: true,
            forwardingScore: 999,
          },
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('Menu Error:', err.message);
      try {
        await sock.sendMessage(
          from,
          { text: '❌ Menu Error: ' + (err.message || 'Unknown') },
          { quoted: msg }
        );
      } catch (_) {}
    }
  },
};
