/**
 * Multi-bot channel reaction helpers
 */
const {
  load,
  save,
  bumpStats,
  parseChannelLink,
  normalizeNewsletterJid,
} = require('./channelReactStore');

function getOnlineSocks() {
  try {
    const sm = require('./sessionManager');
    const socks = [];
    if (sm.sessions && typeof sm.sessions.forEach === 'function') {
      sm.sessions.forEach((s, id) => {
        if (s && s.status === 'online' && s.sock) {
          socks.push({ sessionId: id, sock: s.sock });
        }
      });
    } else if (typeof sm.getAllSessions === 'function') {
      const list = sm.getAllSessions();
      for (const item of list) {
        if (item.status !== 'online') continue;
        const full = sm.sessions?.get?.(item.sessionId);
        if (full?.sock) socks.push({ sessionId: item.sessionId, sock: full.sock });
      }
    }
    return socks;
  } catch (e) {
    console.error('[channelReact] getOnlineSocks:', e.message);
    return [];
  }
}

/**
 * React using Baileys newsletter APIs (version-tolerant)
 */
async function reactOnce(sock, newsletterJid, serverMsgId, emoji) {
  const reaction = String(emoji || '👍').slice(0, 8);

  // Method 1: newsletterReactMessage (newer Baileys)
  if (typeof sock.newsletterReactMessage === 'function') {
    await sock.newsletterReactMessage(newsletterJid, String(serverMsgId), reaction);
    return 'newsletterReactMessage';
  }

  // Method 2: sendMessage react on newsletter jid
  await sock.sendMessage(newsletterJid, {
    react: {
      text: reaction,
      key: {
        remoteJid: newsletterJid,
        id: String(serverMsgId),
        fromMe: false,
      },
    },
  });
  return 'sendMessage.react';
}

/**
 * Distribute N reacts across online bots (round-robin)
 * emojis: string or string[]
 */
async function multiReact({ newsletterJid, serverMsgId, emojis, count }) {
  const socks = getOnlineSocks();
  if (!socks.length) {
    return { ok: false, error: 'No active bots online', done: 0, bots: 0 };
  }

  let emojiList = Array.isArray(emojis)
    ? emojis.filter(Boolean)
    : String(emojis || '👍')
        .split(/[\s,]+/)
        .filter(Boolean);
  if (!emojiList.length) emojiList = ['👍'];

  const n = Math.max(1, Math.min(Number(count) || 1, 200));
  let done = 0;
  const errors = [];

  for (let i = 0; i < n; i++) {
    const { sock, sessionId } = socks[i % socks.length];
    const emoji = emojiList[i % emojiList.length];
    try {
      await reactOnce(sock, newsletterJid, serverMsgId, emoji);
      done++;
      // small delay avoid rate limit
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
    } catch (e) {
      errors.push(`${sessionId}: ${e.message}`);
      console.error('[channelReact] react fail', sessionId, e.message);
    }
  }

  if (done > 0) bumpStats(newsletterJid, done);

  return {
    ok: done > 0,
    done,
    requested: n,
    bots: socks.length,
    errors: errors.slice(0, 5),
  };
}

/**
 * Resolve channel post link → { newsletterJid, serverMsgId }
 * invite code channels need metadata lookup via first online sock
 */
async function resolvePostTarget(linkOrJid, serverIdHint) {
  const parsed = parseChannelLink(linkOrJid);
  let newsletterJid = normalizeNewsletterJid(linkOrJid);
  let serverMsgId = serverIdHint || (parsed && parsed.serverId) || null;

  if (parsed && !newsletterJid) {
    const socks = getOnlineSocks();
    if (!socks.length) throw new Error('No active bots to resolve channel');

    const sock = socks[0].sock;
    // Try newsletterMetadata by invite
    if (typeof sock.newsletterMetadata === 'function') {
      try {
        const meta = await sock.newsletterMetadata('invite', parsed.inviteOrId);
        const id = meta?.id || meta?.jid || meta?.newsletterJid;
        if (id) newsletterJid = normalizeNewsletterJid(id) || id;
      } catch (e) {
        console.error('[channelReact] metadata invite:', e.message);
      }
    }
    // Some builds: newsletterInviteInfo
    if (!newsletterJid && typeof sock.query === 'function') {
      // leave jid null — user should pass @newsletter jid
    }
  }

  if (!newsletterJid && parsed) {
    // fallback: treat long numeric invite path incorrectly — ask user for jid
    throw new Error(
      'Channel JID resolve බැරි වුණා. `.setreact 120363...@newsletter` හෝ full post link + bot follow channel try කරන්න.'
    );
  }

  if (!newsletterJid) throw new Error('Invalid channel / link');
  if (!serverMsgId) throw new Error('Post message id නැහැ (link එකේ /NUMBER එක ඕනේ)');

  return { newsletterJid, serverMsgId: String(serverMsgId) };
}

module.exports = {
  getOnlineSocks,
  reactOnce,
  multiReact,
  resolvePostTarget,
  load,
  save,
};
