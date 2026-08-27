const axios = require('axios');
const config = require('../../config');
const API_KEY = 'Sasa_Dev_Api_479c9ed9917d15f5cacdb37b6df3fb4b6f4d7b34';
const API_BASE = 'https://sasa-dev-api.xyz/api/tiktok';
const MAX_WA_BYTES = 60 * 1024 * 1024;

function isTtUrl(text) {
  return /tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com/i.test(text);
}

function extractUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:(?:www|vm|vt|m)\.)?tiktok\.com\/[^\s]*/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function extractVideoId(url) {
  if (!url) return null;
  // /video/1234567890
  let m = String(url).match(/\/video\/(\d{10,})/);
  if (m) return m[1];
  // sometimes id in query
  m = String(url).match(/[?&](?:id|video_id)=(\d{10,})/i);
  if (m) return m[1];
  return null;
}

async function resolveShortUrl(url) {
  try {
    if (!/vt\.tiktok\.com|vm\.tiktok\.com/i.test(url)) return url;
    const res = await axios.get(url, {
      maxRedirects: 5,
      timeout: 15000,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const finalUrl =
      res.request?.res?.responseUrl ||
      res.request?.responseURL ||
      (res.headers && res.headers.location) ||
      url;
    return finalUrl || url;
  } catch (_) {
    return url;
  }
}

function pickBestVideo(result, wantedId) {
  const videos = result?.videos || result?.data || [];
  if (!Array.isArray(videos) || !videos.length) return null;

  if (wantedId) {
    const match = videos.find((v) => String(v.id) === String(wantedId));
    if (match) return match;
  }
  return videos[0];
}

function pickDownloadLink(video) {
  if (!video || typeof video !== 'object') return null;
  // Prefer no-watermark if available and different
  const candidates = [
    video.video,
    video.no_watermark,
    video.nwm,
    video.download,
    video.play,
    video.playAddr,
    video.wmplay,
    video.watermarked,
    video.url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
  }
  return null;
}

module.exports = {
  name: 'tt',
  aliases: ['tiktok', 'ttdl', 'tiktokdl'],
  description: 'Download TikTok video (no watermark when available)',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🎵 *TIKTOK DOWNLOAD* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}tt <tiktok video link>
│
│  📌 *Example:*
│  ${prefix}tt https://www.tiktok.com/@user/video/123
│  ${prefix}tt https://vt.tiktok.com/xxxxx
│
│  ✅ Supports:
│  • TikTok videos
│  • Short links (vt / vm)
│  • No-watermark when available
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const raw = args.join(' ').trim();
    let url = extractUrl(raw) || (isTtUrl(raw) ? raw : null);

    if (!url) {
      return sock.sendMessage(
        from,
        {
          text: `❌ Valid TikTok link එකක් නොවේ.\n\n💡 *Example:*\n${prefix}tt https://vt.tiktok.com/xxxxx`,
        },
        { quoted: msg }
      );
    }

    const loading = await sock.sendMessage(
      from,
      { text: '📥 *TikTok video ලබාගනිමින්...*' },
      { quoted: msg }
    );

    try {
      // Resolve short links so we can match video id
      url = await resolveShortUrl(url);
      const videoId = extractVideoId(url);

      // This API uses search endpoint; pass URL as q/text to get video + direct links
      const apiUrl = `${API_BASE}?apikey=${API_KEY}&q=${encodeURIComponent(url)}`;

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

      if (data.status === false || data.success === false) {
        const reason = data.error || data.msg || data.message || 'Video හමු නොවීය';
        return sock.sendMessage(from, {
          text: `❌ Download fail වුණා.\n\n\`${reason}\`\n\n💡 Public TikTok link එකක් දීලා try කරන්න.`,
          edit: loading.key,
        });
      }

      const result = data.result || data.data || data;
      const video = pickBestVideo(result, videoId);

      if (!video) {
        return sock.sendMessage(from, {
          text: '❌ Video හමු නොවීය.\n💡 Link එක හරිද බලලා ආයෙත් try කරන්න.',
          edit: loading.key,
        });
      }

      const dlUrl = pickDownloadLink(video);
      if (!dlUrl) {
        console.error('TT API no download link:', JSON.stringify(video).slice(0, 600));
        return sock.sendMessage(from, {
          text: '❌ Download link එක හොයාගන්න බැරි වුණා.',
          edit: loading.key,
        });
      }

      const title =
        video.title ||
        video.desc ||
        video.description ||
        'TikTok Video';
      const author =
        video.author?.nickname ||
        video.author?.username ||
        video.author ||
        'Unknown';
      const cover = video.cover || video.thumbnail || video.thumb || null;
      const duration = video.duration ? `${video.duration}s` : 'N/A';

      await sock.sendMessage(from, {
        text: '⬇️ *Video download වෙමින්...*',
        edit: loading.key,
      }).catch(() => {});

      const mediaRes = await axios.get(dlUrl, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxContentLength: MAX_WA_BYTES + 5 * 1024 * 1024,
        maxBodyLength: MAX_WA_BYTES + 5 * 1024 * 1024,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.tiktok.com/',
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
          text: `❌ File එක ගොඩක් ලොකුයි (*${sizeMB} MB*).\nWhatsApp limit එක ~60MB.`,
          edit: loading.key,
        });
      }

      const caption = `
╭───「 🎵 *TIKTOK* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 70)}
│  👤 *Author*   ›  ${String(author).slice(0, 40)}
│  ⏱ *Duration* ›  ${duration}
│  📦 *Size*     ›  ${sizeMB} MB
│  🔗 *Source*   ›  TikTok
│  ✅ *Status*   ›  Done
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
      } catch (sendErr) {
        console.error('TT video send failed, document fallback:', sendErr.message);
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
    } catch (err) {
      console.error('TT Download Error:', err.message);
      await sock.sendMessage(from, {
        text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\`\n\n💡 ආයෙත් \`${prefix}tt <link>\` කරලා try කරන්න.`,
        edit: loading.key,
      }).catch(() => {});
    }
  },
};
