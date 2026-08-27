const axios = require('axios');
const config = require('../../config');

const API_KEY = 'Sasa_Dev_Api_479c9ed9917d15f5cacdb37b6df3fb4b6f4d7b34';
const API_BASE = 'https://sasa-dev-api.xyz/api/facebook2';
const MAX_WA_BYTES = 60 * 1024 * 1024; // WhatsApp practical limit

function isFbUrl(text) {
  return /facebook\.com|fb\.watch|fb\.com|fburl\.com/i.test(text);
}

function extractUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch|fb\.com|m\.facebook\.com|web\.facebook\.com)[^\s]*/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function pickVideoUrl(data) {
  if (!data || typeof data !== 'object') return null;

  // Common shapes from Sasa / similar downloader APIs
  const candidates = [
    data.hd,
    data.sd,
    data.video,
    data.videoUrl,
    data.video_url,
    data.url,
    data.download,
    data.download_url,
    data.link,
    data.result?.hd,
    data.result?.sd,
    data.result?.video,
    data.result?.url,
    data.result?.download,
    data.data?.hd,
    data.data?.sd,
    data.data?.video,
    data.data?.url,
    data.result?.media?.video_url,
    data.result?.medias?.[0]?.url,
    data.medias?.[0]?.url,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
  }

  // Array of qualities
  const list = data.result || data.data || data.medias || data.links;
  if (Array.isArray(list)) {
    // Prefer HD / higher quality if labeled
    const sorted = [...list].sort((a, b) => {
      const qa = String(a.quality || a.type || a.resolution || '').toLowerCase();
      const qb = String(b.quality || b.type || b.resolution || '').toLowerCase();
      const score = (q) => (q.includes('hd') || q.includes('1080') || q.includes('720') ? 2 : 1);
      return score(qb) - score(qa);
    });
    for (const item of sorted) {
      const u = item?.url || item?.link || item?.download || item?.video;
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
    }
  }

  return null;
}

function pickTitle(data, fallback) {
  return (
    data?.title ||
    data?.result?.title ||
    data?.data?.title ||
    data?.caption ||
    data?.result?.caption ||
    fallback ||
    'Facebook Video'
  );
}

function pickThumb(data) {
  return (
    data?.thumbnail ||
    data?.thumb ||
    data?.image ||
    data?.result?.thumbnail ||
    data?.result?.thumb ||
    data?.data?.thumbnail ||
    null
  );
}

module.exports = {
  name: 'fb',
  aliases: ['facebook', 'fbdl', 'fbdown'],
  description: 'Download Facebook video / reel',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 📘 *FB DOWNLOAD* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}fb <facebook video/reel link>
