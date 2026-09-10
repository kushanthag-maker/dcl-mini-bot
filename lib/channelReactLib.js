/**
 * Multi-bot channel reaction helpers (fixed)
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

    // Prefer live Map
    if (sm.sessions && typeof sm.sessions.forEach === 'function') {
      sm.sessions.forEach((s, id) => {
        if (s && s.status === 'online' && s.sock && s.sock.user) {
          socks.push({ sessionId: id, sock: s.sock });
        }
      });
    }

    // Deduplicate by bot phone (same WA account counted once)
    const seenPhone = new Set();
    const unique = [];
    for (const item of socks) {
      let phone = '';
      try {
        phone = String(item.sock.user.id || '')
          .split(':')[0]
          .split('@')[0]
          .replace(/[^0-9]/g, '');
      } catch (_) {}
      const key = phone || item.sessionId;
      if (seenPhone.has(key)) continue;
      seenPhone.add(key);
      unique.push(item);
    }
    return unique;
  } catch (e) {
    console.error('[channelReact] getOnlineSocks:', e.message);
    return [];
  }
}

async function ensureFollow(sock, newsletterJid) {
  try {
    if (typeof sock.newsletterFollow === 'function') {
      await sock.newsletterFollow(newsletterJid);
    }
  } catch (e) {
    // already following is fine
    console.log('[channelReact] follow:', e.message);
  }
}

/**
 * React once — Baileys newsletterReactMessage(jid, serverId, emoji)
 * serverId = number from channel post URL (.../channel/xxx/175)
 */
async function reactOnce(sock, newsletterJid, serverMsgId, emoji) {
  const reaction = String(emoji || '👍').trim().slice(0, 8);
  const serverId = String(serverMsgId).replace(/[^0-9]/g, '');
  if (!serverId) throw new Error('Invalid server_id (need numeric post id)');

  await ensureFollow(sock, newsletterJid);

  // Primary: official API
  if (typeof sock.newsletterReactMessage === 'function') {
    await sock.newsletterReactMessage(newsletterJid, serverId, reaction);
    return 'newsletterReactMessage';
  }

  // Fallback: raw query (same as Baileys source)
  if (typeof sock.query === 'function') {
    const id =
      typeof sock.generateMessageTag === 'function'
        ? sock.generateMessageTag()
        : String(Date.now());

    await sock.query({
      tag: 'message',
      attrs: {
        to: newsletterJid,
        type: 'reaction',
        server_id: serverId,
        id,
      },
      content: [
        {
          tag: 'reaction',
          attrs: { code: reaction },
        },
      ],
    });
    return 'query.reaction';
  }

  throw new Error(
    'sock.newsletterReactMessage missing — update Baileys / newsletter support'
  );
}

/**
 * One reaction per bot account.
 * count = how many bots should react (capped by online unique bots)
 */
async function multiReact({ newsletterJid, serverMsgId, emojis, count }) {
  const socks = getOnlineSocks();
  if (!socks.length) {
    return {
      ok: false,
      error: 'No active bots online (status=online + sock.user)',
      done: 0,
      bots: 0,
      requested: count,
    };
  }

  let emojiList = Array.isArray(emojis)
    ? emojis.filter(Boolean)
    : String(emojis || '👍')
        .split(/[\s,]+/)
        .filter(Boolean);
  if (!emojiList.length) emojiList = ['👍'];

  // Each WA account can only place 1 reaction per post
  const n = Math.max(1, Math.min(Number(count) || 1, socks.length, 50));
  let done = 0;
  const errors = [];
  const used = [];

  for (let i = 0; i < n; i++) {
    const { sock, sessionId } = socks[i];
    const emoji = emojiList[i % emojiList.length];
    try {
      const method = await reactOnce(sock, newsletterJid, serverMsgId, emoji);
      done++;
      used.push(`${sessionId}:${emoji}:${method}`);
      console.log(
        `[channelReact] OK ${sessionId} ${newsletterJid} #${serverMsgId} ${emoji} via ${method}`
      );
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
    } catch (e) {
      const msg = e?.message || String(e);
      errors.push(`${sessionId}: ${msg}`);
      console.error('[channelReact] FAIL', sessionId, msg);
    }
  }

  if (done > 0) bumpStats(newsletterJid, done);

  return {
    ok: done > 0,
    done,
    requested: n,
    bots: socks.length,
    used,
    errors: errors.slice(0, 8),
    note:
      n < (Number(count) || 1)
        ? `Only ${socks.length} unique bot(s) online — 1 react per bot`
        : undefined,
  };
}

async function resolveInviteToJid(inviteCode) {
  const socks = getOnlineSocks();
  if (!socks.length) throw new Error('No online bots to resolve channel');

  const sock = socks[0].sock;
  if (typeof sock.newsletterMetadata !== 'function') {
    throw new Error('newsletterMetadata not available on this Baileys build');
  }

  // type 'invite' + channel code from URL
  const meta = await sock.newsletterMetadata('invite', inviteCode);
  const id =
    meta?.id ||
    meta?.jid ||
    meta?.newsletterJid ||
    meta?.thread_metadata?.id ||
    null;

  if (!id) {
    console.log('[channelReact] metadata keys', meta && Object.keys(meta));
    throw new Error('Could not resolve channel JID from invite code');
  }
  return normalizeNewsletterJid(id) || String(id);
}

/**
 * Resolve post link / jid → { newsletterJid, serverMsgId }
 */
async function resolvePostTarget(linkOrJid, serverIdHint) {
  const parsed = parseChannelLink(linkOrJid);
  let newsletterJid = normalizeNewsletterJid(linkOrJid);
  let serverMsgId = serverIdHint || (parsed && parsed.serverId) || null;

  if (parsed && !newsletterJid) {
    newsletterJid = await resolveInviteToJid(parsed.inviteOrId);
  }

  if (!newsletterJid) throw new Error('Invalid channel — use 120363...@newsletter or full post link');
  if (!serverMsgId) {
    throw new Error(
      'Post ID නැහැ. Link එක මෙහෙම ඕනේ:\nhttps://whatsapp.com/channel/CODE/123\n(අන්තිම /123 = server_id)'
    );
  }

  // strip non-digits from server id
  serverMsgId = String(serverMsgId).replace(/[^0-9]/g, '');
  if (!serverMsgId) throw new Error('Post server_id must be numeric');

  return { newsletterJid, serverMsgId };
}

module.exports = {
  getOnlineSocks,
  reactOnce,
  multiReact,
  resolvePostTarget,
  ensureFollow,
  load,
  save,
};
