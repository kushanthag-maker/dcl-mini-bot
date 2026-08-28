const axios = require('axios');
const config = require('../../config');

const API_URL = 'https://whiteshadow-x-api.onrender.com/api/download/tiktok';
const API_TOKEN = 'CkExxE';
const MAX_WA_BYTES = 60 * 1024 * 1024;

function extractTikTokUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:(?:vm|vt|www)\.)?tiktok\.com\/[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

function pickVideoUrl(data) {
  // Prefer no-watermark, then HD, then watermarked
  const order = ['play', 'hdplay', 'wmplay', 'video', 'nwm_video_url', 'video_url'];
  for (const k of order) {
    if (typeof data[k] === 'string' && /^https?:\/\//i.test(data[k])) return { url: data[k], quality: k };
  }
  if (Array.isArray(data.links)) {
    for (const l of data.links) {
      if (typeof l === 'string' && /^https?:\/\//i.test(l)) return { url: l, quality: 'auto' };
      if (l?.url) return { url: l.url, quality: l.quality || 'auto' };
    }
  }
  return null;
}

module.exports = {
  name: 'tt',
  aliases: ['tiktok', 'tiktokdl', 'ttdl'],
  description: 'Download TikTok video (no watermark)',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    const raw = args.join(' ').trim();
    const url = extractTikTokUrl(raw) || (raw.includes('tiktok') ? raw : null);

    if (!url) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🎵 *TIKTOK DL* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}tt <tiktok url>
│
│  📌 *Example:*
│  ${prefix}tt https://vt.tiktok.com/xxxxx/
│  ${prefix}tt https://www.tiktok.com/@user/video/123
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const loading = await sock.sendMessage(
      from,
      { text: '📥 *TikTok download වෙමින්...*' },
      { quoted: msg }
    );

    try {
      const apiRes = await axios.get(API_URL, {
        params: { url, apitoken: API_TOKEN },
        timeout: 90000,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (apiRes.status !== 200 || !apiRes.data) {
        throw new Error(`API HTTP ${apiRes.status}`);
      }

      const body = apiRes.data;
      if (body.success === false || body.status === false) {
        throw new Error(body.message || body.msg || body.error || 'API failed');
      }

      // Whiteshadow shape: result.data  OR result  OR data
      const result = body.result || body.data || body;
      const data =
        result?.data && typeof result.data === 'object'
          ? result.data
          : result;

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid API response');
      }

      const picked = pickVideoUrl(data);
      if (!picked) {
        throw new Error('Video link හොයාගන්න බැරි වුණා');
      }

      const title =
        data.title ||
        data.desc ||
        (Array.isArray(data.content_desc) ? data.content_desc.join(' ') : '') ||
        'TikTok Video';
      const author =
        data.author?.nickname ||
        data.author?.unique_id ||
        data.author ||
        data.nickname ||
        'Unknown';
      const cover = data.cover || data.origin_cover || data.ai_dynamic_cover || null;
      const duration = data.duration || null;
      const sizeHint = data.size || data.hd_size || data.wm_size || null;

      await sock
        .sendMessage(from, {
          text: '⬇️ *Video ලබාගනිමින්...*',
          edit: loading.key,
        })
        .catch(() => {});

      const mediaRes = await axios.get(picked.url, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxContentLength: MAX_WA_BYTES + 10 * 1024 * 1024,
        maxBodyLength: MAX_WA_BYTES + 10 * 1024 * 1024,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.tiktok.com/',
        },
      });

      const ct = String(mediaRes.headers?.['content-type'] || '').toLowerCase();
      if (
        mediaRes.status !== 200 ||
        ct.includes('text/html') ||
        ct.includes('application/json')
      ) {
        throw new Error('Video file ලබාගන්න බැරි වුණා (link expired)');
      }

      const buffer = Buffer.from(mediaRes.data);
      if (!buffer.length || buffer.length < 5000) {
        throw new Error('Video empty / invalid');
      }

      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      if (buffer.length > MAX_WA_BYTES) {
        return sock.sendMessage(from, {
          text: `❌ File ලොකුයි (*${sizeMB} MB*). WhatsApp limit ~60MB.`,
          edit: loading.key,
        });
      }

      const caption = `
╭───「 🎵 *TIKTOK* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 70)}
│  👤 *Author*   ›  ${String(author).slice(0, 40)}
│  ⏱ *Duration* ›  ${duration ? duration + 's' : 'N/A'}
│  🎬 *Quality*  ›  ${picked.quality}
│  📦 *Size*     ›  ${sizeMB} MB${sizeHint ? ' (~' + formatSize(sizeHint) + ')' : ''}
│
╰──────────────────────╯`.trim();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      try {
        await sock.sendMessage(
          from,
          {
            video: buffer,
            mimetype: 'video/mp4',
            caption,
            fileName: 'tiktok.mp4',
          },
          { quoted: msg }
        );
      } catch (e1) {
        console.error('TT video send fail:', e1.message);
        await sock.sendMessage(
          from,
          {
            document: buffer,
            mimetype: 'video/mp4',
            fileName: 'tiktok.mp4',
            caption: caption + '\n\n📁 _Sent as document_',
          },
          { quoted: msg }
        );
      }

      // Optional: send music if available and small
      if (data.music && typeof data.music === 'string' && /^https?:\/\//i.test(data.music)) {
        try {
          const musicRes = await axios.get(data.music, {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxContentLength: 15 * 1024 * 1024,
            validateStatus: () => true,
            headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.tiktok.com/' },
          });
          const mb = Buffer.from(musicRes.data || []);
          if (musicRes.status === 200 && mb.length > 2000 && mb.length < 15 * 1024 * 1024) {
            await sock.sendMessage(
              from,
              { audio: mb, mimetype: 'audio/mpeg', ptt: false, fileName: 'tiktok-music.mp3' },
              { quoted: msg }
            ).catch(() => {});
          }
        } catch (_) {}
      }
    } catch (err) {
      console.error('TT Error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ TikTok download fail.\n\n\`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
