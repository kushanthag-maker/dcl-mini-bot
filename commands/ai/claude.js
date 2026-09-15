const axios = require('axios');
const config = require('../../config');

const API = 'https://sadewapi.up.railway.app/api/sadew/ai/ai2';
const MODEL = 'claude';
const THUMB = 'https://files.catbox.moe/p9sk8n.webp';
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

function pickAnswer(data) {
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (data.result && typeof data.result === 'string') return data.result;
  if (data.result && typeof data.result === 'object') {
    return (
      data.result.response ||
      data.result.answer ||
      data.result.text ||
      data.result.message ||
      data.result.output ||
      data.result.content ||
      null
    );
  }
  return (
    data.response ||
    data.answer ||
    data.text ||
    data.message ||
    data.output ||
    data.content ||
    data.data ||
    null
  );
}

async function sendGirlReply(sock, from, msg, answer) {
  const caption =
    '╭───「 💖✨ *CLAUDE* 」───╮\n│\n' +
    '│  👑 *Claude AI*\n│\n' +
    '│  🌸 ' +
    String(answer).trim().replace(/\n/g, '\n│  ') +
    '\n│\n' +
    '╰──────────────────────╯' +
    foot();

  try {
    await sock.sendMessage(
      from,
      { image: { url: THUMB }, caption },
      { quoted: msg }
    );
  } catch (e) {
    await sock.sendMessage(from, { text: caption }, { quoted: msg });
  }
}

module.exports = {
  name: 'claude',
  aliases: ['claudeai', 'cld', 'clau'],
  description: 'Chat with Claude AI (girl style + image)',
  category: 'ai',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (!args || !args.length) {
      return sendGirlReply(
        sock,
        from,
        msg,
        'Ask me anything, babe 💕\n\n📌 ' +
          prefix +
          'claude <your question>\n\nExample:\n' +
          prefix +
          'claude who are you?'
      );
    }

    const prompt = args.join(' ').trim();

    const loading = await sock.sendMessage(
      from,
      {
        image: { url: THUMB },
        caption:
          '╭───「 💖✨ *CLAUDE* 」───╮\n│\n' +
          '│  💭 *Thinking for you...*\n' +
          '│  🌸 Please wait\n│\n' +
          '╰──────────────────────╯' +
          foot(),
      },
      { quoted: msg }
    );

    try {
      const res = await axios.get(API, {
        params: { model: MODEL, prompt },
        timeout: 120000,
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        validateStatus: () => true,
      });

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (res.status !== 200) {
        const err =
          (res.data && (res.data.error || res.data.message)) ||
          'HTTP ' + res.status;
        return sendGirlReply(sock, from, msg, '❌ ' + String(err));
      }

      if (res.data && res.data.success === false) {
        return sendGirlReply(
          sock,
          from,
          msg,
          '❌ ' + (res.data.error || res.data.message || 'API failed')
        );
      }

      let answer = pickAnswer(res.data);
      if (answer && typeof answer === 'object') {
        answer = JSON.stringify(answer, null, 2);
      }
      if (!answer || !String(answer).trim()) {
        answer = '🥺 No reply from Claude… try again';
      }

      const full = String(answer).trim();

      if (full.length <= 900) {
        return sendGirlReply(sock, from, msg, full);
      }

      // long reply
      await sendGirlReply(sock, from, msg, full.slice(0, 900) + '…');
      for (let i = 900; i < full.length; i += 3500) {
        const chunk = full.slice(i, i + 3500);
        await sock.sendMessage(
          from,
          {
            text:
              '╭───「 💖 *CLAUDE* 」───╮\n│\n│  ' +
              chunk.replace(/\n/g, '\n│  ') +
              '\n│\n╰──────────────────────╯' +
              foot(),
          },
          { quoted: msg }
        );
      }
    } catch (err) {
      console.error('[claude]', err.message);
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      return sendGirlReply(sock, from, msg, '❌ ' + err.message);
    }
  },
};
