const axios = require('axios');
const config = require('../../config');

const API_URL = 'https://whiteshadow-x-api.onrender.com/api/ai/llama4';
const API_TOKEN = 'CkExxE';

module.exports = {
  name: 'llama',
  aliases: ['llama4', 'scout'],
  description: 'Chat with Llama 4 AI',
  category: 'ai',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🦙 *LLAMA 4* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}llama <your question>
│
│  📌 *Example:*
│  ${prefix}llama hi who are you
│  ${prefix}llama write a poem
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    await sock.sendMessage(from, { react: { text: '🦙', key: msg.key } }).catch(() => {});

    const loading = await sock.sendMessage(
      from,
      { text: '🦙 *Llama 4 thinking...*' },
      { quoted: msg }
    );

    try {
      const res = await axios.get(API_URL, {
        params: {
          q: query,
          apitoken: API_TOKEN,
        },
        timeout: 120000,
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
      if (data.success === false || data.status === false) {
        throw new Error(data.message || data.error || 'API error');
      }

      const result = data.result || data.data || data;
      const answer =
        (typeof result === 'object'
          ? result.response || result.reply || result.text || result.message
          : null) ||
        data.response ||
        data.reply ||
        (typeof data.result === 'string' ? data.result : null);

      if (!answer || !String(answer).trim()) {
        throw new Error('Empty response from Llama 4');
      }

      const model =
        (typeof result === 'object' && result.model) || 'Llama 4 Scout 17B';

      const text =
        `╭───「 🦙 *LLAMA 4* 」───╮\n\n` +
        `${String(answer).trim()}\n\n` +
        `│  🤖 *Model* ›  ${model}\n` +
        `╰──────────────────────╯`;

      try {
        await sock.sendMessage(from, { text, edit: loading.key });
      } catch (_) {
        await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
        await sock.sendMessage(from, { text }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (err) {
      console.error('Llama Error:', err.message);
      const errText = `❌ *Llama 4 fail*\n\n\`${err.message}\``;
      try {
        await sock.sendMessage(from, { text: errText, edit: loading.key });
      } catch (_) {
        await sock.sendMessage(from, { text: errText }, { quoted: msg }).catch(() => {});
      }
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
    }
  },
};
