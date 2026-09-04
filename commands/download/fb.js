const axios = require('axios');
const config = require('../../config');
const API_BASE = (
  process.env.DARKQUEEN_API_URL ||
  config.darkQueenApiUrl ||
  'https://88b2bf83-c2a2-4ab0-a406-1234b958a45f-00-2305b3iipb2eq.pike.replit.dev'
).replace(/\/+$/, '');

const API_KEY =
  process.env.DARKQUEEN_API_KEY ||
  config.darkQueenApiKey ||
  'dq_live_FkrzHPTYIEl7gv6gTpqrWVXxJeQLrubr';

const RESOLVE_PATH = '/api/facebook/video/resolve';
const MAX_WA_BYTES = 60 * 1024 * 1024;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isFbUrl(text) {
  return /facebook\.com|fb\.watch|fb\.com|fburl\.com|fb\.gg/i.test(String(text || ''));
}

function extractUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:(?:www|m|web|l|lm)\.)?(?:facebook\.com|fb\.watch|fb\.com)\/[^\s]*/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function getQuotedText(msg) {
  const ctx =
    msg?.message?.extendedTextMessage?.contextInfo ||
    msg?.message?.imageMessage?.contextInfo ||
    msg?.message?.videoMessage?.contextInfo ||
    {};
  const q = ctx.quotedMessage;
  if (!q) return '';
  return (
    q.conversation ||
    q.extendedTextMessage?.text ||
    q.imageMessage?.caption ||
    q.videoMessage?.caption ||
    ''
  );
}

function formatDuration(sec) {
  const n = Number(sec);
  if (!n || n < 0 || Number.isNaN(n)) return 'N/A';
  const s = Math.round(n);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

function box(title, lines) {
  const body = lines.map((l) => `*│◊│* ${l}`).join('\n');
  return `*╭──┉❰ ${title} ❱┉──•*
${body}
*│◊╰────────────┉•┉*
*╰──────────────────┉*`;
}

function pickDirectUrl(data) {
  if (!data || typeof data !== 'object') return null;
  const inner = data.data && typeof data.data === 'object' ? data.data : data;
  const candidates = [
    inner.directUrl,
    inner.direct_url,
    inner.hd,
    inner.sd,
    inner.video,
    inner.videoUrl,
    inner.video_url,
    inner.url,
    inner.download,
    inner.download_url,
    inner.link,
    data.directUrl,
    data.result?.directUrl,
    data.result?.hd,
    data.result?.sd,
    data.result?.url,
    data.data?.directUrl,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
  }
  return null;
}

async function resolveFacebook(url) {
  const endpoint = `${API_BASE}${RESOLVE_PATH}`;
  const res = await axios.post(
    endpoint,
    { url },
    {
      timeout: 90000,
      validateStatus: () => true,
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
        Accept: 'application/json',
        'User-Agent': UA,
      },
    }
  );

  const data = res.data;
  if (res.status === 401 || res.status === 403) {
    const err = new Error(data?.error || 'API key invalid / unauthorized');
    err.code = 'AUTH';
    throw err;
  }
  if (res.status === 400) {
    const err = new Error(data?.error || 'Invalid Facebook URL');
    err.code = 'BAD_URL';
    throw err;
  }
  if (res.status !== 200 || !data || typeof data !== 'object') {
    const err = new Error(data?.error || data?.message || `API HTTP ${res.status}`);
    err.code = 'API';
    throw err;
  }
  if (data.success === false || data.status === false) {
    const err = new Error(data.error || data.message || data.msg || 'Resolve failed');
    err.code = 'API';
    throw err;
  }

  const videoUrl = pickDirectUrl(data);
  if (!videoUrl) {
    const err = new Error('Video link හොයාගන්න බැරි වුණා');
    err.code = 'NO_MEDIA';
    throw err;
  }

  const inner = data.data && typeof data.data === 'object' ? data.data : data;
  return {
    videoUrl,
    title: inner.title || data.title || 'Facebook Video',
    uploader: inner.uploader || inner.author || data.uploader || 'Unknown',
    thumbnail: inner.thumbnail || inner.thumb || data.thumbnail || null,
    durationSeconds: inner.durationSeconds || inner.duration || data.durationSeconds || null,
    expiresAt: inner.expiresAt || data.expiresAt || null,
  };
}

