/**
 * Attach to each sock — auto react on newsletter posts
 * Call from featureHooks: attachChannelReactHook(sock, sessionId)
 */
const { load } = require('./channelReactStore');
const { multiReact } = require('./channelReactLib');

// debounce same post
const seen = new Map(); // key -> ts
const SEEN_TTL = 10 * 60 * 1000;

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
        if (msg.key.fromMe) continue;

        const cfg = autos[jid];
        if (!cfg || cfg.enabled === false) continue;

        const serverId =
          msg.key.id ||
          msg.message?.newsletterAdminInviteMessage?.id ||
          null;
        // Baileys newsletter message id
        const mid =
          msg.key.server_id ||
          msg.key.id ||
          msg.messageTimestamp ||
          null;
        const postId = String(mid || serverId || '');
        if (!postId) continue;

        const dedupe = `${jid}:${postId}`;
        if (seen.has(dedupe)) continue;
        seen.set(dedupe, Date.now());

        // cleanup old
        for (const [k, t] of seen) {
          if (Date.now() - t > SEEN_TTL) seen.delete(k);
        }

        const emojis = cfg.emojis || ['👍'];
        // one react wave per post — count = online bots (capped)
        const count = Math.min(Math.max(emojis.length, 3), 15);

        console.log(
          `[channelReact] auto ${sessionId} → ${jid} post=${postId}`
        );

        // delay slightly so only one session triggers multi (simple race)
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 800));
        if (seen.get(dedupe + ':done')) continue;
        seen.set(dedupe + ':done', Date.now());

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
