/**
 * .tnexv1 — T-Nex v1 AI
 * ONLY: .tnexv1 <prompt>
 * No image replies
 */
const axios = require('axios');
const config = require('../../config');

const API = 'https://tobi-apisiii-production.up.railway.app/api/thenux/t-nex-v1';
const API_KEY = 'tobi_live_4a3b3434c3161294b477ff28';

async function askTnex(prompt) {
  const res = await axios.get(API, {
    params: {
      prompt: String(prompt),
      apikey: API_KEY,
    },
    timeout: 90000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DarkQueenBot/2.0',
    },
    validateStatus: function () {
      return true;
    },
  });

  if (res.status !== 200) {
    throw new Error('HTTP ' + res.status);
  }

  const data = res.data;
  if (!data || data.success === false) {
    throw new Error(
      (data && (data.message || data.error || data.msg)) || 'API error'
    );
  }

  const answer =
    data.reply ||
    data.result ||
    data.response ||
    data.message ||
    data.answer ||
    (typeof data === 'string' ? data : null);

  if (!answer || !String(answer).trim()) {
    throw new Error('Empty reply from T-Nex v1');
  }

  return {
    text: String(answer).trim(),
    model: data.model || 'T-Nex v1',
    ms: data.durationMs || null,
    quota: data._quota || null,
  };
}

module.exports = {
  name: 'tnexv1',
  aliases: [],
  description: 'T-Nex v1 AI chat',
  category: 'ai',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    const prompt = (args || []).join(' ').trim();

    if (!prompt) {
      return sock.sendMessage(
        from,
        {
          text:
            '╭───「 ⚡ *T-NEX V1* 」───╮\n' +
            '│\n' +
            '│  Usage:\n' +
            '│  `' +
            prefix +
            'tnexv1 <question>`\n' +
            '│\n' +
            '│  Example:\n' +
            '│  `' +
            prefix +
            'tnexv1 hello`\n' +
            '│\n' +
            '│  Model: *T-Nex v1*\n' +
            '╰──────────────────────╯',
        },
        { quoted: msg }
      );
    }

    try {
      await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } });
    } catch (_) {}

    const loading = await sock
      .sendMessage(from, { text: '⏳ *T-Nex v1 thinking…*' }, { quoted: msg })
      .catch(function () {
        return null;
      });

    try {
      const result = await askTnex(prompt);

      let meta = 'Model: *' + result.model + '*';
      if (result.ms) meta += ' · ' + result.ms + 'ms';
      if (result.quota && result.quota.requestsRemaining != null) {
        meta += '\n│ Quota left: *' + result.quota.requestsRemaining + '*';
      }

      const text =
        '╭───「 ⚡ *T-NEX V1* 」───╮\n\n' +
        result.text +
        '\n\n' +
        '╰─ ' +
        meta +
        '\n\n> ✦ DARK QUEEN OFC ✦';

      if (loading && loading.key) {
        try {
          await sock.sendMessage(from, { delete: loading.key });
        } catch (_) {}
      }

      await sock.sendMessage(from, { text: text }, { quoted: msg });
      try {
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      } catch (_) {}
    } catch (err) {
      console.error('[tnexv1]', err.message);
      const errText = '❌ *T-Nex v1 fail*\n\n`' + (err.message || 'Unknown') + '`';
      if (loading && loading.key) {
        try {
          await sock.sendMessage(from, { text: errText, edit: loading.key });
        } catch (_) {
          await sock.sendMessage(from, { text: errText }, { quoted: msg }).catch(function () {});
        }
      } else {
        await sock.sendMessage(from, { text: errText }, { quoted: msg }).catch(function () {});
      }
      try {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      } catch (_) {}
    }
  },
};