async function downloadVideo(videoUrl) {
  const res = await axios.get(videoUrl, {
    responseType: 'arraybuffer',
    timeout: 180000,
    maxContentLength: MAX_WA_BYTES + 8 * 1024 * 1024,
    maxBodyLength: MAX_WA_BYTES + 8 * 1024 * 1024,
    maxRedirects: 8,
    validateStatus: () => true,
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      Referer: 'https://www.facebook.com/',
      Origin: 'https://www.facebook.com',
    },
  });

  const contentType = String(res.headers?.['content-type'] || '').toLowerCase();
  if (
    res.status !== 200 ||
    contentType.includes('text/html') ||
    contentType.includes('application/json')
  ) {
    const err = new Error('Video file ලබාගන්න බැරි වුණා (link expired / blocked)');
    err.code = 'DL';
    throw err;
  }

  const buffer = Buffer.from(res.data || []);
  if (!buffer.length || buffer.length < 5000) {
    const err = new Error('Video file එක empty / invalid');
    err.code = 'DL';
    throw err;
  }
  return { buffer, contentType };
}

async function safeEdit(sock, from, key, text) {
  try {
    await sock.sendMessage(from, { text, edit: key });
  } catch {
    /* edit not supported */
  }
}

module.exports = {
  name: 'fb',
  aliases: ['facebook', 'fbdl', 'fbdown', 'fbvid', 'reel'],
  description: 'Download Facebook video / reel 💎',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    const rawArgs = args.join(' ').trim();
    const quoted = getQuotedText(msg);
    const raw = rawArgs || quoted;
    const url = extractUrl(raw) || (isFbUrl(raw) ? raw : null);

    if (!raw || !url) {
      const help = `
*╭─┉❰ 🌸 𝐖𝙴𝙻𝙲𝙾𝙼𝙴 𝐔𝚂𝙴𝚁 🌸 ❱┉─┉──•*
*│ 💙 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐕𝐈𝐃𝐄𝐎 𝐃𝐋*
*╰┉────────────┉─•*

*╭──┉❰ 💎 𝐇𝐎𝐖 𝐓𝐎 𝐔𝐒𝐄 ❱┉──•*
*│◊│* ✦ \`${prefix}fb <facebook link>\`
*│◊│* ✦ Reply link එකකට \`${prefix}fb\`
*│◊╰────────────┉•┉*
*╰──────────────────┉*

*╭──┉❰ 📌 𝐄𝐗𝐀𝐌𝐏𝐋𝐄 ❱┉──•*
*│◊│* ✦ \`${prefix}fb https://fb.watch/xxxxx\`
*│◊│* ✦ \`${prefix}fb https://www.facebook.com/share/v/...\`
*│◊│* ✦ \`${prefix}facebook https://www.facebook.com/reel/...\`
*│◊╰────────────┉•┉*
*╰──────────────────┉*

*╭──┉❰ ✅ 𝐒𝐔𝐏𝐏𝐎𝐑𝐓𝐒 ❱┉──•*
*│◊│* ✦ 🎬 Facebook Videos
*│◊│* ✦ 🌸 Facebook Reels
*│◊│* ✦ 🔗 fb.watch / share links
*│◊│* ✦ 📱 m.facebook.com links
*│◊╰────────────┉•┉*
*╰──────────────────┉*

_*🌟✦•°💙↝❰💖 Powered by Dark Queen ❱*_`;
      return sock.sendMessage(from, { text: help.trim() }, { quoted: msg });
    }

    const loading = await sock.sendMessage(
      from,
      {
        text: `
*╭──┉❰ 💙 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 ❱┉──•*
*│◊│* ✦ 🔍 Link check කරමින්...
*│◊│* ✦ ⏳ Please wait
*│◊╰────────────┉•┉*
*╰──────────────────┉*`.trim(),
      },
      { quoted: msg }
    );

    try {
      await safeEdit(
        sock,
        from,
        loading.key,
        `
*╭──┉❰ 💙 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 ❱┉──•*
*│◊│* ✦ 📡 API එකට connect වෙමින්...
*│◊│* ✦ 💎 Dark Queen Resolve
*│◊╰────────────┉•┉*
*╰──────────────────┉*`.trim()
      );

      const info = await resolveFacebook(url);

      await safeEdit(
        sock,
        from,
        loading.key,
        `
*╭──┉❰ 💙 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 ❱┉──•*
*│◊│* ✦ ⬇️ Video download වෙමින්...
*│◊│* ✦ 🎬 ${String(info.title).slice(0, 42)}
*│◊│* ✦ 👤 ${String(info.uploader).slice(0, 28)}
*│◊╰────────────┉•┉*
*╰──────────────────┉*`.trim()
      );

      const { buffer } = await downloadVideo(info.videoUrl);
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);

      if (buffer.length > MAX_WA_BYTES) {
        return sock.sendMessage(from, {
          text: box('⚠️ 𝐅𝐈𝐋𝐄 𝐓𝐎𝐎 𝐋𝐀𝐑𝐆𝐄', [
            `✦ 📦 Size › *${sizeMB} MB*`,
            '✦ 🚫 WhatsApp limit ~60MB',
            '✦ 💡 කෙටි / SD video එකක් try කරන්න',
          ]),
          edit: loading.key,
        });
      }

      const caption = `
*╭─┉❰ 🌸 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐃𝐎𝐍𝐄 🌸 ❱┉─┉──•*
*│ 💙 Facebook Video Ready*
*╰┉────────────┉─•*

*╭──┉❰ 🎬 𝐕𝐈𝐃𝐄𝐎 𝐈𝐍𝐅𝐎 ❱┉──•*
*│◊│* ✦ 📌 \`ᴛɪᴛʟᴇ\` : ${String(info.title).slice(0, 80)}
*│◊│* ✦ 👤 \`ᴜᴘʟᴏᴀᴅᴇʀ\` : ${String(info.uploader).slice(0, 40)}
*│◊│* ✦ ⏱️ \`ᴅᴜʀᴀᴛɪᴏɴ\` : ${formatDuration(info.durationSeconds)}
*│◊│* ✦ 📦 \`ꜱɪᴢᴇ\` : ${sizeMB} MB
*│◊│* ✦ 📡 \`ꜱᴏᴜʀᴄᴇ\` : Facebook
*│◊│* ✦ ✅ \`ꜱᴛᴀᴛᴜꜱ\` : Success
*│◊╰────────────┉•┉*
*╰──────────────────┉*

_*🌟✦•°💙↝❰💖 ${config.botName || 'DARK QUEEN MINI'} ❱*_`.trim();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      const payload = {
        video: buffer,
        mimetype: 'video/mp4',
        caption,
        fileName: 'facebook.mp4',
      };

      try {
        await sock.sendMessage(from, payload, { quoted: msg });
      } catch (sendErr) {
        console.error('FB video send failed, document fallback:', sendErr.message);
        await sock.sendMessage(
          from,
          {
            document: buffer,
            mimetype: 'video/mp4',
            fileName: 'facebook.mp4',
            caption: caption + '\n\n*│◊│* ✦ 📁 Sent as document',
          },
          { quoted: msg }
        );
      }
    } catch (err) {
      console.error('FB Download Error:', err.message);
      const hint =
        err.code === 'AUTH'
          ? '🔑 API key එක check කරන්න (DARKQUEEN_API_KEY)'
          : err.code === 'BAD_URL'
            ? '🔗 Public Facebook video/reel link එකක් දෙන්න'
            : err.code === 'NO_MEDIA'
              ? '🔒 Private / region-lock video එකක් වෙන්න පුළුවන්'
              : '💡 ටිකකින් ආයෙත් try කරන්න';

      const failText = `
*╭──┉❰ ❌ 𝐅𝐁 𝐃𝐋 𝐅𝐀𝐈𝐋𝐄𝐃 ❱┉──•*
*│◊│* ✦ ⚠️ ${String(err.message).slice(0, 90)}
*│◊│* ✦ ${hint}
*│◊│* ✦ 📌 \`${prefix}fb <facebook link>\`
*│◊╰────────────┉•┉*
*╰──────────────────┉*`.trim();

      await sock
        .sendMessage(from, { text: failText, edit: loading.key })
        .catch(() => sock.sendMessage(from, { text: failText }, { quoted: msg }).catch(() => {}));
    }
  },
};
