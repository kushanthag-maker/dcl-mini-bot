const axios = require('axios');
const https = require('https');
const http = require('http');
const config = require('../../config');

// ytdlfast = googlevideo (IP-locked 403). /api/download/yt = working proxy CDN
const API_URL = 'https://whiteshadow-x-api.onrender.com/api/download/yt';
const API_TOKEN = 'CkExxE';
const MAX_BYTES = 512 * 1024 * 1024;

function extractYtUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

/** Stream URL → Buffer (follows redirects, Range-friendly CDNs) */
function downloadBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        timeout: 300000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
          'Accept-Encoding': 'identity',
          Referer: 'https://www.youtube.com/',
          Origin: 'https://www.youtube.com',
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          return downloadBuffer(next, redirects + 1).then(resolve, reject);
        }

        // 200 or 206 Partial
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          res.resume();
          return reject(new Error(`Download HTTP ${res.statusCode}`));
        }

        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          chunks.push(c);
          total += c.length;
          if (total > MAX_BYTES) {
            req.destroy();
            reject(new Error('File too large'));
          }
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            contentType: String(res.headers['content-type'] || ''),
            buffer: Buffer.concat(chunks),
          });
        });
        res.on('error', reject);
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Download timeout'));
    });
    req.on('error', reject);
  });
}

async function downloadBufferAxios(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 300000,
    maxRedirects: 8,
    maxContentLength: MAX_BYTES,
    maxBodyLength: MAX_BYTES,
    validateStatus: () => true,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
      Referer: 'https://www.youtube.com/',
    },
  });
  return {
    status: res.status,
    contentType: String(res.headers['content-type'] || ''),
    buffer: Buffer.from(res.data || []),
  };
}

module.exports = {
  name: 'yt',
  aliases: ['ytdl', 'youtube', 'ytv'],
  description: 'Download YouTube video / audio',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 ▶️ *YOUTUBE DL* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}yt <youtube url>
│  ${prefix}yt audio <youtube url>
│
│  📌 *Example:*
│  ${prefix}yt https://youtu.be/M7y9sIvMGjw
│  ${prefix}yt audio https://youtu.be/M7y9sIvMGjw
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    let mode = 'video';
    let raw = args.join(' ').trim();
    if (/^(audio|mp3|song)$/i.test(args[0])) {
      mode = 'audio';
      raw = args.slice(1).join(' ').trim();
    } else if (/^(video|mp4|vid)$/i.test(args[0])) {
      mode = 'video';
      raw = args.slice(1).join(' ').trim();
    }

    const url = extractYtUrl(raw) || extractYtUrl(args.join(' '));
    if (!url) {
      return sock.sendMessage(
        from,
        { text: `❌ Valid YouTube link එකක් දෙන්න.\n💡 ${prefix}yt https://youtu.be/xxxxx` },
        { quoted: msg }
      );
    }

    const loading = await sock.sendMessage(
      from,
      { text: '📥 *YouTube process වෙමින්...*' },
      { quoted: msg }
    );

    try {
      // Working proxy API (not IP-locked googlevideo)
      const apiRes = await axios.get(API_URL, {
        params: { url, apitoken: API_TOKEN },
        timeout: 120000,
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
        throw new Error(body.message || body.error || 'API failed');
      }

      const meta = body.metadata || {};
      const result = body.result || body.data || {};
      const title = meta.title || result.title || 'YouTube';
      const author = meta.author || meta.channel || 'Unknown';
      const thumb = meta.thumbnail || result.thumbnail || null;
      const views = meta.views || null;

      const videoUrl = result.video_url || result.video || result.mp4 || null;
      const audioUrl = result.audio_url || result.audio || result.mp3 || null;

      const mediaUrl = mode === 'audio' ? audioUrl || videoUrl : videoUrl || audioUrl;
      if (!mediaUrl) {
        throw new Error('Download link හොයාගන්න බැරි වුණා');
      }

      await sock
        .sendMessage(from, {
          text: `⬇️ *Download කරමින්...*\n📁 ${mode === 'audio' ? 'Audio' : 'Video'}`,
          edit: loading.key,
        })
        .catch(() => {});

      let dl;
      try {
        dl = await downloadBuffer(mediaUrl);
      } catch (e1) {
        console.log('[YT] native fail:', e1.message, '— axios retry');
        dl = await downloadBufferAxios(mediaUrl);
      }

      console.log('[YT] status=', dl.status, 'ct=', dl.contentType, 'size=', dl.buffer.length);

      if ((dl.status !== 200 && dl.status !== 206) || dl.buffer.length < 5000) {
        throw new Error(
          `Media download fail (HTTP ${dl.status}, ${dl.buffer.length} bytes)`
        );
      }

      const head = dl.buffer.slice(0, 40).toString('utf8');
      if (head.includes('<html') || head.trim().startsWith('{')) {
        throw new Error('Download returned HTML/JSON instead of media');
      }

      const buffer = dl.buffer;
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      const isAudio = mode === 'audio';

      const caption = `
╭───「 ▶️ *YOUTUBE* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 60)}
│  👤 *Author*   ›  ${String(author).slice(0, 40)}
│  👁 *Views*    ›  ${views != null ? views : 'N/A'}
│  📦 *Size*     ›  ${sizeMB} MB
│  📁 *Type*     ›  ${isAudio ? 'Audio' : 'Video'}
│
╰──────────────────────╯`.trim();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (isAudio) {
        if (thumb && /^https?:\/\//i.test(thumb)) {
          try {
            await sock.sendMessage(from, { image: { url: thumb }, caption }, { quoted: msg });
          } catch (_) {
            await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
          }
        } else {
          await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
        }

        const mimetype = 'audio/mpeg';
        try {
          await sock.sendMessage(
            from,
            {
              audio: buffer,
              mimetype,
              ptt: false,
              fileName: 'youtube-audio.mp3',
            },
            { quoted: msg }
          );
        } catch (e1) {
          await sock.sendMessage(
            from,
            {
              document: buffer,
              mimetype,
              fileName: 'youtube-audio.mp3',
              caption: '🎵 ' + String(title).slice(0, 50),
            },
            { quoted: msg }
          );
        }
      } else {
        const asDoc = buffer.length > 64 * 1024 * 1024;
        try {
          if (asDoc) {
            await sock.sendMessage(
              from,
              {
                document: buffer,
                mimetype: 'video/mp4',
                fileName: 'youtube.mp4',
                caption: caption + '\n\n📁 _Large file — document_',
              },
              { quoted: msg }
            );
          } else {
            await sock.sendMessage(
              from,
              {
                video: buffer,
                mimetype: 'video/mp4',
                caption,
                fileName: 'youtube.mp4',
              },
              { quoted: msg }
            );
          }
        } catch (e1) {
          console.error('YT video send fail:', e1.message);
          await sock.sendMessage(
            from,
            {
              document: buffer,
              mimetype: 'video/mp4',
              fileName: 'youtube.mp4',
              caption: caption + '\n\n📁 _Sent as document_',
            },
            { quoted: msg }
          );
        }
      }
    } catch (err) {
      console.error('YT Error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ YouTube download fail.\n\n\`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
