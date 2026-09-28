/**
 * DARK QUEEN V2 — ONE Interactive Message menu
 * Image header + body (tree UI) + category list — single relayMessage
 * No split (no separate video / quick-reply spam)
 */
const config = require('../../config');
const { getSettings } = require('../../lib/botSettings');
const { getAllCommands, getCommandsByCategory } = require('../../lib/commandHandler');
const moment = require('moment-timezone');

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

function getBaileys() {
  return require('@whiskeysockets/baileys');
}

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

function metaFor(key) {
  return (
    CATEGORY_META.find((c) => c.key === key) || {
      key: key,
      title: String(key).toUpperCase(),
      emoji: '📌',
    }
  );
}

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
  for (const k of Object.keys(counts)) {
    if (!ordered.find((c) => c.key === k)) {
      ordered.push({ key: k, title: k.toUpperCase(), emoji: '📌', order: 99 });
    }
  }
  return ordered.map((c) => ({ ...c, count: counts[c.key] || 0 }));
}

/** Tree UI like screenshot (single caption body) */
function buildMainBody(prefix, sessionId) {
  const settings = (() => {
    try {
      return getSettings(sessionId) || {};
    } catch {
      return {};
    }
  })();
  const botName = settings.botName || config.botName || 'Dark Queen';
  const total = (getAllCommands() || []).length;
  const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  const now = moment().tz(config.timezone || 'Asia/Colombo').format('HH:mm');

  return (
    '*' + DISPLAY_BOT_NAME + '*\n\n' +
    '□ *./Informação*\n' +
    '│\n' +
    '├─□ Author: #ZayraDev\n' +
    '├─□ Prefix: *' + prefix + '*\n' +
    '├─□ Action: dark-queen.vercel.app\n' +
    '├─□ Version: *2.0*\n' +
    '├─□ Type: ( CommonJs )\n' +
    '├─□ Library: *Levvleys*\n' +
    '├─□ Bot: *' + botName + '*\n' +
    '├─□ RAM: *' + ram + ' MB*\n' +
    '├─□ Uptime: *' + formatUptime(process.uptime()) + '*\n' +
    '├─□ Commands: *' + total + '*\n' +
    '└─□ Time: *' + now + '*\n\n' +
    '_Tap *Open Menu* → pick a category_ 🌸'
  );
}

function buildCategoryBody(catKey, prefix) {
  const meta = metaFor(catKey);
  const cmds = (getCommandsByCategory(catKey) || [])
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  let body =
    '*' + meta.emoji + ' ' + meta.title + '*\n\n' +
    '□ *./' + catKey + '*\n' +
    '│\n';

  if (!cmds.length) {
    body += '└─□ _no commands_ 🌸\n';
  } else {
    cmds.forEach((c, i) => {
      const name = String(c.name || '').trim();
      if (!name) return;
      const last = i === cmds.length - 1;
      body += (last ? '└─□ ' : '├─□ ') + prefix + name + '\n';
    });
  }
  body += '\n_Tap a command below or type it_ 💗';
  return { body, meta, cmds };
}

/**
 * ONE interactive message: image + body + native flow list (+ optional quick reply)
 */
