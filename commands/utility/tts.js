const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const config = require('../../config');

const API_URL = 'https://whiteshadow-x-api.onrender.com/api/tools/tts';
const API_TOKEN = 'CkExxE';
const MAX_WA_BYTES = 16 * 1024 * 1024;

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

/** MP3 → OGG Opus (WhatsApp voice-note compatible) */
async function toOpus(mp3Buffer) {
  const tmp = os.tmpdir();
  const inFile = path.join(tmp, `tts_in_${Date.now()}.mp3`);
  const outFile = path.join(tmp, `tts_out_${Date.now()}.ogg`);
  try {
    fs.writeFileSync(inFile, mp3Buffer);
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i', inFile,
        '-c:a', 'libopus',
        '-b:a', '64k',
        '-vbr', 'on',
        '-compression_level', '10',
        '-frame_duration', '60',
        '-application', 'voip',
        outFile,
      ],
      { timeout: 60000 }
    );
    return fs.readFileSync(outFile);
  } finally {
    try { fs.unlinkSync(inFile); } catch (_) {}
    try { fs.unlinkSync(outFile); } catch (_) {}
  }
}

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
│  🌐 default lang: *si*
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    let lang = 'si';
    let text = args.join(' ').trim();

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
        params: { text, lang, apitoken: API_TOKEN },
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
      const mp3Buffer = Buffer.from(res.data || []);

      if (
        res.status !== 200 ||
        ct.includes('application/json') ||
        ct.includes('text/html') ||
        mp3Buffer.length < 500
      ) {
        let msgErr = `HTTP ${res.status}`;
        try {
          const j = JSON.parse(mp3Buffer.toString('utf8'));
          msgErr = j.message || j.error || j.msg || msgErr;
        } catch (_) {}
        throw new Error(msgErr);
      }

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // 1) Prefer Opus voice note (WhatsApp native ptt format)
      let sent = false;
      try {
        const opus = await toOpus(mp3Buffer);
        if (opus && opus.length > 200) {
          await sock.sendMessage(
            from,
            {
              audio: opus,
              mimetype: 'audio/ogg; codecs=opus',
              ptt: true,
            },
            { quoted: msg }
          );
          sent = true;
        }
      } catch (e) {
        console.error('TTS opus convert fail:', e.message);
      }

      // 2) Fallback: normal MP3 audio (not voice-note) — always plays
      if (!sent) {
        try {
          await sock.sendMessage(
            from,
            {
              audio: mp3Buffer,
              mimetype: 'audio/mpeg',
              ptt: false,
              fileName: `tts-${lang}.mp3`,
            },
            { quoted: msg }
          );
          sent = true;
        } catch (e2) {
          console.error('TTS mp3 send fail:', e2.message);
        }
      }

      // 3) Last resort: document
      if (!sent) {
        await sock.sendMessage(
          from,
          {
            document: mp3Buffer,
            mimetype: 'audio/mpeg',
            fileName: `tts-${lang}.mp3`,
            caption: '🔊 TTS audio',
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
