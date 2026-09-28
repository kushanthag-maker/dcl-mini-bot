/**
 * DARK QUEEN V2 — Main Menu (single message · image + list + buttons)
 * Tap a category row → that category's commands arrive as ONE message
 * (image + checkbox list + buttons). Nothing splits into parts.
 */
const config = require('../../config');
const { getSettings } = require('../../lib/botSettings');
const { getAllCommands, getCommandsByCategory } = require('../../lib/commandHandler');
const { sendQuickReplies } = require('../../lib/sendButtons');
const moment = require('moment-timezone');

const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';
const DISPLAY_BOT_NAME = '𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐';
const FOOTER_DEV = 'RED DEVIL × ZAYRA DEV';

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

function headerText(prefix, sessionId) {
  const settings = (() => { try { return getSettings(sessionId) || {}; } catch { return {}; } })();
  const botName = settings.botName || config.botName || 'Dark Queen';
  const totalCmds = (getAllCommands() || []).length;
  const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB';
  const now = moment().tz(config.timezone || 'Asia/Colombo');
  return (
    '┌─「 🌸 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐂̧𝐀̃𝐎 𝐔𝐏𝐃𝐀𝐓𝐄 」\n' +
    '│ ./dark-queen\n' +
    '│\n' +
    '├─☐ 𝐀𝐮𝐭𝐡𝐨𝐫 : #DarkQueen\n' +
    '├─☐ 𝐏𝐫𝐞𝐟𝐢𝐱 : [' + prefix + ']\n' +
    '├─☐ 𝐀𝐜𝐭𝐢𝐨𝐧 : DCL-MINI.bot\n' +
    '├─☐ 𝐕𝐞𝐫𝐬𝐢𝐨𝐧 : 2\n' +
    '├─☐ 𝐆𝐞𝐧𝐞𝐫𝐚𝐬𝐢 : 2\n' +
    '├─☐ 𝐓𝐲𝐩𝐞 : ( CommonJs )\n' +
    '├─☐ 𝐋𝐢𝐛𝐫𝐚𝐫𝐲 : Levvleys\n' +
    '├─☐ 𝐁𝐨𝐭 : ' + botName + '\n' +
    '├─☐ 𝐑𝐀𝐌 : ' + ram + ' | ⏱ ' + formatUptime(process.uptime()) + '\n' +
    '├─☐ 𝐂𝐌𝐃𝐒 : ' + totalCmds + ' | 🕐 ' + now.format('hh:mm A') + '\n' +
    '│\n' +
    '├─./𝐙𝐀𝐘𝐑𝐀.𝐣𝐬_\n' +
    '│  ├─./#RedDevil\n' +
    '│  ├─./#ZayraDev\n' +
    '│  └─./#DarkQueen\n' +
    '└─🌹 DarkQueenCatalyze🌸\n\n' +
    '🌸 *' + DISPLAY_BOT_NAME + '* — Select a category 👇'
  );
}

function categoryCommandsText(catKey, prefix) {
  const meta = CATEGORY_META.find((c) => c.key === catKey) || { title: catKey.toUpperCase(), emoji: '🌹' };
  const cmds = (getCommandsByCategory(catKey) || [])
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  let text =
    '┌─「 ' + meta.emoji + ' ' + meta.title + ' 」\n' +
    '│ ./' + catKey + '\n│\n';
  if (!cmds.length) {
    text += '└─☐ _no commands yet_\n';
  } else {
    for (let j = 0; j < cmds.length; j++) {
      const name = String(cmds[j].name || '').trim();
      if (!name) continue;
      text += (j === cmds.length - 1 ? '└─☐ ' : '├─☐ ') + prefix + name + '\n';
    }
  }
  text += '└─🌸 ' + DISPLAY_BOT_NAME;
  return { text, count: cmds.length, meta };
}

/** ONE interactive message: image header + body + category list + quick buttons */
async function sendMainMenu(sock, jid, { text, footer, title, buttonText, rows, quickButtons, imageUrl, quoted }) {
  const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

  const sections = [{
    title: title,
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

  let header = { title: 'Dark Queen V2', hasMediaAttachment: false };
  if (imageUrl) {
    try {
      const media = await prepareWAMessageMedia({ image: { url: imageUrl } }, { upload: sock.waUploadToServer });
      header = { title: 'Dark Queen V2', hasMediaAttachment: true, imageMessage: media.imageMessage };
    } catch (_) {}
  }

  const full = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: {
            body: { text: text || ' ' },
            footer: { text: footer || '' },
            header,
            nativeFlowMessage: {
              buttons: nativeFlowButtons,
              messageParamsJson: JSON.stringify({ from: 'dark-queen-v2', v: 2 }),
            },
          },
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

  const rows = [];
  for (const meta of CATEGORY_META) {
    const cmds = (getCommandsByCategory(meta.key) || [])
      .map((c) => String(c.name || '').trim())
      .filter(Boolean)
      .sort();
    if (!cmds.length) continue;
    const preview = cmds.slice(0, 4).map((n) => prefix + n).join(' · ');
    rows.push({
      id: 'dqcat_' + meta.key,
      title: meta.emoji + ' ' + meta.title,
      description: cmds.length + ' cmds · ' + preview,
    });
  }

  await sendMainMenu(sock, from, {
    text: headerText(prefix, sessionId),
    footer: 'DARK QUEEN OFC · V2\n' + FOOTER_DEV,
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
    footer: meta.emoji + ' ' + meta.title + ' · DARK QUEEN V2',
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
  description: 'Single-message menu: image + categories + buttons',
  category: 'utility',

  async execute({ sock, msg, from, args, sessionId }) {
    try {
      try { await sock.sendMessage(from, { react: { text: '🫧', key: msg.key } }); } catch (_) {}

      // .menu cat <key>  or  button id dqcat_<key>
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
