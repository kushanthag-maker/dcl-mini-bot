/**
 * Settings panel message tracker
 * Lets users toggle features by REPLYING with the option number
 * (1, 2, ...) to the bot's settings panel message
 */
const store = new Map(); // jid -> { stanzaId, time }
const TTL = 10 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [jid, entry] of store) {
    if (now - entry.time > TTL) store.delete(jid);
  }
}

function rememberPanel(jid, stanzaId) {
  if (!jid || !stanzaId) return;
  cleanup();
  store.set(jid, { stanzaId, time: Date.now() });
}

function isPanelReply(msg) {
  try {
    const jid = msg.key.remoteJid;
    const entry = store.get(jid);
    if (!entry) return false;
    if (Date.now() - entry.time > TTL) {
      store.delete(jid);
      return false;
    }
    const ext = msg.message && msg.message.extendedTextMessage;
    const quoted = ext && ext.contextInfo && ext.contextInfo.stanzaId;
    return !!quoted && quoted === entry.stanzaId;
  } catch (_) {
    return false;
  }
}

module.exports = { rememberPanel, isPanelReply };
