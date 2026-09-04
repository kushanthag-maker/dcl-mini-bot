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
const MAX_VIDEO_BYTES = 15 * 1024 * 1024; // WhatsApp video note/message safe
const MAX_DOC_BYTES = 64 * 1024 * 1024; // WhatsApp document practical cap
const MAX_PROBE = 80 * 1024 * 1024;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
  if (!n) return 'N/A';
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

function looksLikeHtml(data) {
  if (typeof data === 'string') {
    const s = data.trim().slice(0, 80).toLowerCase();
    return s.startsWith('<!doctype') || s.startsWith('<html') || s.includes('run this app');
  }
  return false;
}

function parseBody(data) {
  if (data == null) return null;
  if (typeof data === 'object') return data;
  if (typeof data === 'string') {
    const t = data.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return JSON.parse(t);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function pickDirectUrl(data) {
  if (!data || typeof data !== 'object') return null;
  const layer =
    (data.data && typeof data.data === 'object' ? data.data : null) ||
    (data.result && typeof data.result === 'object' ? data.result : null) ||
    data;
  const keys = ['directUrl', 'direct_url', 'hd', 'sd', 'videoUrl', 'video_url', 'url', 'download'];
  for (const k of keys) {
    const v = layer[k];
    if (typeof v === 'string' && /^https?:\/\//i.test(v) && /fbcdn\.net|\.mp4|video/i.test(v)) {
      return v;
    }
    if (typeof v === 'string' && /^https?:\/\//i.test(v) && !/\.(jpg|png|webp|gif)(\?|$)/i.test(v)) {
      return v;
    }
  }
  if (typeof data.directUrl === 'string') return data.directUrl;
  return null;
}

function pickMeta(data) {
  const layer =
    (data?.data && typeof data.data === 'object' ? data.data : null) ||
    (data?.result && typeof data.result === 'object' ? data.result : null) ||
    data ||
    {};
  return {
    title: layer.title || data?.title || 'Facebook Video',
    uploader: layer.uploader || layer.author || data?.uploader || 'Unknown',
    thumbnail: layer.thumbnail || layer.thumb || data?.thumbnail || null,
    durationSeconds: layer.durationSeconds || layer.duration || data?.durationSeconds || null,
  };
}

async function callDarkQueenOnce(url) {
  const endpoint = `${API_BASE}${RESOLVE_PATH}`;
  let res;
  try {
    res = await axios.post(
      endpoint,
      { url },
      {
        timeout: 90000,
        validateStatus: () => true,
        headers: {
          'content-type': 'application/json',
          Accept: 'application/json',
          'x-api-key': API_KEY,
          'User-Agent': UA,
        },
      }
    );
  } catch (e) {
    const err = new Error(`API connect fail: ${e.message}`);
    err.code = 'API_DOWN';
    throw err;
  }

  if (looksLikeHtml(res.data) || String(res.headers?.['content-type'] || '').includes('text/html')) {
    const err = new Error('Dark Queen API offline / Replit stop වෙලා');
    err.code = 'API_DOWN';
    throw err;
  }

  const data = parseBody(res.data);
  if (!data) {
    const err = new Error(`API JSON නෙවෙයි (HTTP ${res.status})`);
    err.code = 'API';
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    const err = new Error(data.error || 'API key invalid');
    err.code = 'AUTH';
    throw err;
  }
  if (data.error || data.success === false || data.status === false) {
    const err = new Error(data.error || data.message || data.msg || 'Resolve failed');
    err.code = res.status === 400 ? 'BAD_URL' : 'API';
    throw err;
  }

  const videoUrl = pickDirectUrl(data);
  if (!videoUrl) {
    const err = new Error('API response එකේ directUrl නැහැ');
    err.code = 'NO_MEDIA';
    throw err;
  }
  return { ...pickMeta(data), videoUrl };
}

async function probeSize(videoUrl) {
  try {
    const head = await axios.head(videoUrl, {
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'User-Agent': UA, Referer: 'https://www.facebook.com/' },
    });
    const n = parseInt(head.headers?.['content-length'] || '0', 10);
    if (head.status < 400 && n > 0) return n;
  } catch {
    /* ignore */
  }
  try {
    const rng = await axios.get(videoUrl, {
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': UA,
        Referer: 'https://www.facebook.com/',
        Range: 'bytes=0-0',
      },
    });
    const cr = String(rng.headers?.['content-range'] || '');
    const m = cr.match(/\/(\d+)\s*$/);
    if (m) return parseInt(m[1], 10);
    const n = parseInt(rng.headers?.['content-length'] || '0', 10);
    if (n > 1) return n;
  } catch {
    /* ignore */
  }
  return 0;
}

