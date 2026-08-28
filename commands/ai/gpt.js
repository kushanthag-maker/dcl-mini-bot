const axios = require('axios');
const config = require('../../config');

const API_URL = 'https://whiteshadow-x-api.onrender.com/api/ai/gpt-5-4-mini';
const API_TOKEN = 'CkExxE';

module.exports = {
  name: 'gpt',
  aliases: ['chatgpt', 'openai'],
  description: 'Chat with GPT AI',
  category: 'ai',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🤖 *GPT* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}gpt <your question>
│
│  📌 *Example:*
│  ${prefix}gpt hi
│  ${prefix}gpt write a poem
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } }).catch(() => {});

    const loading = await sock.sendMessage(
      from,
      { text: '🤖 *GPT thinking...*' },
      { quoted: msg }
    );

    try {
      const res = await axios.get(API_URL, {
        params: {
          q: query,
          apitoken: API_TOKEN,
        },
        timeout: 90000,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (res.status !== 200 || !res.data) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = res.data;
      if (data.status === false || data.success === false) {
        throw new Error(data.message || data.error || 'API error');
      }

      const answer =
        data.result ||
        data.response ||
        data.message ||
        data.answer ||
        data.data ||
        (typeof data === 'string' ? data : null);

      if (!answer || (typeof answer === 'string' && !answer.trim())) {
        throw new Error('Empty response from GPT');
      }

      const text =
        `╭───「 🤖 *GPT* 」───╮\n\n` +
        `${String(answer).trim()}\n\n` +
        `╰──────────────────────╯`;

      try {
        await sock.sendMessage(from, { text, edit: loading.key });
      } catch (_) {
        await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
        await sock.sendMessage(from, { text }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (err) {
      console.error('GPT Error:', err.message);
      const errText = `❌ *GPT fail*\n\n\`${err.message}\``;
      try {
        await sock.sendMessage(from, { text: errText, edit: loading.key });
      } catch (_) {
        await sock.sendMessage(from, { text: errText }, { quoted: msg }).catch(() => {});
      }
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
    }
  },
};
