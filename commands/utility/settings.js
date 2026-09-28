/**
 * DARK QUEEN V2 — .settings
 * On/Off toggle panel with native buttons (levvleys) + bot image
 * Toggle via button ids: dqset_toggle_<key> / dqset_refresh
 */
const { getSettings, updateSettings } = require('../../lib/botSettings');
const { sendQuickReplies } = require('../../lib/sendButtons');

const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';

const FEATURES = [
  { key: 'statusSeen', label: 'Status Auto-Seen', icon: '👁️' },
  { key: 'antiDelete', label: 'Anti Delete', icon: '🛡️' },
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
  for (const f of FEATURES) {
    text += '├─' + box(!!settings[f.key]) + ' ' + f.icon + ' ' + f.label + ' : ' + stateLabel(!!settings[f.key]) + '\n';
  }
  text += '│\n' +
    '└─🌸 Tap a button to toggle on/off';
  return text;
}

module.exports = {
  name: 'settings',
  aliases: ['setting', 'config', 'panel'],
  description: 'Settings panel with on/off buttons + image',
  category: 'utility',

  async execute({ sock, msg, from, args, isOwner, sessionId }) {
    const sid = sessionId || 'default';
    const action = String(args[0] || '').trim();

    if (action.startsWith('dqset_')) {
      if (!isOwner) {
        return sock.sendMessage(from, { text: '👑 Only the bot owner can change settings.' }, { quoted: msg });
      }
      if (action.startsWith('dqset_toggle_')) {
        const key = action.replace('dqset_toggle_', '');
        const feat = FEATURES.find((f) => f.key === key);
        if (!feat) return sock.sendMessage(from, { text: '❌ Unknown setting.' }, { quoted: msg });
        const current = !!getSettings(sid)[key];
        updateSettings(sid, { [key]: !current });
        try { await sock.sendMessage(from, { react: { text: !current ? '✅' : '⛔', key: msg.key } }); } catch (_) {}
      }
      // dqset_refresh → just re-render
    }

    const settings = getSettings(sid);
    const buttons = FEATURES.map((f) => ({
      id: 'dqset_toggle_' + f.key,
      text: f.icon + ' ' + (settings[f.key] ? 'OFF ⛔' : 'ON ✅'),
    }));
    buttons.push({ id: 'dqset_refresh', text: '🔄 Refresh' });

    try { await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } }); } catch (_) {}

    try {
      await sendQuickReplies(sock, from, {
        text: renderPanel(settings),
        footer: 'DARK QUEEN OFC · V2',
        imageUrl: getLogo(sid),
        buttons,
        quoted: msg,
      });
    } catch (e) {
      console.error('Settings buttons fail:', e.message);
      await sock.sendMessage(from, { text: renderPanel(settings) }, { quoted: msg });
    }
  },
};