async function downloadLimited(videoUrl, maxBytes) {
  const res = await axios.get(videoUrl, {
    responseType: 'arraybuffer',
    timeout: 180000,
    maxContentLength: maxBytes + 1024 * 1024,
    maxBodyLength: maxBytes + 1024 * 1024,
    maxRedirects: 8,
    validateStatus: () => true,
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      Referer: 'https://www.facebook.com/',
    },
  });
  const ct = String(res.headers?.['content-type'] || '').toLowerCase();
  if ((res.status !== 200 && res.status !== 206) || ct.includes('text/html')) {
    throw new Error(`CDN HTTP ${res.status}`);
  }
  const buffer = Buffer.from(res.data || []);
  if (buffer.length < 5000) throw new Error('Video empty');
  return buffer;
}

async function safeEdit(sock, from, key, text) {
  try {
    await sock.sendMessage(from, { text, edit: key });
  } catch {
    /* ignore */
  }
}

function infoCaption(info, sizeBytes, extra) {
  return `
*╭─┉❰ 🌸 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐃𝐋 🌸 ❱┉─┉──•*
*│ 💙 Video details*
*╰┉────────────┉─•*

*╭──┉❰ 🎬 𝐈𝐍𝐅𝐎 ❱┉──•*
*│◊│* ✦ 📌 \`ᴛɪᴛʟᴇ\` : ${String(info.title || 'Facebook Video').slice(0, 80)}
*│◊│* ✦ 👤 \`ᴜᴘʟᴏᴀᴅᴇʀ\` : ${String(info.uploader || 'Unknown').slice(0, 40)}
*│◊│* ✦ ⏱️ \`ᴅᴜʀᴀᴛɪᴏɴ\` : ${formatDuration(info.durationSeconds)}
*│◊│* ✦ 📦 \`ꜱɪᴢᴇ\` : ${formatSize(sizeBytes)}
*│◊│* ✦ ✅ \`ꜱᴛᴀᴛᴜꜱ\` : ${extra || 'Success'}
*│◊╰────────────┉•┉*
*╰──────────────────┉*

_*🌟✦•°💙↝❰💖 ${config.botName || 'DARK QUEEN MINI'} ❱*_`.trim();
}

