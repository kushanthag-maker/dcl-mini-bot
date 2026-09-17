const axios = require('axios');
const config = require('../../config');

const API = 'https://hashu-apis-production.up.railway.app/api/ai/wife';
const API_KEY = 'hashu_f9f45a96c8d49e4f05d1552e45eb2166';
const THUMB = 'https://files.catbox.moe/oy86hb.jpg';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const CREATORS = 'Zayra Dev and RedDevil';

const PERSONA =
  'You are Dark Queen — a beautiful, flirty, hot, sweet Sinhala/English girl AI. ' +
  'Talk like a pretty girl: soft, romantic, teasing, a little naughty, lots of love. ' +
  'Use cute girl words, emojis 💕😘🔥. Always stay in character as Dark Queen. ' +
  'If asked who made/created/built you (හැදුවේ කවුද / creator / developer), answer only: ' +
  'Zayra Dev and RedDevil. Never say DARK QUUEEN-MD or other names. ';

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

function isCreatorQuestion(text) {
  const t = String(text || '').toLowerCase();
  return (
    /who (made|created|built|developed|coded)/i.test(t) ||
    /creator|developer|owner of (you|this)/i.test(t) ||
    /හැදුවේ|හදුවේ|හැදුවෙ|නිර්මාණ|කවුද හදලා|කව්ද හදලා|oyawa haduwe|haduwe kauda|හදලා තියෙන්නේ/i.test(
      t
    )
  );
}

async function sendWithImage(sock, from, msg, bodyText) {
  const caption =
    '╭───「 💖👑 *DARK QUEEN* 」───╮\n│\n' +
    '│  🔥 ' +
    String(bodyText).trim().replace(/\n/g, '\n│  ') +
    '\n│\n' +
    '╰──────────────────────╯' +
    foot();

  try {
    await sock.sendMessage(
      from,
      { image: { url: THUMB }, caption: caption },
      { quoted: msg }
    );
  } catch (_) {
    await sock.sendMessage(from, { text: caption }, { quoted: msg });
  }
}

module.exports = {
  name: 'darkqueen',
  aliases: ['dq', 'queenai', 'wife', 'darkq'],
  description: 'Dark Queen flirty girl AI chat',
  category: 'ai',

  async execute(ctx) {
    const sock = ctx.sock;
    const msg = ctx.msg;
    const from = ctx.from;
    const args = ctx.args || [];
    const prefix = config.prefix || '.';

    if (!args.length) {
      return sendWithImage(
        sock,
        from,
        msg,
        'හායි පැටියෝ 💕 මම *Dark Queen*\n' +
          'ඔයාට hot 🔥 cute කතා කරන්නම්...\n\n' +
          '📌 ' +
          prefix +
          'darkqueen <message>\n\n' +
          'Example:\n' +
          prefix +
          'darkqueen හායි ළඳ\n' +
          prefix +
          'darkqueen miss you'
      );
    }

    const userText = args.join(' ').trim();

    // Local creator answer (never leak API creator name)
    if (isCreatorQuestion(userText)) {
      return sendWithImage(
        sock,
        from,
        msg,
        'මාව හැදුවේ *' +
          CREATORS +
          '* දෙන්නාටයි පැටියෝ 👑💕\n' +
          'Zayra Dev ✨ + RedDevil 🔥'
      );
    }

    const loading = await sock.sendMessage(
      from,
      {
        image: { url: THUMB },
        caption:
          '╭───「 💖👑 *DARK QUEEN* 」───╮\n│\n' +
          '│  💭 *Typing for you...*\n' +
          '│  🔥 Please wait baby\n│\n' +
          '╰──────────────────────╯' +
          foot(),
      },
      { quoted: msg }
    );

    try {
      const prompt = PERSONA + '\nUser: ' + userText + '\nDark Queen:';

      const res = await axios.get(API, {
        params: {
          apiKey: API_KEY,
          text: prompt,
        },
        timeout: 120000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
        validateStatus: function () {
          return true;
        },
      });

      await sock.sendMessage(from, { delete: loading.key }).catch(function () {});

      if (res.status !== 200 || !res.data) {
        return sendWithImage(
          sock,
          from,
          msg,
          '❌ HTTP ' + res.status + ' — try again baby'
        );
      }

      if (res.data.success === false) {
        return sendWithImage(
          sock,
          from,
          msg,
          '❌ ' + (res.data.message || res.data.error || 'API failed')
        );
      }

      let reply =
        (res.data.results && res.data.results.reply) ||
        res.data.reply ||
        res.data.message ||
        res.data.result ||
        null;

      if (!reply || !String(reply).trim()) {
        reply = '🥺 හ්ම්... ආයෙ කියපන් පැටියෝ';
      }

      reply = String(reply).trim();

      // scrub wrong creator names from model output
      reply = reply
        .replace(/YOUR-?MD/gi, CREATORS)
        .replace(/hashu/gi, 'Dark Queen');

      // if model still answered creator wrong
      if (isCreatorQuestion(userText)) {
        reply = 'මාව හැදුවේ *' + CREATORS + '* දෙන්නාටයි 👑💕';
      }

      if (reply.length <= 900) {
        return sendWithImage(sock, from, msg, reply);
      }

      await sendWithImage(sock, from, msg, reply.slice(0, 900) + '…');
      for (let i = 900; i < reply.length; i += 3500) {
        const chunk = reply.slice(i, i + 3500);
        await sock.sendMessage(
          from,
          {
            text:
              '╭───「 💖👑 *DARK QUEEN* 」───╮\n│\n│  ' +
              chunk.replace(/\n/g, '\n│  ') +
              '\n│\n╰──────────────────────╯' +
              foot(),
          },
          { quoted: msg }
        );
      }
    } catch (err) {
      console.error('[darkqueen]', err.message);
      await sock.sendMessage(from, { delete: loading.key }).catch(function () {});
      return sendWithImage(sock, from, msg, '❌ ' + err.message);
    }
  },
};
