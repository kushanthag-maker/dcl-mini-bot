/**
 * Auto-react on newsletter posts for channels in .setreact
 */
const { load } = require('./channelReactStore');
const { multiReact } = require('./channelReactLib');

const seen = new Map();
const SEEN_TTL = 15 * 60 * 1000;

function attachChannelReactHook(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (type !== 'notify' && type !== 'append') return;
      const data = load();
      const autos = data.autoChannels || {};
      if (!Object.keys(autos).length) return;

      for (const msg of messages || []) {
        const jid = msg?.key?.remoteJid || '';
        if (!jid.endsWith('@newsletter')) continue;
        if (msg.key?.fromMe) continue;

        const cfg = autos[jid];
        if (!cfg || cfg.enabled === false) continue;

        // Prefer server_id (numeric) — required by newsletterReactMessage
        const postId = String(
          msg.key?.server_id ||
            msg.message?.newsletterAdminInviteMessage?.serverId ||
            msg.key?.id ||
            ''
        ).replace(/[^0-9]/g, '');

        // If key.id is not numeric, try messageTimestamp as last resort — skip if empty
        if (!postId) {
          console.log('[channelReact] skip — no numeric server_id', msg.key);
          continue;
        }

        const dedupe = `${jid}:${postId}`;
        if (seen.has(dedupe + ':done')) continue;
        if (seen.has(dedupe)) continue;
        seen.set(dedupe, Date.now());

        for (const [k, t] of seen) {
          if (Date.now() - t > SEEN_TTL) seen.delete(k);
        }

        // Only one session should trigger multiReact
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
        if (seen.has(dedupe + ':done')) continue;
        seen.set(dedupe + ':done', Date.now());

        const emojis = cfg.emojis || ['👍'];
        // count = number of online bots (each bot 1 react)
        const count = Math.min(Math.max(emojis.length, 1), 30);

        console.log(`[channelReact] auto post ${jid} #${postId} by ${sessionId}`);

        await multiReact({
          newsletterJid: jid,
          serverMsgId: postId,
          emojis,
          count,
        });
      }
    } catch (e) {
      console.error('[channelReact] hook:', e.message);
    }
  });
}

module.exports = { attachChannelReactHook };
