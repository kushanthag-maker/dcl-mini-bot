const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');

const UPLOAD_URL = 'https://qqflpixiejlcthtdpwlb.supabase.co/functions/v1/zayra-api/upload';
const THUMB = 'https://files.catbox.moe/7u4h5k.webp';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';

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

async function replyImg(sock, from, msg, text) {
  const caption = String(text) + foot();
  try {
    await sock.sendMessage(
      from,
      { image: { url: THUMB }, caption: caption },
      msg ? { quoted: msg } : undefined
    );
  } catch (_) {
    await sock.sendMessage(
      from,
      { text: caption },
      msg ? { quoted: msg } : undefined
    );
  }
}

function getQuoted(msg) {
  const m = msg.message || {};
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    null;
  return {
    quotedMessage: ctx?.quotedMessage || null,
    stanzaId: ctx?.stanzaId || null,
    participant: ctx?.participant || null,
  };
}

function findMedia(node) {
  if (!node) return null;
  if (node.imageMessage) {
    return {
      type: 'image',
      media: node.imageMessage,
      ext: 'jpg',
      mime: node.imageMessage.mimetype || 'image/jpeg',
    };
  }
  if (node.videoMessage) {
    return {
      type: 'video',
      media: node.videoMessage,
      ext: 'mp4',
      mime: node.videoMessage.mimetype || 'video/mp4',
    };
  }
  if (node.audioMessage) {
    return {
      type: 'audio',
      media: node.audioMessage,
      ext: 'ogg',
      mime: node.audioMessage.mimetype || 'audio/ogg',
    };
  }
  if (node.documentMessage) {
    const name = node.documentMessage.fileName || 'file.bin';
    const ext = (name.split('.').pop() || 'bin').slice(0, 8);
    return {
      type: 'document',
      media: node.documentMessage,
      ext: ext,
      mime: node.documentMessage.mimetype || 'application/octet-stream',
      name: name,
    };
  }
  if (node.stickerMessage) {
    return {
      type: 'sticker',
      media: node.stickerMessage,
      ext: 'webp',
      mime: 'image/webp',
    };
  }
  const vo =
    node.viewOnceMessage?.message ||
    node.viewOnceMessageV2?.message ||
    node.viewOnceMessageV2Extension?.message ||
    null;
  if (vo) return findMedia(vo);
  return null;
}

function mediaFromMessage(msg) {
  const m = msg.message || {};
  let info = findMedia(m);
  if (info) return { info: info, sourceMsg: msg };

  const q = getQuoted(msg);
  if (q.quotedMessage) {
    info = findMedia(q.quotedMessage);
    if (info) {
      const fake = {
        key: {
          remoteJid: msg.key.remoteJid,
          id: q.stanzaId || msg.key.id,
          fromMe: false,
          participant: q.participant,
        },
        message: {},
      };
      const key =
        info.type === 'image'
          ? 'imageMessage'
          : info.type === 'video'
            ? 'videoMessage'
            : info.type === 'audio'
              ? 'audioMessage'
              : info.type === 'sticker'
                ? 'stickerMessage'
                : 'documentMessage';
      fake.message[key] = info.media;
      return { info: info, sourceMsg: fake };
    }
  }
  return null;
}

/** multipart/form-data without form-data package */
function buildMultipart(buffer, filename, mime) {
  const boundary = '----DarkQueen' + Date.now().toString(16);
  const head =
    '--' +
    boundary +
    '\r\n' +
    'Content-Disposition: form-data; name="file"; filename="' +
    filename.replace(/"/g, '') +
    '"\r\n' +
    'Content-Type: ' +
    (mime || 'application/octet-stream') +
    '\r\n\r\n';
  const tail = '\r\n--' + boundary + '--\r\n';
  const body = Buffer.concat([
    Buffer.from(head, 'utf8'),
    Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
    Buffer.from(tail, 'utf8'),
  ]);
  return {
    body: body,
    contentType: 'multipart/form-data; boundary=' + boundary,
  };
}

async function uploadBuffer(buffer, filename, mime) {
  const part = buildMultipart(buffer, filename, mime);
  const res = await axios.post(UPLOAD_URL, part.body, {
    headers: {
      'Content-Type': part.contentType,
      'User-Agent': 'Mozilla/5.0',
    },
    timeout: 180000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: function () {
      return true;
    },
  });
  return res;
}

module.exports = {
  name: 'drgonhost',
  aliases: ['dragonhost', 'dhost', 'hostup', 'zayraup', 'upload'],
  description: 'Upload replied media → public URL (Zayra host)',
  category: 'utility',

  async execute(ctx) {
    const sock = ctx.sock;
    const msg = ctx.msg;
    const from = ctx.from;
    const prefix = config.prefix || '.';

    const found = mediaFromMessage(msg);
    if (!found) {
      return replyImg(
        sock,
        from,
        msg,
        '╭───「 💖☁️ *DRGONHOST* 」───╮\n│\n' +
          '│  Reply to *photo / video / file / sticker*\n│\n' +
          '│  📌 ' +
          prefix +
          'drgonhost\n' +
          '│  🌸 Uploads → public URL\n│\n' +
          '╰──────────────────────╯'
      );
    }

    await replyImg(sock, from, msg, '⬆️💕 *Uploading to host...*\n⏳ Please wait');

    try {
      const buffer = await downloadMediaMessage(
        found.sourceMsg,
        'buffer',
        {},
        {
          logger: console,
          reuploadRequest: sock.updateMediaMessage,
        }
      );

      if (!buffer || !buffer.length) {
        return replyImg(sock, from, msg, '❌ Empty media buffer');
      }

      const info = found.info;
      const filename =
        info.name || 'darkqueen_' + Date.now() + '.' + (info.ext || 'bin');

      const res = await uploadBuffer(buffer, filename, info.mime);

      if (res.status !== 200 || !res.data) {
        return replyImg(
          sock,
          from,
          msg,
          '❌ Upload HTTP ' +
            res.status +
            '\n' +
            JSON.stringify(res.data || {}).slice(0, 200)
        );
      }

      if (res.data.success === false || res.data.error) {
        return replyImg(
          sock,
          from,
          msg,
          '❌ ' + (res.data.error || res.data.message || 'Upload failed')
        );
      }

      const full = res.data.url_full || res.data.url || res.data.link || null;
      const short = res.data.url_short || null;
      const size = res.data.size_readable || res.data.size_bytes || '?';
      const name = res.data.name || filename;
      const id = res.data.file_id || '';

      if (!full && !short) {
        return replyImg(
          sock,
          from,
          msg,
          '❌ No URL in response\n' + JSON.stringify(res.data).slice(0, 300)
        );
      }

      const text =
        '╭───「 💖☁️ *DRGONHOST* 」───╮\n│\n' +
        '│  ✅ *Uploaded*\n' +
        '│  📁 ' +
        name +
        '\n' +
        '│  📦 ' +
        size +
        (id ? '\n│  🆔 ' + id : '') +
        '\n│\n' +
        (full ? '│  🔗 *Full*\n│  ' + full + '\n' : '') +
        (short ? '│  ✨ *Short*\n│  ' + short + '\n' : '') +
        '│\n╰──────────────────────╯';

      await replyImg(sock, from, msg, text);
    } catch (err) {
      console.error('[drgonhost]', err.message);
      await replyImg(sock, from, msg, '❌ `' + err.message + '`');
    }
  },
};
