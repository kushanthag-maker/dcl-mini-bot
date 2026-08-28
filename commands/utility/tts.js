const axios = require('axios');
const config = require('../../config');

const API_URL = 'https://whiteshadow-x-api.onrender.com/api/tools/tts';
const API_TOKEN = 'CkExxE';
const MAX_WA_BYTES = 16 * 1024 * 1024;

// Common language codes
const LANGS = {
  si: 'Sinhala',
  en: 'English',
  ta: 'Tamil',
  hi: 'Hindi',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  id: 'Indonesian',
  ms: 'Malay',
  th: 'Thai',
};

module.exports = {
  name: 'tts',
  aliases: ['say', 'speak', 'voice'],
  description: 'Text to speech (Sinhala / multi-lang)',
  category: 'tools',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🔊 *TTS* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}tts <text>
│  ${prefix}tts <lang> <text>
│
│  📌 *Example:*
│  ${prefix}tts ඔයාට කොහොමද මචං?
│  ${prefix}tts en Hello how are you
│  ${prefix}tts si ආයුබෝවන්
│
│  🌐 *Lang codes:*
│  si en ta hi ja ko zh ar es fr ...
│  (default: *si*)
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    let lang = 'si';
    let text = args.join(' ').trim();

    // .tts en Hello world  OR  .tts si ආයුබෝවන්
    if (args.length >= 2 && /^[a-z]{2}$/i.test(args[0])) {
      lang = args[0].toLowerCase();
      text = args.slice(1).join(' ').trim();
    }

    if (!text) {
      return sock.sendMessage(
        from,
        { text: `❌ Text එකක් දෙන්න.\n💡 ${prefix}tts ඔයාට කොහොමද` },
        { quoted: msg }
      );
    }

    if (text.length > 500) {
      return sock.sendMessage(
        from,
        { text: '❌ Text ගොඩක් දිගයි (max 500 chars).' },
        { quoted: msg }
      );
    }

    const loading = await sock.sendMessage(
      from,
      { text: `🔊 *TTS...*\n🌐 ${LANGS[lang] || lang}` },
      { quoted: msg }
    );

    try {
      const res = await axios.get(API_URL, {
        params: {
          text,
          lang,
          apitoken: API_TOKEN,
        },
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: MAX_WA_BYTES,
        maxBodyLength: MAX_WA_BYTES,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'audio/mpeg,audio/*,*/*',
        },
      });

      const ct = String(res.headers?.['content-type'] || '').toLowerCase();
      const buffer = Buffer.from(res.data || []);

      // JSON error?
      if (
        res.status !== 200 ||
        ct.includes('application/json') ||
        ct.includes('text/html') ||
        buffer.length < 500
      ) {
        let msgErr = `HTTP ${res.status}`;
        try {
          const j = JSON.parse(buffer.toString('utf8'));
          msgErr = j.message || j.error || j.msg || msgErr;
        } catch (_) {}
        throw new Error(msgErr);
      }

      // ID3 / MPEG check
      const isMp3 =
        (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) ||
        ct.includes('audio');

      if (!isMp3 && !ct.includes('audio')) {
        throw new Error('Invalid audio response');
      }

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      const fileName = `tts-${lang}.mp3`;

      try {
        // ptt: true = voice note style (nice for TTS)
        await sock.sendMessage(
          from,
          {
            audio: buffer,
            mimetype: 'audio/mpeg',
            ptt: true,
            fileName,
          },
          { quoted: msg }
        );
      } catch (e1) {
        console.error('TTS ptt fail:', e1.message);
        await sock.sendMessage(
          from,
          {
            audio: buffer,
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName,
          },
          { quoted: msg }
        );
      }
    } catch (err) {
      console.error('TTS Error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ TTS fail.\n\n\`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