│
│  📌 *Example:*
│  ${prefix}fb https://www.facebook.com/...
│  ${prefix}fb https://fb.watch/xxxxx
│
│  ✅ Supports:
│  • Facebook videos
│  • Reels
│  • fb.watch links
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const raw = args.join(' ').trim();
    const url = extractUrl(raw) || (isFbUrl(raw) ? raw : null);

    if (!url) {
      return sock.sendMessage(
        from,
        {
          text: `❌ Valid Facebook link එකක් නොවේ.\n\n💡 *Example:*\n${prefix}fb https://fb.watch/xxxxx`,
        },
        { quoted: msg }
      );
    }

    const loading = await sock.sendMessage(
      from,
      { text: '📥 *Facebook video ලබාගනිමින්...*' },
      { quoted: msg }
    );

    try {
      const apiUrl = `${API_BASE}?apikey=${API_KEY}&url=${encodeURIComponent(url)}`;

      const apiRes = await axios.get(apiUrl, {
        timeout: 90000,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const data = apiRes.data;

      if (apiRes.status !== 200 || !data) {
        return sock.sendMessage(from, {
          text: '❌ API එකෙන් response ආවේ නැහැ. ටිකකින් නැවත try කරන්න.',
          edit: loading.key,
        });
      }

      // Explicit failure from API
      if (
        data.status === false ||
        data.success === false ||
        (data.msg && /not found|invalid|error|fail/i.test(String(data.msg)))
      ) {
        const reason = data.msg || data.message || data.error || 'Video හමු නොවීය';
        return sock.sendMessage(from, {
          text: `❌ Download fail වුණා.\n\n\`${reason}\`\n\n💡 Public video/reel link එකක් දීලා try කරන්න.`,
          edit: loading.key,
        });
      }

      const videoUrl = pickVideoUrl(data);
      if (!videoUrl) {
        console.error('FB API unexpected payload:', JSON.stringify(data).slice(0, 800));
        return sock.sendMessage(from, {
          text: '❌ Video link එක හොයාගන්න බැරි වුණා.\n💡 වෙන link එකක් try කරන්න හෝ public video එකක් දෙන්න.',
          edit: loading.key,
        });
      }

      const title = pickTitle(data, 'Facebook Video');
      const thumb = pickThumb(data);

      await sock.sendMessage(from, {
        text: '⬇️ *Video download වෙමින්...*',
        edit: loading.key,
      }).catch(() => {});

      const mediaRes = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxContentLength: MAX_WA_BYTES + 5 * 1024 * 1024,
        maxBodyLength: MAX_WA_BYTES + 5 * 1024 * 1024,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.facebook.com/',
        },
        validateStatus: () => true,
      });

      const contentType = String(mediaRes.headers?.['content-type'] || '').toLowerCase();
      if (
        mediaRes.status !== 200 ||
        contentType.includes('text/html') ||
        contentType.includes('application/json')
      ) {
        return sock.sendMessage(from, {
          text: '❌ Video file එක ලබාගන්න බැරි වුණා (link expired / blocked).\n💡 ආයෙත් try කරන්න.',
          edit: loading.key,
        });
      }

      const buffer = Buffer.from(mediaRes.data);
      if (!buffer.length || buffer.length < 5000) {
        return sock.sendMessage(from, {
          text: '❌ Video file එක empty / invalid.',
          edit: loading.key,
        });
      }

      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      if (buffer.length > MAX_WA_BYTES) {
        return sock.sendMessage(from, {
          text: `❌ File එක ගොඩක් ලොකුයි (*${sizeMB} MB*).\nWhatsApp limit එක ~60MB.\n💡 කෙටි video එකක් try කරන්න.`,
          edit: loading.key,
        });
      }

      const caption = `
╭───「 📘 *FB DOWNLOAD* 」───╮
│
│  📌 *Title*   ›  ${String(title).slice(0, 80)}
│  📦 *Size*    ›  ${sizeMB} MB
│  🔗 *Source*  ›  Facebook
│  ✅ *Status*  ›  Done
│
╰──────────────────────╯`.trim();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // Prefer video message; fallback to document
      try {
        const payload = {
          video: buffer,
          mimetype: 'video/mp4',
          caption,
          fileName: 'facebook.mp4',
        };
        if (thumb && /^https?:\/\//i.test(thumb)) {
          // some WA clients use jpegThumbnail; skip if remote only
        }
        await sock.sendMessage(from, payload, { quoted: msg });
      } catch (sendErr) {
        console.error('FB video send failed, document fallback:', sendErr.message);
        await sock.sendMessage(
          from,
          {
            document: buffer,
            mimetype: 'video/mp4',
            fileName: 'facebook.mp4',
            caption: caption + '\n\n📁 _Sent as document_',
          },
          { quoted: msg }
        );
      }
    } catch (err) {
      console.error('FB Download Error:', err.message);
      await sock.sendMessage(from, {
        text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\`\n\n💡 ආයෙත් \`${prefix}fb <link>\` කරලා try කරන්න.`,
        edit: loading.key,
      }).catch(() => {});
    }
  },
};
