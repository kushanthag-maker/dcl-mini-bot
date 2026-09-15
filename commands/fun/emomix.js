const axios = require('axios');
const config = require('../../config');

const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const MIX_API = 'https://emojik.vercel.app/s';

function foot() {
  return (
    `\n🌸💕 *Pair:* ${SITE}\n` +
    `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`
  );
}

/** Extract emoji graphemes (handles ZWJ / skin tones) */
function extractEmojis(text) {
  if (!text) return [];
  const cleaned = String(text)
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Prefer Unicode emoji property if available
  try {
    const re = /\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
    const found = cleaned.match(re);
    if (found && found.length) return found;
  } catch (_) {}
  // Fallback: split by spaces and filter non-ascii-ish tokens
  return cleaned
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s && /[^\x00-\x7F]/.test(s));
}

function toCodePoints(emoji) {
  return Array.from(emoji)
    .map((c) => c.codePointAt(0).toString(16))
    .join('-');
}

module.exports = {
  name: 'emomix',
  aliases: ['emojimix', 'mixemoji', 'emix'],
  description: 'Mix two emojis into one sticker image',
  category: 'fun',

  async execute({ sock, msg, from, args, body }) {
    const prefix = config.prefix || '.';

    // args may already strip command; also parse from body
    let raw = (args || []).join(' ').trim();
    if (!raw && body) {
      raw = String(body)
        .replace(new RegExp('^\\' + prefix + 'emomix\\s*', 'i'), '')
        .replace(new RegExp('^\\' + prefix + 'emojimix\\s*', 'i'), '')
        .replace(new RegExp('^\\' + prefix + 'mixemoji\\s*', 'i'), '')
        .replace(new RegExp('^\\' + prefix + 'emix\\s*', 'i'), '')
        .trim();
    }

    const emojis = extractEmojis(raw);

    if (emojis.length < 2) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 💖✨ *EMOMIX* 」───╮\n│\n` +
            `│  Mix *2* emojis together\n│\n` +
            `│  📌 Usage:\n` +
            `│  ${prefix}emomix 🥺 😂\n` +
            `│  ${prefix}emomix 😍 + 😂\n` +
            `│  ${prefix}emomix 😘🥰\n│\n` +
            `│  🌸 Cute sticker for you\n` +
            `╰──────────────────────╯` +
            foot(),
        },
        { quoted: msg }
      );
    }

    const e1 = emojis[0];
    const e2 = emojis[1];

    const loading = await sock.sendMessage(
      from,
      { text: `🧪💕 Mixing ${e1} + ${e2}...` },
      { quoted: msg }
    );

    // Try emoji chars first, then codepoints
    const candidates = [
      `${MIX_API}/${encodeURIComponent(e1)}_${encodeURIComponent(e2)}?size=256`,
      `${MIX_API}/${toCodePoints(e1)}_${toCodePoints(e2)}?size=256`,
      // reverse order sometimes exists when forward doesn't
      `${MIX_API}/${encodeURIComponent(e2)}_${encodeURIComponent(e1)}?size=256`,
      `${MIX_API}/${toCodePoints(e2)}_${toCodePoints(e1)}?size=256`,
    ];

    let buffer = null;
    let usedUrl = null;

    for (const url of candidates) {
      try {
        const res = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 25000,
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/png,*/*' },
          validateStatus: () => true,
          maxContentLength: 5 * 1024 * 1024,
        });
        if (
          res.status === 200 &&
          res.data &&
          res.data.byteLength > 500 &&
          (String(res.headers['content-type'] || '').includes('image') ||
            Buffer.from(res.data).slice(0, 8).toString('hex').startsWith('89504e47'))
        ) {
          buffer = Buffer.from(res.data);
          usedUrl = url;
          break;
        }
      } catch (_) {}
    }

    if (!buffer) {
      return sock.sendMessage(from, {
        text:
          `🥺 No mix found for ${e1} + ${e2}\n` +
          `Try different emojis, babe` +
          foot(),
        edit: loading.key,
      });
    }

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    const caption =
      `╭───「 💖✨ *EMOMIX* 」───╮\n│\n` +
      `│  ${e1}  +  ${e2}\n` +
      `│  🌸 Mixed just for you\n│\n` +
      `╰──────────────────────╯` +
      foot();

    try {
      // Prefer sticker (like screenshot style)
      await sock.sendMessage(
        from,
        {
          sticker: buffer,
        },
        { quoted: msg }
      );
      // also send image + caption for clarity
      await sock.sendMessage(
        from,
        {
          image: buffer,
          caption,
        },
        { quoted: msg }
      );
    } catch (err) {
      try {
        await sock.sendMessage(
          from,
          { image: buffer, caption },
          { quoted: msg }
        );
      } catch (err2) {
        await sock.sendMessage(
          from,
          { text: `❌ \`${err2.message}\`\n🔗 ${usedUrl}` + foot() },
          { quoted: msg }
        );
      }
    }
  },
};