module.exports = {
  name: 'fb',
  aliases: ['facebook', 'fbdl', 'fbdown', 'fbvid', 'reel'],
  description: 'Download Facebook video / reel 💎',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    const raw = args.join(' ').trim() || getQuotedText(msg);
    const url = extractUrl(raw) || (isFbUrl(raw) ? raw : null);

    if (!raw || !url) {
      return sock.sendMessage(
        from,
        {
          text: `
*╭─┉❰ 💙 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐃𝐋 ❱┉─┉──•*
*│◊│* ✦ \`${prefix}fb <facebook link>\`
*│◊│* ✦ Reply link එකකට \`${prefix}fb\`
*│◊│* ✦ Example: \`${prefix}fb https://fb.watch/xxxxx\`
*│◊╰────────────┉•┉*
*╰──────────────────┉*`.trim(),
        },
        { quoted: msg }
      );
    }

    const loading = await sock.sendMessage(
      from,
      {
        text: `
*╭──┉❰ 💙 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 ❱┉──•*
*│◊│* ✦ 📡 Resolve කරමින්...
*│◊│* ✦ 🪙 API call එකක් විතරයි
*│◊╰────────────┉•┉*
*╰──────────────────┉*`.trim(),
      },
      { quoted: msg }
    );

    try {
      // ONE resolve only — this is what costs coins
      const info = await callDarkQueenOnce(url);

      await safeEdit(
        sock,
        from,
        loading.key,
        `
*╭──┉❰ 💙 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 ❱┉──•*
*│◊│* ✦ ✅ Resolve උනා
*│◊│* ✦ 📏 Size check...
*│◊╰────────────┉•┉*
*╰──────────────────┉*`.trim()
      );

      const sizeBytes = await probeSize(info.videoUrl);
      const sizeLabel = formatSize(sizeBytes);

      // Too big for WhatsApp: do NOT download, still give value for the coin
      if (sizeBytes > MAX_DOC_BYTES) {
        const cap = `
*╭─┉❰ ⚠️ 𝐅𝐈𝐋𝐄 𝐋𝐀𝐑𝐆𝐄 ❱┉─┉──•*
*│ 💙 WhatsApp එකට attach කරන්න බෑ*
*╰┉────────────┉─•*

*╭──┉❰ 🎬 𝐈𝐍𝐅𝐎 ❱┉──•*
*│◊│* ✦ 📌 \`${String(info.title || 'Facebook Video').slice(0, 70)}\`
*│◊│* ✦ 👤 ${String(info.uploader || 'Unknown').slice(0, 36)}
*│◊│* ✦ ⏱️ ${formatDuration(info.durationSeconds)}
*│◊│* ✦ 📦 ${sizeLabel}  (limit ~64MB)
*│◊│* ✦ 💡 කෙටි reel / SD video එකක් try කරන්න
*│◊╰────────────┉•┉*
*╰──────────────────┉*`.trim();

        await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
        if (info.thumbnail && /^https?:\/\//i.test(info.thumbnail)) {
          try {
            await sock.sendMessage(from, { image: { url: info.thumbnail }, caption: cap }, { quoted: msg });
            return;
          } catch {
            /* fall through */
          }
        }
        await sock.sendMessage(from, { text: cap }, { quoted: msg });
        return;
      }

      await safeEdit(
        sock,
        from,
        loading.key,
        `
*╭──┉❰ 💙 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 ❱┉──•*
*│◊│* ✦ ⬇️ Download ${sizeLabel || ''}
*│◊│* ✦ 🎬 ${String(info.title).slice(0, 36)}
*│◊╰────────────┉•┉*
*╰──────────────────┉*`.trim()
      );

      const limit = sizeBytes && sizeBytes <= MAX_VIDEO_BYTES ? MAX_VIDEO_BYTES : MAX_DOC_BYTES;
      const buffer = await downloadLimited(info.videoUrl, Math.min(limit, MAX_PROBE));
      const finalSize = buffer.length;
      const asVideo = finalSize <= MAX_VIDEO_BYTES;
      const caption = infoCaption(info, finalSize, asVideo ? 'Video' : 'Document');

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (asVideo) {
        try {
          await sock.sendMessage(
            from,
            { video: buffer, mimetype: 'video/mp4', caption, fileName: 'facebook.mp4' },
            { quoted: msg }
          );
          return;
        } catch (e) {
          console.error('[FB] video send fail:', e.message);
        }
      }

      await sock.sendMessage(
        from,
        {
          document: buffer,
          mimetype: 'video/mp4',
          fileName: 'facebook.mp4',
          caption,
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('FB Download Error:', err.message);
      const failText = `
*╭──┉❰ ❌ 𝐅𝐁 𝐃𝐋 𝐅𝐀𝐈𝐋𝐄𝐃 ❱┉──•*
*│◊│* ✦ ⚠️ ${String(err.message).slice(0, 110)}
*│◊│* ✦ 🪙 Resolve උනොත් coin කැපිලා තියෙන්න පුළුවන්
*│◊│* ✦ 📌 \`${prefix}fb <facebook link>\`
*│◊╰────────────┉•┉*
*╰──────────────────┉*`.trim();
      await sock
        .sendMessage(from, { text: failText, edit: loading.key })
        .catch(() => sock.sendMessage(from, { text: failText }, { quoted: msg }).catch(() => {}));
    }
  },
};
