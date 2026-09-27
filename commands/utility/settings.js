/**
 * DARK QUEEN V2 — .settings
 * On/Off toggle panel with native buttons (levvleys)
 * Toggle via button ids: dqset_toggle_<key> / dqset_refresh / dqset_close
 */
const { getSettings, updateSettings } = require('../../lib/botSettings');
const { sendQuickReplies } = require('../../lib/sendButtons');

const FEATURES = [
  { key: 'statusSeen', label: 'Status Auto-Seen', icon: '👁️' },
  { key: 'antiDelete', label: 'Anti Delete', icon: '🛡️' },
];

function box(on) {
  return on ? '☑' : '☐';
}

function stateLabel(on) {
  return on ? '*ON* ✅' : '*OFF* ⛔';
}

function renderPanel(settings) {
  let text =
    '┌─「 ⚙️ 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒 」\n' +
    '│ ./settings\n' +
    '│\n';
  for (const f of FEATURES) {
    text += '├─' + box(!!settings[f.key]) + ' ' + f.icon + ' ' + f.label + ' : ' + stateLabel(!!settings[f.key]) + '\n';
  }
  text +=
    '│\n' +
    '└─🌸 Tap a button to toggle on/off';
  return text;
}

module.exports = {
  name: 'settings',
  aliases: ['setting', 'config', 'panel'],
  description: 'Settings panel with on/off buttons',
  category: 'utility',

  async execute({ sock, msg, from, args, isOwner, sessionId }) {
    const sid = sessionId || 'default';
    const action = String(args[0] || '').trim();

    // ---- Button actions ----
    if (action.startsWith('dqset_')) {
      if (!isOwner) {
        return sock.sendMessage(
          from,
          { text: '👑 Only the bot owner can change settings.' },
          { quoted: msg }
        );
      }

      if (action === 'dqset_refresh' || action === 'dqset_close') {
        // just re-render
      } else if (action.startsWith('dqset_toggle_')) {
        const key = action.replace('dqset_toggle_', '');
        const feat = FEATURES.find((f) => f.key === key);
        if (!feat) {
          return sock.sendMessage(from, { text: '❌ Unknown setting.' }, { quoted: msg });
        }
        const current = !!getSettings(sid)[key];
        updateSettings(sid, { [key]: !current });
        try {
          await sock.sendMessage(from, {
            react: { text: !current ? '✅' : '⛔', key: msg.key },
          });
        } catch (_) {}
      }
    }

    const settings = getSettings(sid);
    const buttons = FEATURES.map((f) => ({
      id: 'dqset_toggle_' + f.key,
      text: f.icon + ' ' + (settings[f.key] ? 'OFF ⛔' : 'ON ✅'),
    }));
    buttons.push({ id: 'dqset_refresh', text: '🔄 Refresh' });

    try {
      await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } });
    } catch (_) {}

    try {
      await sendQuickReplies(sock, from, {
        text: renderPanel(settings),
        footer: 'DARK QUEEN OFC · V2',
        buttons: buttons,
        quoted: msg,
      });
    } catch (e) {
      console.error('Settings buttons fail:', e.message);
      await sock.sendMessage(from, { text: renderPanel(settings) }, { quoted: msg });
    }
  },
};
