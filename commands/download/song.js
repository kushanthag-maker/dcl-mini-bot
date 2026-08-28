const axios = require('axios');
const https = require('https');
const http = require('http');
const config = require('../../config');

const API_KEY = 'hashu_cd4b0a9d325539de660602e7d8d38d61';
const SEARCH_API = 'https://hashu-apis-production.up.railway.app/api/song/search';
const YTDL_API = 'https://hashu-apis-production.up.railway.app/api/ytdl';
const MAX_WA_BYTES = 60 * 1024 * 1024;
const PENDING_TTL_MS = 2 * 60 * 1000;

const pending = new Map();

function sanitizeFileName(name) {
  return (name || 'song')
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim()
    .substring(0, 40) || 'song';
}

function formatViews(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function formatDuration(sec) {
  const s = Math.floor(Number(sec) || 0);
  if (!s) return 'N/A';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}

/** Download URL → Buffer via native chunks */
function downloadBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        timeout: 180000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'audio/mpeg,audio/*,*/*',
          'Accept-Encoding': 'identity',
          Referer: 'https://www.youtube.com/',
          Origin: 'https://www.youtube.com',
        },
      },
      (res) => {
        // follow redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return downloadBuffer(res.headers.location, redirects + 1).then(resolve, reject);
        }

        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          chunks.push(c);
          total += c.length;
          if (total > MAX_WA_BYTES + 5 * 1024 * 1024) {
            req.destroy();
            reject(new Error('File too large'));
          }
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
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

/** ytdl API → metadata + direct_link */
async function getYtdlInfo(youtubeUrl) {
  const res = await axios.get(YTDL_API, {
    params: { apiKey: API_KEY, text: youtubeUrl },
    timeout: 90000,
    validateStatus: () => true,
  });

  if (res.status !== 200 || !res.data || res.data.success === false) {
    const msg = res.data?.message || res.data?.error || `ytdl HTTP ${res.status}`;
    throw new Error(msg);
  }

  const result = res.data.results || res.data.result || res.data.data || res.data;
  const direct =
    result.direct_link ||
    result.directLink ||
    result.download ||
    result.url ||
    result.link ||
    null;

  if (!direct) {
    throw new Error('No direct_link in ytdl response');
  }

  return {
    title: result.title || 'Song',
    duration: result.duration || null,
    quality: result.quality || result.type || 'mp3',
    type: result.type || 'mp3',
    direct_link: direct,
    source: result.source || '',
  };
}

async function downloadAndSend({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '📥 *Song prepare වෙමින්...*' },
    { quoted: msg }
  );

  try {
    const ytUrl = item.url;

    await sock
      .sendMessage(from, {
        text: '🔗 *Download link ලබාගනිමින්...*',
        edit: loading.key,
      })
      .catch(() => {});

    // 1) ytdl API
    const info = await getYtdlInfo(ytUrl);
    const title = info.title || item.title || 'Song';
    const duration =
      item.duration && item.duration !== 'N/A'
        ? item.duration
        : formatDuration(info.duration);
    const author = item.author || 'YouTube';
    const thumb = item.thumbnail || null;
    const quality = info.quality || 'mp3';

    await sock
      .sendMessage(from, {
        text: '⬇️ *MP3 download කරමින්...*',
        edit: loading.key,
      })
      .catch(() => {});

    // 2) Download direct_link
    let { status, contentType, buffer } = await downloadBuffer(info.direct_link);

    // axios fallback if native empty/404
    if (status !== 200 || !buffer.length || buffer.length < 2000) {
      console.log('[SONG] native fail status=', status, 'size=', buffer.length, '— axios retry');
      const ax = await axios.get(info.direct_link, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'audio/mpeg,audio/*,*/*',
          Referer: 'https://www.youtube.com/',
        },
        decompress: false,
      });
      status = ax.status;
      contentType = String(ax.headers['content-type'] || '');
      buffer = Buffer.from(ax.data || []);
    }

    console.log('[SONG] audio status=', status, 'ct=', contentType, 'size=', buffer.length);

    if (status !== 200 || buffer.length < 2000) {
      let errDetail = `HTTP ${status}, ${buffer.length} bytes`;
      if (buffer.length > 0 && buffer.length < 500) {
        errDetail += ' · ' + buffer.toString('utf8').slice(0, 120);
      }
      throw new Error(
        'MP3 download fail (' +
          errDetail +
          '). Link expired or CDN blocked. Try another result.'
      );
    }

    // reject HTML/JSON bodies
    const head = buffer.slice(0, 40).toString('utf8').trim();
    if (head.startsWith('<') || head.startsWith('{')) {
      throw new Error('Download returned HTML/JSON instead of audio');
    }

    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    if (buffer.length > MAX_WA_BYTES) {
      return sock.sendMessage(from, {
        text: `❌ File ලොකුයි (*${sizeMB} MB*).`,
        edit: loading.key,
      });
    }

    // Detect mimetype
    let mimetype = 'audio/mpeg';
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) mimetype = 'audio/mpeg';
    else if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) mimetype = 'audio/mpeg';
    else if (contentType.includes('mp4') || contentType.includes('m4a')) mimetype = 'audio/mp4';
    else if (contentType.includes('webm')) mimetype = 'audio/webm';
    else if (contentType.includes('ogg')) mimetype = 'audio/ogg';

    const caption = `
╭───「 🎵 *SONG* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 60)}
│  👤 *Artist*   ›  ${String(author).slice(0, 40)}
│  ⏱ *Duration* ›  ${duration}
│  🎧 *Quality*  ›  ${quality}
│  📦 *Size*     ›  ${sizeMB} MB
│
╰──────────────────────╯`.trim();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (thumb && /^https?:\/\//i.test(thumb)) {
      try {
        await sock.sendMessage(from, { image: { url: thumb }, caption }, { quoted: msg });
      } catch (_) {
        await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
      }
    } else {
      await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
    }

    const fileName = `${sanitizeFileName(title)}.mp3`;

    try {
      await sock.sendMessage(
        from,
        { audio: buffer, mimetype, fileName, ptt: false },
        { quoted: msg }
      );
    } catch (e1) {
      console.error('[SONG] audio send fail:', e1.message);
      await sock.sendMessage(
        from,
        {
          document: buffer,
          mimetype: 'audio/mpeg',
          fileName,
          caption: '🎵 ' + String(title).slice(0, 50),
        },
        { quoted: msg }
      );
    }
  } catch (err) {
    console.error('Song Download Error:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌ Song download fail.\n\n\`${err.message}\`\n\n💡 වෙන number එකක් try කරන්න.`,
        edit: loading.key,
      })
      .catch(() => {});
  }
}

