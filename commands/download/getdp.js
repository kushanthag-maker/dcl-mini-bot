const config = require('../../config');

function digits(n) {
  return String(n || '').replace(/[^0-9]/g, '');
}

function toJid(numOrJid) {
  if (!numOrJid) return null;
  const s = String(numOrJid);
  if (s.includes('@')) {
    // user@s.whatsapp.net or group
    if (s.endsWith('@g.us')) return s;
    const d = digits(s.split('@')[0].split(':')[0]);
    return d ? d + '@s.whatsapp.net' : null;
  }
  const d = digits(s);
  return d ? d + '@s.whatsapp.net' : null;
}

/**
 * Resolve target: reply > mention > number arg > sender
 */
function resolveTarget(msg, args, from, sender) {
  const ctx =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    {};

  // 1) Reply
  if (ctx.participant) {
    return { jid: toJid(ctx.participant), source: 'reply' };
  }
  if (ctx.stanzaId && ctx.remoteJid && !String(ctx.remoteJid).endsWith('@g.us')) {
    // private chat reply — target is the chat peer if not fromMe handled by participant
  }

  // 2) Mentions
  const mentions = ctx.mentionedJid || [];
  if (mentions.length) {
    return { jid: toJid(mentions[0]), source: 'mention' };
  }

  // 3) Number in args
  if (args.length) {
    const jid = toJid(args.join(' '));
    if (jid) return { jid, source: 'number' };
  }

  // 4) If in group without target → sender's own DP
  // In private chat → other person's DP (chat jid) if not self-command only
  if (String(from).endsWith('@g.us')) {
    return { jid: toJid(sender), source: 'self' };
  }

  // private: default = chat partner (from) — but when user messages bot, from is user
  // so default own DP
  return { jid: toJid(sender) || toJid(from), source: 'self' };
}

module.exports = {
  name: 'getdp',
  aliases: ['dp', 'pp', 'profilepic', 'getpp'],
  description: 'Download WhatsApp profile picture',
  category: 'utility',

  async execute({ sock, msg, from, args, sender }) {
    const prefix = config.prefix || '.';
    const target = resolveTarget(msg, args, from, sender);

    if (!target?.jid) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🖼️ *GET DP* 」───╮
│
│  ❌ Target හොයාගන්න බැරි වුණා
│
│  💡 *Usage:*
│  ${prefix}getdp
│  ${prefix}getdp @user
│  ${prefix}getdp 94771234567
│  (reply to someone + ${prefix}getdp)
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const num = digits(target.jid);
    const loading = await sock.sendMessage(
      from,
      { text: `🖼️ *DP ලබාගනිමින්...*\n👤 ${num}` },
      { quoted: msg }
    );

    try {
      let ppUrl = null;
      try {
        ppUrl = await sock.profilePictureUrl(target.jid, 'image');
      } catch (_) {
        try {
          ppUrl = await sock.profilePictureUrl(target.jid, 'preview');
        } catch (__) {}
      }

      if (!ppUrl) {
        return sock.sendMessage(from, {
          text: `❌ *Profile picture නැහැ*\n\n👤 ${num}\n💡 DP public නැති / set කරලා නැති වෙන්න පුළුවන්.`,
          edit: loading.key,
        });
      }

      const caption = `
╭───「 🖼️ *PROFILE DP* 」───╮
│
│  👤 *User*   ›  ${num}
│  📌 *Source* ›  ${target.source}
│
╰──────────────────────╯`.trim();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      await sock.sendMessage(
        from,
        {
          image: { url: ppUrl },
          caption,
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('getdp error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ DP download fail.\n\n\`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
