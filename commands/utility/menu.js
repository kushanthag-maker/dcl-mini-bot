/**
 * DARK QUEEN V2 — Main Menu (STATUS PANEL UI + full command list in one card)
 * .menu → PTV video note + ONE card (logo + panel + ALL commands + list + buttons)
 */
const config = require('../../config');
const { getSettings } = require('../../lib/botSettings');
const { getAllCommands, getCommandsByCategory } = require('../../lib/commandHandler');
const { sendQuickReplies } = require('../../lib/sendButtons');
const moment = require('moment-timezone');

const MENU_VIDEO = 'https://files.catbox.moe/jz1qbc.mp4';
const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';
const DISPLAY_BOT_NAME = '𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐';
const FOOTER_TEXT = '𓆩🌸 DARK QUEEN OFC · V2 🌸𓆪';

const CATEGORY_META = [
  { key: 'download', title: '𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃', emoji: '💎', order: 1 },
  { key: 'ai', title: '𝐀𝐈', emoji: '🤖', order: 2 },
  { key: 'group', title: '𝐆𝐑𝐎𝐔𝐏', emoji: '👥', order: 3 },
  { key: 'utility', title: '𝐆𝐄𝐍𝐄𝐑𝐀𝐋', emoji: '🌸', order: 4 },
  { key: 'fun', title: '𝐅𝐔𝐍', emoji: '🎀', order: 5 },
  { key: 'owner', title: '𝐎𝐖𝐍𝐄𝐑', emoji: '👑', order: 6 },
];