module.exports = {
  name: 'song',
  aliases: ['s', 'ytsong', 'music'],
  description: 'Search & download song (YouTube)',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // .song 1
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const p = pending.get(from);
      if (!p || !p.results?.length) {
        return sock.sendMessage(
          from,
          { text: `❌ Active search නැහැ.\n💡 \`${prefix}song <name>\`` },
          { quoted: msg }
        );
      }
      if (idx < 0 || idx >= p.results.length) {
        return sock.sendMessage(
          from,
          { text: `❌ *1*–*${p.results.length}* තෝරන්න.` },
          { quoted: msg }
        );
      }
      clearTimeout(p.timeout);
      pending.delete(from);
      return downloadAndSend({ sock, msg, from, item: p.results[idx] });
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🎵 *SONG* 」───╮
│
│  ${prefix}song <name>
│  ${prefix}song <youtube url>
│  ${prefix}song <number>
│
│  Example:
│  ${prefix}song Dannawada maa
│  ${prefix}song 1
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const isUrl = /youtube\.com|youtu\.be/i.test(query);

    if (isUrl) {
      return downloadAndSend({
        sock,
        msg,
        from,
        item: {
          url: query,
          title: 'YouTube Song',
          author: 'YouTube',
          duration: 'N/A',
          thumbnail: null,
        },
      });
    }

    // Search
    const loading = await sock.sendMessage(
      from,
      { text: '🔍 *Song හොයමින්...*' },
      { quoted: msg }
    );

    try {
      const res = await axios.get(SEARCH_API, {
        params: { apiKey: API_KEY, text: query },
        timeout: 45000,
        validateStatus: () => true,
      });

      if (res.status !== 200 || !res.data || res.data.success === false) {
        return sock.sendMessage(from, {
          text: `❌ Search fail.\n\`${res.data?.message || 'error'}\``,
          edit: loading.key,
        });
      }

      const results = Array.isArray(res.data.results)
        ? res.data.results
        : Array.isArray(res.data.result)
          ? res.data.result
          : [];

      const cleaned = results
        .filter((r) => r && (r.url || r.link))
        .slice(0, 10)
        .map((r, i) => ({
          index: i + 1,
          title: r.title || 'Untitled',
          duration: r.duration || 'N/A',
          views: r.views || 0,
          author: r.author || r.channel || 'Unknown',
          url: r.url || r.link,
          thumbnail: r.thumbnail || r.thumb || null,
        }));

      if (!cleaned.length) {
        return sock.sendMessage(from, {
          text: '❌ Results හමු නොවීය.',
          edit: loading.key,
        });
      }

      const existing = pending.get(from);
      if (existing?.timeout) clearTimeout(existing.timeout);
      const timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
      pending.set(from, { results: cleaned, timeout });

      let list = `╭───「 🎵 *SONG SEARCH* 」───╮\n│\n│  🔎 *${query.slice(0, 40)}*\n│\n`;
      cleaned.forEach((item) => {
        list +=
          `│  *${item.index}.* ${String(item.title).slice(0, 42)}\n` +
          `│      ⏱ ${item.duration} · 👁 ${formatViews(item.views)}\n` +
          `│      👤 ${String(item.author).slice(0, 28)}\n│\n`;
      });
      list += `│  👇 *${prefix}song <number>*\n│  ⏳ 2 min\n╰──────────────────────╯`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (cleaned[0].thumbnail) {
        try {
          await sock.sendMessage(
            from,
            { image: { url: cleaned[0].thumbnail }, caption: list },
            { quoted: msg }
          );
          return;
        } catch (_) {}
      }
      await sock.sendMessage(from, { text: list }, { quoted: msg });
    } catch (err) {
      console.error('Song Search Error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ \`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