async function sendInteractiveMenu(sock, jid, {
  text,
  footer = FOOTER,
  headerTitle = DISPLAY_BOT_NAME,
  buttonText = 'Open Menu',
  rows = [],
  quickButtons = [],
  imageUrl,
  quoted,
} = {}) {
  const {
    generateWAMessageFromContent,
    prepareWAMessageMedia,
  } = getBaileys();

  const sections = [
    {
      title: headerTitle.slice(0, 24),
      rows: (rows || []).slice(0, 10).map((r) => ({
        header: r.header || '',
        title: String(r.title || '').slice(0, 24),
        description: String(r.description || '').slice(0, 72),
        id: String(r.id),
      })),
    },
  ];

  const nativeFlowButtons = [
    {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: buttonText,
        sections,
      }),
    },
  ];

  // max ~3 total native buttons; keep 1 list + up to 2 quick
  for (const b of (quickButtons || []).slice(0, 2)) {
    nativeFlowButtons.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: String(b.text).slice(0, 25),
        id: String(b.id),
      }),
    });
  }

  let header = {
    title: headerTitle.slice(0, 60),
    hasMediaAttachment: false,
  };

  if (imageUrl) {
    try {
      const media = await prepareWAMessageMedia(
        { image: { url: imageUrl } },
        { upload: sock.waUploadToServer }
      );
      header = {
        title: headerTitle.slice(0, 60),
        hasMediaAttachment: true,
        imageMessage: media.imageMessage,
      };
    } catch (e) {
      console.error('[menu] media upload', e.message);
    }
  }

  const full = generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
      },
      interactiveMessage: {
        body: { text: text || ' ' },
        footer: { text: footer },
        header,
        nativeFlowMessage: {
          buttons: nativeFlowButtons,
          messageParamsJson: '{}',
        },
      },
    },
    { userJid: sock.user?.id, quoted }
  );

  await sock.relayMessage(jid, full.message, { messageId: full.key.id });
  return full;
}

async function showMain(sock, msg, from, sessionId) {
  const prefix = config.prefix || '.';
  const logo = getLogo(sessionId);
  const cats = liveCategories();

  const rows = cats.slice(0, 10).map((c) => ({
    id: 'dqcat_' + c.key,
    title: (c.emoji + ' ' + c.title).slice(0, 24),
    description: (c.count || 0) + ' commands',
  }));

  await sendInteractiveMenu(sock, from, {
    text: buildMainBody(prefix, sessionId),
    footer: FOOTER,
    headerTitle: DISPLAY_BOT_NAME,
    buttonText: '📂 Open Menu',
    rows,
    quickButtons: [
      { id: 'dqmenu_ping', text: '📡 Ping' },
      { id: 'dqmenu_alive', text: '💗 Alive' },
    ],
    imageUrl: logo,
    quoted: msg,
  });
}

async function showCategory(sock, msg, from, catKey, sessionId) {
  const prefix = config.prefix || '.';
  const logo = getLogo(sessionId);
  const { body, meta, cmds } = buildCategoryBody(catKey, prefix);

  const rows = (cmds || []).slice(0, 10).map((c) => ({
    id: 'dqcmd_' + c.name,
    title: (prefix + c.name).slice(0, 24),
    description: String(c.description || 'Run command').slice(0, 72),
  }));

  if (!rows.length) {
    rows.push({
      id: 'dqmenu_menu',
      title: 'Main Menu',
      description: 'No commands here',
    });
  }

  await sendInteractiveMenu(sock, from, {
    text: body,
    footer: meta.emoji + ' ' + meta.title + ' · ' + FOOTER,
    headerTitle: meta.emoji + ' ' + meta.title,
    buttonText: '📋 Commands',
    rows,
    quickButtons: [
      { id: 'dqmenu_menu', text: '⬅️ Menu' },
      { id: 'dqcat_' + catKey, text: '🔄 Refresh' },
    ],
    imageUrl: logo,
    quoted: msg,
  });
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm', 'commands'],
  description: 'Single interactive image menu',
  category: 'utility',

  async execute({ sock, msg, from, args, sessionId }) {
    try {
      try {
        await sock.sendMessage(from, { react: { text: '🫧', key: msg.key } });
      } catch (_) {}

      const a0 = String(args[0] || '').trim();
      const a1 = String(args[1] || '').trim();

      if (a0 === 'cat' || a0.startsWith('dqcat_')) {
        const key = (a0.startsWith('dqcat_') ? a0 : a1)
          .replace(/^dqcat_/, '')
          .trim()
          .toLowerCase();
        if (!key) return await showMain(sock, msg, from, sessionId);
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
