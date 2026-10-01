/**
 * .claude — Thenux AI (Claude 3.5 Sonnet)
 * Only responds to: .claude <prompt>
 * API: https://tobi-apisiii.vercel.app/api/thenux/chat
 */
const axios = require('axios');

const API = 'https://tobi-apisiii.vercel.app/api/thenux/chat';
const MODEL = 'Claude 3.5 Sonnet';
const THUMB = 'https://files.catbox.moe/ti2zgx.webp';
const FOOTER = 'DARK QUEEN OFC · Claude AI';

async function replyWithImage(sock, from, msg, text) {
  const caption = String(text) + '\n\n> ✦ ' + FOOTER + ' ✦';
  try {
    await sock.sendMessage(
      from,
      { image: { url: THUMB }, caption },
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

async function askClaude(prompt) {
  const res = await axios.get(API, {
    params: { prompt: prompt, model: MODEL },
    timeout: 90000,
    headers: {
      'User-Agent': 'Mozilla/5.0 DarkQueenBot',
      Accept: 'application/json',
    },
    validateStatus: () => true,
  });

  if (res.status !== 200) {
    throw new Error('HTTP ' + res.status);
  }

  const data = res.data;
  if (!data || data.success === false) {
    throw new Error((data && (data.message || data.error)) || 'API error');
  }

  const answer =
    data.reply ||
    data.result ||
    data.response ||
    data.message ||
    data.answer ||
    null;

  if (!answer || !String(answer).trim()) {
    throw new Error('Empty reply from Claude');
  }

  return {
    text: String(answer).trim(),
    ms: data.durationMs || null,
    model: data.model || MODEL,
  };
}

module.exports = {
  name: 'claude',
  aliases: [],
  description: 'Claude 3.5 Sonnet AI chat',
  category: 'ai',

  async execute({ sock, msg, from, args }) {
    const prompt = (args || []).join(' ').trim();

    if (!prompt) {
      return replyWithImage(
        sock,
        from,
        msg,
        '╭───「 🤖 *CLAUDE AI* 」───╮\n\n' +
          'Usage:\n' +
          '• `.claude your question`\n\n' +
          'Model: *Claude 3.5 Sonnet*\n' +
          '╰──────────────────────╯'
      );
    }

    try {
      await sock.sendMessage(from, { react: { text: '💭', key: msg.key } }).catch(() => {});
    } catch (_) {}

    let loading;
    try {
      loading = await sock.sendMessage(
        from,
        { text: '⏳ *Claude thinking…*' },
        { quoted: msg }
      );
    } catch (_) {}

    try {
      const result = await askClaude(prompt);
      const text =
        '╭───「 🤖 *CLAUDE AI* 」───╮\n\n' +
        result.text +
        '\n\n' +
        '╰─ Model: *' +
        result.model +
        '*' +
        (result.ms ? ' · ' + result.ms + 'ms' : '') +
        '\n';

      if (loading) {
        try {
          await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
        } catch (_) {}
      }

      await replyWithImage(sock, from, msg, text);
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (err) {
      console.error('Claude Error:', err.message);
      const errText = '❌ *Claude AI fail*\n\n`' + (err.message || 'Unknown') + '`';
      if (loading) {
        try {
          await sock.sendMessage(from, { text: errText, edit: loading.key });
        } catch (_) {
          await sock.sendMessage(from, { text: errText }, { quoted: msg }).catch(() => {});
        }
      } else {
        await sock.sendMessage(from, { text: errText }, { quoted: msg }).catch(() => {});
      }
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
    }
  },
};
