const config = require('../../config');

const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';

function digits(n) {
  return String(n || '').replace(/[^0-9]/g, '');
}

function toJid(input, currentFrom) {
  if (!input) return null;
  const s = String(input).trim();

  // already jid
  if (s.includes('@g.us') || s.includes('@s.whatsapp.net') || s.includes('@lid')) {
    return s;
  }

  // group invite style skip
  const d = digits(s);
  if (!d) return null;

  // Sri Lanka local 07xxxxxxxx → 947xxxxxxxx
  let num = d;
  if (num.startsWith('0') && num.length === 10) {
    num = '94' + num.slice(1);
  }

  return num + '@s.whatsapp.net';
}

function getQuoted(msg) {
  const m = msg.message || {};
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.buttonsResponseMessage?.contextInfo ||
    m.listResponseMessage?.contextInfo ||
    m.templateButtonReplyMessage?.contextInfo ||
    {};

  if (!ctx || !ctx.quotedMessage) return null;

  return {
    key: {
      remoteJid: msg.key.remoteJid,
      fromMe: Boolean(ctx.participant ? false : msg.key.fromMe),
      id: ctx.stanzaId,
      participant: ctx.participant || undefined,
    },
    message: ctx.quotedMessage,
  };
}

function detectType(quotedMsg) {
  if (!quotedMsg) return 'unknown';
  if (quotedMsg.imageMessage) return 'image';
  if (quotedMsg.videoMessage) return 'video';
  if (quotedMsg.documentMessage) return 'document';
  if (quotedMsg.audioMessage) return 'audio';
  if (quotedMsg.stickerMessage) return 'sticker';
  if (quotedMsg.conversation || quotedMsg.extendedTextMessage) return 'text';
  return 'media';
}

module.exports = {
  name: 'forward',
  aliases: ['fo', 'fwd', 'sv', 'send'],
  description: 'Forward replied movie/media to chat or number',
  category: 'utility',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    const quoted = getQuoted(msg);

    if (!quoted) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 📤 *𝐅𝐎𝐑𝐖𝐀𝐑𝐃* 」───╮\n│\n` +
            `│  ❌ *Reply* to a message first\n│\n` +
            `│  📌 *Usage:*\n` +
            `│  reply + ${prefix}forward\n` +
            `│  reply + ${prefix}forward 9477xxxxxxx\n` +
            `│  reply + ${prefix}forward <group jid>\n│\n` +
            `│  🎬 Movie / video / document\n` +
            `│  🖼 Image / audio / sticker\n│\n` +
            `╰──────────────────────╯\n` +
            `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`,
        },
        { quoted: msg }
      );
    }

    // target: arg number/jid OR current chat
    let target = from;
    if (args.length) {
      const jid = toJid(args.join(' ').trim(), from);
      if (!jid) {
        return sock.sendMessage(
          from,
          {
            text:
              `❌ Invalid number / jid\n💡 \`${prefix}forward 94771234567\`` +
              `\n> ✦ ${FOOTER} ✦`,
          },
          { quoted: msg }
        );
      }
      target = jid;
    }

    const type = detectType(quoted.message);
    const loading = await sock.sendMessage(
      from,
      { text: `📤✨ *𝐅𝐨𝐫𝐰𝐚𝐫𝐝𝐢𝐧𝐠 ${type}...*` },
      { quoted: msg }
    );

    const where =
      target === from
        ? '𝐭𝐡𝐢𝐬 𝐜𝐡𝐚𝐭'
        : target.replace('@s.whatsapp.net', '').replace('@g.us', ' (group)');

    try {
      // 1) Native forward (best for movies / documents)
      await sock.sendMessage(target, { forward: quoted });
    } catch (err1) {
      console.error('Forward native fail:', err1.message);
      // 2) Fallback: re-upload buffer via downloadMediaMessage
      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(
          quoted,
          'buffer',
          {},
          { logger: console, reuploadRequest: sock.updateMediaMessage }
        );
        const q = quoted.message;
        if (q.imageMessage) {
          await sock.sendMessage(target, {
            image: buffer,
            caption: q.imageMessage.caption || '',
            mimetype: q.imageMessage.mimetype || 'image/jpeg',
          });
        } else if (q.videoMessage) {
          await sock.sendMessage(target, {
            video: buffer,
            caption: q.videoMessage.caption || '',
            mimetype: q.videoMessage.mimetype || 'video/mp4',
          });
        } else if (q.documentMessage) {
          await sock.sendMessage(target, {
            document: buffer,
            mimetype: q.documentMessage.mimetype || 'application/octet-stream',
            fileName: q.documentMessage.fileName || 'file',
            caption: q.documentMessage.caption || '',
          });
        } else if (q.audioMessage) {
          await sock.sendMessage(target, {
            audio: buffer,
            mimetype: q.audioMessage.mimetype || 'audio/ogg; codecs=opus',
            ptt: !!q.audioMessage.ptt,
          });
        } else if (q.stickerMessage) {
          await sock.sendMessage(target, { sticker: buffer });
        } else if (q.conversation || q.extendedTextMessage) {
          const text =
            q.conversation || q.extendedTextMessage?.text || '';
          await sock.sendMessage(target, { text });
        } else {
          throw err1;
        }
      } catch (err2) {
        console.error('Forward fallback fail:', err2.message);
        await sock
          .sendMessage(from, {
            text:
              `❌ *𝐅𝐨𝐫𝐰𝐚𝐫𝐝 𝐟𝐚𝐢𝐥*\n\n\`${err1.message}\`\n\n` +
              `💡 Reply to the media message again.` +
              `\n> ✦ ${FOOTER} ✦`,
            edit: loading.key,
          })
          .catch(() => {});
        return;
      }
    }

    await sock
      .sendMessage(from, {
        text:
          `╭───「 ✅ *𝐅𝐎𝐑𝐖𝐀𝐑𝐃𝐄𝐃* 」───╮\n│\n` +
          `│  📁 *Type*   ›  ${type}\n` +
          `│  📍 *To*     ›  ${where}\n│\n` +
          `╰──────────────────────╯\n` +
          `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`,
        edit: loading.key,
      })
      .catch(async () => {
        await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
        await sock.sendMessage(
          from,
          {
            text: `✅ *Forwarded* · ${type}\n📍 ${where}\n> ✦ ${FOOTER} ✦`,
          },
          { quoted: msg }
        );
      });
  },
};