function getLogo(sessionId) {
  try {
    const logo = getSettings(sessionId).logo || DEFAULT_LOGO;
    if (!logo || logo.includes('4dvou4.png') || logo.includes('bp9p86.png')) return DEFAULT_LOGO;
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
  if (h < 5) return '🌌 Good Night';
  if (h < 12) return '🌏 Good Morning';
  if (h < 15) return '🌤️ Good Afternoon';
  if (h < 18) return '🌥️ Good Evening';
  if (h < 22) return '🌙 Good Night';
  return '🌌 Sweet Dreams';
}

/** Full menu text: STATUS PANEL header + every category + every command */
function buildMenuText(prefix, sessionId) {
  const settings = (() => { try { return getSettings(sessionId) || {}; } catch { return {}; } })();
  const botName = settings.botName || config.botName || 'Dark Queen';
  const totalCmds = (getAllCommands() || []).length;
  const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB';
  const now = moment().tz(config.timezone || 'Asia/Colombo');

  let text =
    '🍟 WELCOME TO DARK QUEEN\n' +
    '👑\n' +
    '┌─「 🌸 STATUS PANEL 」\n' +
    '│ 🌏 ' + greeting() + '\n' +
    '✨│\n' +
    '│ ⏰ Time : ' + now.format('h:mm:ss A') + '\n' +
    '│ 🗓️ Date : ' + now.format('YYYY/M/D') + '\n' +
    '│ 🤖 Bot Name : ' + botName + '\n' +
    '│ 👑 Owner : Red Devil × Zayra\n' +
    '│ 💾 Ram : ' + ram + '\n' +
    '│ ⏱️ Uptime : ' + formatUptime(process.uptime()) + '\n' +
    '│ 📦 Commands : ' + totalCmds + '\n' +
    '│ ⚙️ Prefix : ' + prefix + '\n' +
    '│ 🛡️ Library : Levvleys\n' +
    '└─────────────⳹\n';

  for (const meta of CATEGORY_META) {
    const cmds = (getCommandsByCategory(meta.key) || [])
      .map((c) => String(c.name || '').trim())
      .filter(Boolean)
      .sort();
    if (!cmds.length) continue;

    text += '\n┌─「 ' + meta.emoji + ' ' + meta.title + ' 」\n';
    for (let j = 0; j < cmds.length; j++) {
      text += (j === cmds.length - 1 ? '└─☐ ' : '├─☐ ') + prefix + cmds[j] + '\n';
    }
  }

  text += '\n└─🌸 ' + DISPLAY_BOT_NAME + ' · Tap a button 👇';
  return text;
}

function categoryCommandsText(catKey, prefix) {
  const meta = CATEGORY_META.find((c) => c.key === catKey) || { title: String(catKey).toUpperCase(), emoji: '🌹' };
  const cmds = (getCommandsByCategory(catKey) || [])
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  let text =
    '┌─「 ' + meta.emoji + ' ' + meta.title + ' 」\n' +
    '│ ./' + catKey + '\n│\n';
  if (!cmds.length) {
    text += '└─☐ _no commands yet_ 🌸\n';
  } else {
    for (let j = 0; j < cmds.length; j++) {
      const name = String(cmds[j].name || '').trim();
      if (!name) continue;
      text += (j === cmds.length - 1 ? '└─☐ ' : '├─☐ ') + prefix + name + '\n';
    }
  }
  return { text, meta };
}

/** ONE interactive card: image on top (short title) + body + list + quick buttons */
async function sendMainMenu(sock, jid, { text, footer, title, buttonText, rows, quickButtons, imageUrl, quoted }) {
  const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

  const sections = [{
    title: '📂 Categories',
    rows: rows.map((r) => ({
      header: r.header || '',
      title: String(r.title || '').slice(0, 24),
      description: String(r.description || '').slice(0, 72),
      id: String(r.id),
    })),
  }];

  const nativeFlowButtons = [{
    name: 'single_select',
    buttonParamsJson: JSON.stringify({ title: buttonText, sections }),
  }];
  for (const b of (quickButtons || []).slice(0, 2)) {
    nativeFlowButtons.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: String(b.text).slice(0, 25), id: String(b.id) }),
    });
  }

  let header = { title: '𝐃𝐐·𝐕𝟐', hasMediaAttachment: false };
  if (imageUrl) {
    try {
      const media = await prepareWAMessageMedia({ image: { url: imageUrl } }, { upload: sock.waUploadToServer });
      header = { title: '𝐃𝐐·𝐕𝟐', hasMediaAttachment: true, imageMessage: media.imageMessage };
    } catch (_) {}
  }

  const full = generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
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

  // PTV video note
  try {
    await sock.sendMessage(from, { video: { url: MENU_VIDEO }, mimetype: 'video/mp4', ptv: true }, { quoted: msg });
  } catch (e1) {
    try {
      await sock.sendMessage(from, { video: { url: MENU_VIDEO }, mimetype: 'video/mp4', gifPlayback: true }, { quoted: msg });
    } catch (_) {}
  }

  const menuText = buildMenuText(prefix, sessionId);

  // List rows: one per category (jump straight to it)
  const rows = [];
  for (const meta of CATEGORY_META) {
    const cmds = (getCommandsByCategory(meta.key) || [])
      .map((c) => String(c.name || '').trim())
      .filter(Boolean)
      .sort();
    if (!cmds.length) continue;
    rows.push({
      id: 'dqcat_' + meta.key,
      title: meta.emoji + ' ' + meta.title,
      description: cmds.length + ' cmds',
    });
  }

  await sendMainMenu(sock, from, {
    text: menuText,
    footer: FOOTER_TEXT,
    title: '📂 Categories',
    buttonText: '🌸 Open Menu',
    rows,
    quickButtons: [
      { id: 'dqmenu_settings', text: '⚙️ Settings' },
      { id: 'dqmenu_ping', text: '📡 Ping' },
    ],
    imageUrl: logo,
    quoted: msg,
  });
}

async function showCategory(sock, msg, from, catKey, sessionId) {
  const prefix = config.prefix || '.';
  const logo = getLogo(sessionId);
  const { text, meta } = categoryCommandsText(catKey, prefix);

  await sendQuickReplies(sock, from, {
    text,
    footer: meta.emoji + ' ' + meta.title + ' · ' + FOOTER_TEXT,
    imageUrl: logo,
    buttons: [
      { id: 'dqmenu_menu', text: '⬅️ Menu' },
      { id: 'dqmenu_settings', text: '⚙️ Settings' },
      { id: 'dqcat_' + catKey, text: '🔄 Refresh' },
    ],
    quoted: msg,
  });
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm', 'commands'],
  description: 'Video note + one-card menu with ALL commands',
  category: 'utility',

  async execute({ sock, msg, from, args, sessionId }) {
    try {
      try { await sock.sendMessage(from, { react: { text: '🫧', key: msg.key } }); } catch (_) {}

      const sub = String(args[0] || '');
      if (sub === 'cat' && args[1]) {
        const key = String(args[1]).replace('dqcat_', '').trim();
        return await showCategory(sock, msg, from, key, sessionId);
      }
      return await showMain(sock, msg, from, sessionId);
    } catch (err) {
      console.error('Menu Error:', err.message);
      try {
        await sock.sendMessage(from, { text: '❌ Menu Error: ' + (err.message || 'Unknown') }, { quoted: msg });
      } catch (_) {}
    }
  },
};
