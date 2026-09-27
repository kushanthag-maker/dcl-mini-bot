/**
 * DARK QUEEN V2 — Checkbox Tree Menu (AlzSync style)
 * Style: ./informação tree + ☐ checkboxes + quick-reply buttons
 */
const config = require('../../config');
const { getSettings } = require('../../lib/botSettings');
const { getAllCommands } = require('../../lib/commandHandler');
const { sendQuickReplies } = require('../../lib/sendButtons');
const moment = require('moment-timezone');

const MENU_VIDEO = 'https://files.catbox.moe/jz1qbc.mp4';
const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';
const DISPLAY_BOT_NAME = '𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐';
const FOOTER_DEV = 'RED DEVIL × ZAYRA DEV';

const CATEGORY_META = {
  download: { title: '𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃', emoji: '💎', order: 1 },
  ai: { title: '𝐀𝐈', emoji: '🤖', order: 2 },
  group: { title: '𝐆𝐑𝐎𝐔𝐏', emoji: '👥', order: 3 },
  utility: { title: '𝐆𝐄𝐍𝐄𝐑𝐀𝐋', emoji: '🌸', order: 4 },
  owner: { title: '𝐎𝐖𝐍𝐄𝐑', emoji: '👑', order: 5 },
  fun: { title: '𝐅𝐔𝐍', emoji: '🎀', order: 6 },
};

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

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d + 'D ' + h + 'H ' + m + 'M';
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
  for (const cat of ordered) {
    const meta = CATEGORY_META[cat] || { title: cat.toUpperCase(), emoji: '🌹' };
    const cmds = byCat[cat]
      .slice()
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });

    out += '\n┌─「 ' + meta.emoji + ' ' + meta.title + ' 」\n';
    for (let j = 0; j < cmds.length; j++) {
      const name = String(cmds[j].name || '').trim();
      if (!name) continue;
      const branch = j === cmds.length - 1 ? '└─☐' : '├─☐';
      out += branch + ' ' + pfx + name + '\n';
    }
  }
  return out;
}

function buildHeader(prefix, sessionId) {
  const settings = (() => {
    try { return getSettings(sessionId) || {}; } catch { return {}; }
  })();
  const botName = settings.botName || config.botName || 'Dark Queen';
  const totalCmds = (getAllCommands() || []).length;
  const runtime = formatUptime(process.uptime());
  const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB';
  const now = moment().tz(config.timezone || 'Asia/Colombo');
  const timeStr = now.format('hh:mm A');
  const dateStr = now.format('MMM DD, YYYY');

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
    '├─☐ 𝐑𝐀𝐌 : ' + ram + ' | ⏱ ' + runtime + '\n' +
    '├─☐ 𝐂𝐌𝐃𝐒 : ' + totalCmds + ' | 🕐 ' + timeStr + ' · ' + dateStr + '\n' +
    '│\n' +
    '├─./𝐙𝐀𝐘𝐑𝐀.𝐣𝐬_\n' +
    '│  ├─./#RedDevil\n' +
    '│  ├─./#ZayraDev\n' +
    '│  └─./#DarkQueen\n' +
    '└─🌹 DarkQueenCatalyze🌸'
  );
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm', 'commands'],
  description: 'Checkbox-tree menu (AlzSync style) + buttons',
  category: 'utility',

  async execute({ sock, msg, from, sessionId }) {
    try {
      try {
        await sock.sendMessage(from, { react: { text: '🫧', key: msg.key } });
      } catch (_) {}

      const prefix = config.prefix || '.';
      const logo = getMenuLogo(sessionId);

      // 1) PTV video note
      try {
        await sock.sendMessage(
          from,
          { video: { url: MENU_VIDEO }, mimetype: 'video/mp4', ptv: true },
          { quoted: msg }
        );
      } catch (e1) {
        try {
          await sock.sendMessage(
            from,
            { video: { url: MENU_VIDEO }, mimetype: 'video/mp4', gifPlayback: true },
            { quoted: msg }
          );
        } catch (_) {}
      }

      // 2) Checkbox-tree menu
      const menuText = (
        buildHeader(prefix, sessionId) +
        '\n' +
        buildCategoryBlocks(prefix) +
        '\n│\n' +
        '└─🌸 ' + DISPLAY_BOT_NAME + ' × ' + FOOTER_DEV
      ).trim();

      await sock.sendMessage(from, { text: menuText }, { quoted: msg });

      // 3) Buttons (levvleys native flow)
      try {
        await sendQuickReplies(sock, from, {
          text:
            '🌸 *' + DISPLAY_BOT_NAME + '*\n' +
            'Tap a button below 👇',
          footer: 'DARK QUEEN OFC · V2',
          imageUrl: logo,
          buttons: [
            { id: 'dqmenu_settings', text: '⚙️ Settings' },
            { id: 'dqmenu_ping', text: '📡 Ping' },
            { id: 'dqmenu_runtime', text: '⏱️ Runtime' },
          ],
          quoted: msg,
        });
      } catch (e) {
        console.error('Menu buttons fail:', e.message);
      }
    } catch (err) {
      console.error('Menu Error:', err.message);
      try {
        await sock.sendMessage(from, { text: '❌ Menu Error: ' + (err.message || 'Unknown') }, { quoted: msg });
      } catch (_) {}
    }
  },
};
