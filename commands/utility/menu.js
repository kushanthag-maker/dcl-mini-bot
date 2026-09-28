/**
 * DARK QUEEN V2 — Interactive Menu
 * .menu → video note + interactive image menu (category list)
 * category tap → interactive command list for that category
 */
const config = require('../../config');
const { getSettings } = require('../../lib/botSettings');
const { getAllCommands, getCommandsByCategory } = require('../../lib/commandHandler');
const { sendSelectList, sendQuickReplies } = require('../../lib/sendButtons');
const moment = require('moment-timezone');

const MENU_VIDEO = 'https://files.catbox.moe/jz1qbc.mp4';
const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';
const FOOTER = 'DARK QUEEN OFC · V2';
const DISPLAY_BOT_NAME = '𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐';

const CATEGORY_META = [
  { key: 'download', title: 'DOWNLOAD', emoji: '💎', order: 1 },
  { key: 'ai', title: 'AI', emoji: '🤖', order: 2 },
  { key: 'group', title: 'GROUP', emoji: '👥', order: 3 },
  { key: 'utility', title: 'GENERAL', emoji: '🌸', order: 4 },
  { key: 'fun', title: 'FUN', emoji: '🎀', order: 5 },
  { key: 'owner', title: 'OWNER', emoji: '👑', order: 6 },
  { key: 'media', title: 'MEDIA', emoji: '🎬', order: 7 },
  { key: 'tools', title: 'TOOLS', emoji: '✨', order: 8 },
  { key: 'movie', title: 'MOVIE', emoji: '🌺', order: 9 },
];

function getLogo(sessionId) {
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

function metaFor(key) {
  return (
    CATEGORY_META.find((c) => c.key === key) || {
      key: key,
      title: String(key).toUpperCase(),
      emoji: '📌',
    }
  );
}

/** categories that actually have commands */
function liveCategories() {
  const all = getAllCommands() || [];
  const counts = {};
  for (const cmd of all) {
    const cat = String(cmd.category || 'utility').toLowerCase();
    counts[cat] = (counts[cat] || 0) + 1;
  }
  const ordered = CATEGORY_META.filter((c) => counts[c.key] > 0).sort(
    (a, b) => a.order - b.order
  );
  // any unknown folders
  for (const k of Object.keys(counts)) {
    if (!ordered.find((c) => c.key === k)) {
      ordered.push({ key: k, title: k.toUpperCase(), emoji: '📌', order: 99 });
    }
  }
  return ordered.map((c) => ({ ...c, count: counts[c.key] || 0 }));
}

function mainBodyText(prefix, sessionId) {
  const settings = (() => {
    try {
      return getSettings(sessionId) || {};
    } catch {
      return {};
    }
  })();
  const botName = settings.botName || config.botName || DISPLAY_BOT_NAME;
  const total = (getAllCommands() || []).length;
  const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  return (
    '╭─「 🌸 *' +
    DISPLAY_BOT_NAME +
    '* 」\n' +
    '│ 👑 Bot › *' +
    botName +
    '*\n' +
    '│ ⚙️ Prefix › *' +
    prefix +
    '*\n' +
    '│ 📦 Commands › *' +
    total +
    '*\n' +
    '│ 💾 RAM › *' +
    ram +
    ' MB*\n' +
    '│ ⏱️ Uptime › *' +
    formatUptime(process.uptime()) +
    '*\n' +
    '│ 🌟 ' +
    greeting() +
    '\n' +
    '╰──────────────\n\n' +
    '💗 *Tap a category below*\n' +
    '📚 Open menu list to browse'
  );
}

async function sendVideoNote(sock, from, msg) {
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
    return;
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
      console.error('[menu] video fail', e2.message);
    }
  }
}

