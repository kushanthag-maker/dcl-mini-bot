/**
 * DARK QUEEN V2 — .settings
 * Toggle features via:
 *   1. Buttons (dqset_toggle_<key>)
 *   2. Number reply to the panel message (reply "1" or "2")
 */
const { getSettings, updateSettings } = require('../../lib/botSettings');
const { sendQuickReplies } = require('../../lib/sendButtons');
const { rememberPanel } = require('../../lib/settingsPanelStore');

const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';

const FEATURES = [
  { key: 'statusSeen', label: 'Status Auto-Seen', icon: '👁️', num: '1️⃣' },
  { key: 'antiDelete', label: 'Anti Delete', icon: '🛡️', num: '2️⃣' },
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

function box(on) { return on ? '☑' : '☐'; }
function stateLabel(on) { return on ? '*ON* ✅' : '*OFF* ⛔'; }

function renderPanel(settings) {
  let text =
    '┌─「 ⚙️ 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒 」\n' +
    '│ ./settings\n' +
    '│\n';
  for (let i = 0; i < FEATURES.length; i++) {
    const f = FEATURES[i];
    text += '├─' + box(!!settings[f.key]) + ' ' + f.num + ' ' + f.icon + ' ' + f.label + ' : ' + stateLabel(!!settings[f.key]) + '\n';
  }
  text += '│\n' +
    '└─🌸 Button tap OR reply 1 / 2 to toggle';
  return text;
}

module.exports = {
  name: 'settings',
  aliases: ['setting', 'config', 'panel'],
  description: 'Settings panel — buttons + number reply toggles',
  category: 'utility',

  async execute({ sock, msg, from, args, isOwner, sessionId }) {
    const sid = sessionId || 'default';
    const action = String(args[0] || '').trim();

    if (!isOwner && (action.startsWith('dqset_') || action === 'num')) {
      return sock.sendMessage(from, { text: '👑 Only the bot owner can change settings.' }, { quoted: msg });
    }

    // Toggle by feature number (reply 1 / 2 to panel)
    if (action === 'num') {
      const idx = parseInt(String(args[1] || ''), 10) - 1;
      const feat = FEATURES[idx];
      if (!feat) return sock.sendMessage(from, { text: '❌ Invalid option. Reply 1 or 2.' }, { quoted: msg });
      const current = !!getSettings(sid)[feat.key];
      updateSettings(sid, { [feat.key]: !current });
      try { await sock.sendMessage(from, { react: { text: !current ? '✅' : '⛔', key: msg.key } }); } catch (_) {}
    }

    // Toggle by button id
    if (action.startsWith('dqset_toggle_')) {
      const key = action.replace('dqset_toggle_', '');
      const feat = FEATURES.find((f) => f.key === key);
      if (!feat) return sock.sendMessage(from, { text: '❌ Unknown setting.' }, { quoted: msg });
      const current = !!getSettings(sid)[key];
      updateSettings(sid, { [key]: !current });
      try { await sock.sendMessage(from, { react: { text: !current ? '✅' : '⛔', key: msg.key } }); } catch (_) {}
    }

    // Render panel
    const settings = getSettings(sid);
    const buttons = FEATURES.map((f) => ({
      id: 'dqset_toggle_' + f.key,
      text: f.icon + ' ' + (settings[f.key] ? 'OFF ⛔' : 'ON ✅'),
    }));
    buttons.push({ id: 'dqset_refresh', text: '🔄 Refresh' });

    try { await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } }); } catch (_) {}

    try {
      const sent = await sendQuickReplies(sock, from, {
        text: renderPanel(settings),
        footer: 'DARK QUEEN OFC · V2',
        imageUrl: getLogo(sid),
        buttons,
        quoted: msg,
      });
      try { rememberPanel(from, sent.key.id); } catch (_) {}
    } catch (e) {
      console.error('Settings buttons fail:', e.message);
      await sock.sendMessage(from, { text: renderPanel(settings) }, { quoted: msg });
    }
  },
};
