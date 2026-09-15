const axios = require('axios');
const config = require('../../config');

const API = 'https://sadewapi.up.railway.app/api/sadew/other/wa-reaction';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';

function foot() {
  return (
    `\n🌸💕 *Pair:* ${SITE}\n` +
    `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`
  );
}

function isWaLink(s) {
  if (!s) return false;
  return /whatsapp\.com\/channel\//i.test(s) || /wa\.me\//i.test(s);
}

function extractEmojis(text) {
  if (!text) return [];
  try {
    const re = /\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
    const found = String(text).match(re);
    if (found && found.length) return [...new Set(found)];
  } catch (_) {}
  return [];
}

module.exports = {
  name: 'react',
  aliases: ['wareact', 'chreact', 'creact'],
  description: 'React to a WhatsApp channel post via Sadew API',
  category: 'utility',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (!args || !args.length) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 💖✨ *REACT* 」───╮\n│\n` +
            `│  React to a *channel post*\n│\n` +
            `│  📌 Usage:\n` +
            `│  ${prefix}react <link> <emoji>\n` +
            `│  ${prefix}react <emoji> <link>\n│\n` +
            `│  🌸 Example:\n` +
            `│  ${prefix}react https://whatsapp.com/channel/xxx/123 ❤️\n` +
            `│  ${prefix}react 🔥 https://whatsapp.com/channel/xxx/123\n│\n` +
            `│  💕 Multi emoji:\n` +
            `│  ${prefix}react <link> ❤️🔥😍\n` +
            `╰──────────────────────╯` +
            foot(),
        },
        { quoted: msg }
      );
    }

    const joined = args.join(' ');
    let link = args.find((a) => isWaLink(a)) || null;
    if (!link) {
      const m = joined.match(/https?:\/\/[^\s]+/i);
      if (m) link = m[0];
    }

    let emojis = extractEmojis(joined);
    // also allow plain text token if single non-link arg looks like emoji-ish
    if (!emojis.length) {
      for (const a of args) {
        if (isWaLink(a) || /^https?:\/\//i.test(a)) continue;
        if (a.trim()) emojis.push(a.trim());
      }
    }

    if (!link) {
      return sock.sendMessage(
        from,
        {
          text:
            `❌💕 Channel *post link* required\n` +
            `💡 ${prefix}react <link> ❤️` +
            foot(),
        },
        { quoted: msg }
      );
    }

    if (!emojis.length) {
      emojis = ['❤️'];
    }

    // API takes one emoji param — send first, or join if API accepts multi
    // From sample response emojis is array — try comma / first
    const emojiParam = emojis.join('');

    const loading = await sock.sendMessage(
      from,
      {
        text:
          `💗✨ *Sending reaction...*\n` +
          `🔗 Post link\n` +
          `😊 ${emojis.join(' ')}`,
      },
      { quoted: msg }
    );

    try {
      // If multiple emojis, call API once per emoji (safer)
      const results = [];
      for (const emo of emojis.slice(0, 8)) {
        const res = await axios.get(API, {
          params: { emoji: emo, link },
          timeout: 45000,
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Accept: 'application/json',
          },
          validateStatus: () => true,
        });
        results.push({ emo, status: res.status, data: res.data });
      }

      const okOnes = results.filter(
        (r) =>
          r.status === 200 &&
          r.data &&
          (r.data.success === true || (r.data.result && r.data.result.ok))
      );
      const failOnes = results.filter((r) => !okOnes.includes(r));

      let text =
        `╭───「 💖 *REACT* 」───╮\n│\n` +
        `│  🔗 ${link.slice(0, 60)}${link.length > 60 ? '…' : ''}\n│\n`;

      if (okOnes.length) {
        text += `│  ✅ *Queued / OK*\n`;
        okOnes.forEach((r) => {
          const q = r.data?.result || {};
          text += `│  ${r.emo}  › ${q.message || 'ok'}`;
          if (q.queueNumber != null) text += ` · #${q.queueNumber}`;
          text += `\n`;
        });
        const sample = okOnes[0].data?.result?.data;
        if (sample?.jid) text += `│  📢 ${sample.jid}\n`;
        if (sample?.messageId) text += `│  🆔 msg ${sample.messageId}\n`;
      }

      if (failOnes.length) {
        text += `│\n│  ⚠️ *Failed*\n`;
        failOnes.forEach((r) => {
          const msgErr =
            r.data?.result?.message ||
            r.data?.error ||
            r.data?.message ||
            `HTTP ${r.status}`;
          text += `│  ${r.emo}  › ${String(msgErr).slice(0, 60)}\n`;
        });
      }

      text += `│\n╰──────────────────────╯` + foot();

      await sock.sendMessage(from, { text, edit: loading.key }).catch(async () => {
        await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
        await sock.sendMessage(from, { text }, { quoted: msg });
      });
    } catch (err) {
      console.error('React cmd:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌💔 \`${err.message}\`` + foot(),
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