async function showMain(sock, msg, from, sessionId) {
  const prefix = config.prefix || '.';
  const logo = getLogo(sessionId);
  const cats = liveCategories();

  await sendVideoNote(sock, from, msg);

  const rows = cats.map((c) => ({
    id: 'dqcat_' + c.key,
    title: (c.emoji + ' ' + c.title).slice(0, 24),
    description: c.count + ' commands',
  }));

  // WhatsApp list max ~10 rows practical; slice if needed
  const listRows = rows.slice(0, 10);

  try {
    await sendSelectList(sock, from, {
      text: mainBodyText(prefix, sessionId),
      footer: FOOTER,
      title: 'Categories',
      buttonText: '📂 Open Categories',
      rows: listRows,
      imageUrl: logo,
      quoted: msg,
    });
  } catch (err) {
    console.error('[menu] interactive main fail', err.message);
    // fallback text
    let t = mainBodyText(prefix, sessionId) + '\n\n';
    cats.forEach((c, i) => {
      t += '*' + (i + 1) + '.* ' + c.emoji + ' ' + c.title + ' (' + c.count + ')\n';
    });
    t += '\nUse `' + prefix + 'menu cat <name>` e.g. `' + prefix + 'menu cat download`';
    await sock.sendMessage(from, { image: { url: logo }, caption: t }, { quoted: msg });
  }

  // extra quick replies (max 3 total if mixed — send separate)
  try {
    await sendQuickReplies(sock, from, {
      text: '⚡ *Quick access*',
      footer: FOOTER,
      imageUrl: logo,
      buttons: [
        { id: 'dqmenu_menu', text: '🔄 Refresh Menu' },
        { id: 'dqmenu_ping', text: '📡 Ping' },
        { id: 'dqmenu_alive', text: '💗 Alive' },
      ],
      quoted: msg,
    });
  } catch (_) {}
}

async function showCategory(sock, msg, from, catKey, sessionId) {
  const prefix = config.prefix || '.';
  const logo = getLogo(sessionId);
  const meta = metaFor(catKey);
  const cmds = (getCommandsByCategory(catKey) || [])
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  let body =
    '╭─「 ' +
    meta.emoji +
    ' *' +
    meta.title +
    '* 」\n' +
    '│ Category › *' +
    catKey +
    '*\n' +
    '│ Commands › *' +
    cmds.length +
    '*\n' +
    '╰──────────────\n\n' +
    '👇 *Select a command* or type `' +
    prefix +
    'cmd`';

  // list rows — each command selectable (max ~10 shown, rest in description)
  const rows = cmds.slice(0, 10).map((c) => ({
    id: 'dqcmd_' + c.name,
    title: (prefix + c.name).slice(0, 24),
    description: String(c.description || c.name).slice(0, 72),
  }));

  if (!rows.length) {
    rows.push({
      id: 'dqmenu_menu',
      title: 'Back to menu',
      description: 'No commands in this category',
    });
  }

  try {
    await sendSelectList(sock, from, {
      text: body,
      footer: meta.emoji + ' ' + meta.title + ' · ' + FOOTER,
      title: meta.title,
      buttonText: '📋 Commands',
      rows: rows,
      imageUrl: logo,
      quoted: msg,
    });
  } catch (err) {
    console.error('[menu] category interactive fail', err.message);
    let t = body + '\n\n';
    cmds.forEach((c) => {
      t += '• `' + prefix + c.name + '`\n';
    });
    await sock.sendMessage(from, { image: { url: logo }, caption: t }, { quoted: msg });
  }

  try {
    await sendQuickReplies(sock, from, {
      text: '🧭 *Navigate*',
      footer: FOOTER,
      buttons: [
        { id: 'dqmenu_menu', text: '⬅️ Main Menu' },
        { id: 'dqcat_' + catKey, text: '🔄 Refresh' },
        { id: 'dqmenu_ping', text: '📡 Ping' },
      ],
      quoted: msg,
    });
  } catch (_) {}
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm', 'commands'],
  description: 'Interactive video + image category menu',
  category: 'utility',

  async execute({ sock, msg, from, args, sessionId }) {
    try {
      try {
        await sock.sendMessage(from, { react: { text: '🫧', key: msg.key } });
      } catch (_) {}

      const a0 = String(args[0] || '').trim();
      const a1 = String(args[1] || '').trim();

      // .menu cat download   OR interactive dqcat_download as args
      if (a0 === 'cat' || a0.startsWith('dqcat_')) {
        const key = (a0.startsWith('dqcat_') ? a0 : a1)
          .replace(/^dqcat_/, '')
          .trim()
          .toLowerCase();
        if (!key) {
          return showMain(sock, msg, from, sessionId);
        }
        return await showCategory(sock, msg, from, key, sessionId);
      }

      return await showMain(sock, msg, from, sessionId);
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
