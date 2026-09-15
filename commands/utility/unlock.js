const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');

const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const UNLOCK_EMOJI = '❤️‍🩹';

function foot() {
  return (
    '\n🌸💕 *Pair:* ' +
    SITE +
    '\n> ✦ ' +
    FOOTER +
    ' ✦\n_*✰┈ ' +
    BOT_FANCY +
    ' ┈✰*_'
  );
}

function unwrapViewOnce(message) {
  if (!message) return null;
  return (
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.ephemeralMessage?.message?.viewOnceMessage?.message ||
    message.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
    null
  );
}

function getQuotedMessage(msg) {
  const m = msg.message || {};
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    null;
  return ctx?.quotedMessage || null;
}

function findMediaNode(node) {
  if (!node) return null;
  if (node.imageMessage) return { type: 'image', media: node.imageMessage };
  if (node.videoMessage) return { type: 'video', media: node.videoMessage };
  if (node.audioMessage) return { type: 'audio', media: node.audioMessage };
  if (node.documentMessage) return { type: 'document', media: node.documentMessage };
  const inner = unwrapViewOnce(node);
  if (inner) return findMediaNode(inner);
  return null;
}

function isUnlockTrigger(text) {
  if (!text) return false;
  const t = String(text).trim();
  if (t === UNLOCK_EMOJI || t === '🩹') return true;
  const prefix = (config.prefix || '.').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + prefix + '(unlock|vv|viewonce|openvo|revealvo)\\b', 'i').test(t);
}

async function unlockAndSend(opts) {
  const sock = opts.sock;
  const msg = opts.msg;
  const from = opts.from;
  const quotedMsg = opts.quotedMsg;

  let mediaInfo = findMediaNode(quotedMsg);
  if (!mediaInfo) {
    const unwrapped = unwrapViewOnce(quotedMsg);
    mediaInfo = findMediaNode(unwrapped || quotedMsg);
  }

  if (!mediaInfo) {
    return sock.sendMessage(
      from,
      {
        text:
          '🥺 No *one-time* photo/video found\nReply to a view-once with ' +
          UNLOCK_EMOJI +
          foot(),
      },
      { quoted: msg }
    );
  }

  const loading = await sock.sendMessage(
    from,
    { text: '🔓💕 *Unlocking one-time media...*' },
    { quoted: msg }
  );

  try {
    const typeKey =
      mediaInfo.type === 'image'
        ? 'imageMessage'
        : mediaInfo.type === 'video'
          ? 'videoMessage'
          : mediaInfo.type === 'audio'
            ? 'audioMessage'
            : 'documentMessage';

    const fakeMsg = { key: msg.key, message: {} };
    fakeMsg.message[typeKey] = mediaInfo.media;

    const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {}, {
      logger: console,
      reuploadRequest: sock.updateMediaMessage,
    });

    if (!buffer || !buffer.length) throw new Error('Empty media buffer');

    await sock.sendMessage(from, { delete: loading.key }).catch(function () {});

    const caption =
      '╭───「 💖🔓 *UNLOCKED* 」───╮\n│\n' +
      '│  ' +
      UNLOCK_EMOJI +
      ' One-time media opened\n' +
      '│  💕 Saved for you\n│\n' +
      '╰──────────────────────╯' +
      foot();

    if (mediaInfo.type === 'image') {
      await sock.sendMessage(from, { image: buffer, caption: caption }, { quoted: msg });
    } else if (mediaInfo.type === 'video') {
      await sock.sendMessage(from, { video: buffer, caption: caption }, { quoted: msg });
    } else if (mediaInfo.type === 'audio') {
      await sock.sendMessage(
        from,
        {
          audio: buffer,
          mimetype: mediaInfo.media.mimetype || 'audio/ogg; codecs=opus',
          ptt: !!mediaInfo.media.ptt,
        },
        { quoted: msg }
      );
      await sock.sendMessage(from, { text: caption }, { quoted: msg });
    } else {
      await sock.sendMessage(
        from,
        {
          document: buffer,
          mimetype: mediaInfo.media.mimetype || 'application/octet-stream',
          fileName: mediaInfo.media.fileName || 'viewonce.bin',
          caption: caption,
        },
        { quoted: msg }
      );
    }
    return true;
  } catch (err) {
    console.error('[unlock]', err.message);
    await sock
      .sendMessage(from, {
        text:
          '❌💔 Unlock failed\n`' +
          err.message +
          '`\nMedia may have expired' +
          foot(),
        edit: loading.key,
      })
      .catch(function () {});
    return false;
  }
}

module.exports = {
  name: 'unlock',
  aliases: ['vv', 'viewonce', 'openvo', 'revealvo'],
  description: 'Unlock view-once photo/video — reply with ❤️‍🩹 or .unlock',
  category: 'utility',
  UNLOCK_EMOJI: UNLOCK_EMOJI,
  isUnlockTrigger: isUnlockTrigger,
  unlockAndSend: unlockAndSend,

  async execute(ctx) {
    const sock = ctx.sock;
    const msg = ctx.msg;
    const from = ctx.from;
    const quoted = getQuotedMessage(msg);

    if (!quoted) {
      return sock.sendMessage(
        from,
        {
          text:
            '╭───「 💖🔓 *UNLOCK* 」───╮\n│\n' +
            '│  Reply to a *one-time* photo/video\n│\n' +
            '│  📌 Ways:\n' +
            '│  • Reply with ' +
            UNLOCK_EMOJI +
            '\n' +
            '│  • Reply with ' +
            (config.prefix || '.') +
            'unlock\n' +
            '│  • Reply with ' +
            (config.prefix || '.') +
            'vv\n│\n' +
            '│  💕 Unlocked media → *this chat*\n' +
            '╰──────────────────────╯' +
            foot(),
        },
        { quoted: msg }
      );
    }

    return unlockAndSend({ sock: sock, msg: msg, from: from, quotedMsg: quoted });
  },
};
