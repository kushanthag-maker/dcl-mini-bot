const axios = require('axios');
const https = require('https');
const http = require('http');
const config = require('../../config');

const API_KEY = 'zan_FLUs8y9T_fcz7cgi12p';
const SEARCH_API = 'https://api.zanta-mini.store/api/sinhalasub/search';
const DL_API = 'https://api.zanta-mini.store/api/sinhalasub/dl';
const PENDING_TTL_MS = 3 * 60 * 1000;
// WhatsApp practical send limit (document)
const MAX_SEND_BYTES = 95 * 1024 * 1024;

const pending = new Map(); // from -> state

function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/(?:www\.)?sinhalasub\.lk\/[^\s]+/i);
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function formatBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
  return b + ' B';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function searchMovies(query) {
  const res = await axios.get(SEARCH_API, {
    params: { apiKey: API_KEY, text: query },
    timeout: 45000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.success === false) {
    throw new Error(res.data?.message || `Search HTTP ${res.status}`);
  }
  const results = Array.isArray(res.data.results)
    ? res.data.results
    : Array.isArray(res.data.result)
      ? res.data.result
      : [];
  return results
    .filter((r) => r && (r.url || r.link))
    .slice(0, 12)
    .map((r, i) => ({
      index: i + 1,
      title: (r.title || r.name || 'Untitled').trim(),
      url: r.url || r.link,
      thumbnail: (r.thumbnail || r.thumb || '').toString().trim() || null,
    }));
}

async function fetchDl(pageUrl) {
  const res = await axios.get(DL_API, {
    params: { apiKey: API_KEY, text: pageUrl },
    timeout: 60000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.success === false) {
    throw new Error(res.data?.message || res.data?.error || `DL HTTP ${res.status}`);
  }
  const r = res.data.results || res.data.result || res.data.data || {};
  const links = Array.isArray(r.links) ? r.links : [];
  return {
    title: (r.title || '').trim(),
    rating: r.rating || 'N/A',
    thumbnail: (r.thumbnail || '').toString().trim() || null,
    links,
  };
}

/** Prefer Pixeldrain direct file URLs — only those are real downloads */
function buildQualityList(links) {
  const out = [];
  for (const l of links || []) {
    const url = l.direct_link || l.url || l.link || '';
    const host = String(l.quality || '');
    const sizeLabel = String(l.size || '');
    if (!url) continue;
    // Pixeldrain direct API
    if (/pixeldrain\.com\/api\/file\//i.test(url) || /pixeldrain/i.test(host)) {
      out.push({
        host: 'Pixeldrain',
        label: sizeLabel || host || 'Download',
        url,
      });
    }
  }
  // unique by label
  const seen = new Set();
  return out.filter((x) => {
    const k = x.label + x.url;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function headContentLength(url) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.request(
        url,
        { method: 'HEAD', timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } },
        (res) => {
          // follow one redirect
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            return headContentLength(res.headers.location).then(resolve);
          }
          const cl = parseInt(res.headers['content-length'] || '0', 10) || 0;
          resolve({ status: res.statusCode, length: cl, type: res.headers['content-type'] || '' });
        }
      );
      req.on('error', () => resolve({ status: 0, length: 0, type: '' }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 0, length: 0, type: '' });
      });
      req.end();
    } catch (_) {
      resolve({ status: 0, length: 0, type: '' });
    }
  });
}

function downloadBuffer(url, maxBytes) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        timeout: 600000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return downloadBuffer(res.headers.location, maxBytes).then(resolve, reject);
        }
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          chunks.push(c);
          total += c.length;
          if (maxBytes && total > maxBytes) {
            req.destroy();
            reject(new Error(`File too large while downloading (> ${formatBytes(maxBytes)})`));
          }
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
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

function setPending(from, state) {
  const old = pending.get(from);
  if (old?.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
  pending.set(from, state);
}

async function showQualities({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🎬 *Quality list ලබාගනිමින්...*' },
    { quoted: msg }
  );

  try {
    const details = await fetchDl(item.url);
    const title = details.title || item.title || 'Movie';
    const thumb = details.thumbnail || item.thumbnail || null;
    const qualities = buildQualityList(details.links);

    if (!qualities.length) {
      return sock.sendMessage(from, {
        text: '❌ Downloadable file links (Pixeldrain) හමු නොවීය.\n💡 වෙන movie එකක් try කරන්න.',
        edit: loading.key,
      });
    }

    // probe sizes
    for (const q of qualities) {
      const h = await headContentLength(q.url);
      q.bytes = h.length || 0;
      q.sizeText = q.bytes ? formatBytes(q.bytes) : q.label;
    }

    setPending(from, {
      type: 'quality',
      title,
      thumb,
      qualities,
      pageUrl: item.url,
    });

    let list =
      `╭───「 🎬 *${String(title).slice(0, 40)}* 」───╮\n│\n` +
      `│  ⭐ ${details.rating || 'N/A'}\n│\n` +
      `│  📥 *Quality තෝරන්න:*\n│\n`;

    qualities.forEach((q, i) => {
      const tooBig = q.bytes > MAX_SEND_BYTES;
      list += `│  *${i + 1}.* ${q.label}  ·  ${q.sizeText}${tooBig ? '  ⚠️ WA limit' : ''}\n`;
    });

    list += `\n│  👇 *${config.prefix || '.'}ssub <number>*\n│  ⏳ 3 min\n│\n`;
    list += `│  ⚠️ 100MB+ files WhatsApp එකට යවන්න බැහැ\n`;
    list += `╰──────────────────────╯`;

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (thumb && /^https?:\/\//i.test(thumb)) {
      try {
        await sock.sendMessage(
          from,
          { image: { url: thumb }, caption: list },
          { quoted: msg }
        );
        return;
      } catch (_) {}
    }
    await sock.sendMessage(from, { text: list }, { quoted: msg });
  } catch (err) {
    console.error('SSub quality error:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌ \`${err.message}\``,
        edit: loading.key,
      })
      .catch(() => {});
  }
}

async function downloadQuality({ sock, msg, from, quality, title, thumb }) {
  const loading = await sock.sendMessage(
    from,
    { text: `📥 *Download start...*\n🎬 ${quality.label}\n📦 ${quality.sizeText || ''}` },
    { quoted: msg }
  );

  try {
    let bytes = quality.bytes || 0;
    if (!bytes) {
      const h = await headContentLength(quality.url);
      bytes = h.length || 0;
    }

    if (bytes > MAX_SEND_BYTES) {
      return sock.sendMessage(from, {
        text:
          `❌ *File ගොඩක් ලොකුයි*\n\n` +
          `📦 Size: *${formatBytes(bytes)}*\n` +
          `📱 WhatsApp limit: ~95MB\n\n` +
          `💡 *${quality.label}* WhatsApp එකට යවන්න බැහැ.\n` +
          `SD/ලොකු නොවන file එකක් තියෙන movie එකක් try කරන්න.`,
        edit: loading.key,
      });
    }

    await sock
      .sendMessage(from, {
        text: `⬇️ *Downloading...*\n⏳ ${formatBytes(bytes) || quality.sizeText}`,
        edit: loading.key,
      })
      .catch(() => {});

    const buffer = await downloadBuffer(quality.url, MAX_SEND_BYTES + 5 * 1024 * 1024);

    if (!buffer || buffer.length < 10000) {
      throw new Error('Downloaded file empty / invalid');
    }

    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    const caption = `
╭───「 🎬 *SINHALASUB* 」───╮
│
│  📌 *Title*   ›  ${String(title).slice(0, 60)}
│  🎥 *Quality* ›  ${quality.label}
│  📦 *Size*    ›  ${sizeMB} MB
│
╰──────────────────────╯`.trim();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (thumb && /^https?:\/\//i.test(thumb)) {
      await sock
        .sendMessage(from, { image: { url: thumb }, caption }, { quoted: msg })
        .catch(() => sock.sendMessage(from, { text: caption }, { quoted: msg }));
    } else {
      await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
    }

    const fileName = `${String(title)
      .replace(/[\/\\:*?"<>|]/g, '')
      .slice(0, 40) || 'movie'}.mp4`;

    try {
      if (buffer.length > 64 * 1024 * 1024) {
        await sock.sendMessage(
          from,
          {
            document: buffer,
            mimetype: 'video/mp4',
            fileName,
            caption: '📁 Movie file',
          },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          from,
          { video: buffer, mimetype: 'video/mp4', caption: fileName, fileName },
          { quoted: msg }
        );
      }
    } catch (e1) {
      console.error('SSub send fail:', e1.message);
      await sock.sendMessage(
        from,
        {
          document: buffer,
          mimetype: 'video/mp4',
          fileName,
          caption: '📁 Movie (document)',
        },
        { quoted: msg }
      );
    }
  } catch (err) {
    console.error('SSub download error:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌ Download fail.\n\n\`${err.message}\``,
        edit: loading.key,
      })
      .catch(() => {});
  }
}

module.exports = {
  name: 'ssub',
  aliases: ['sinhalasub', 'movie', 'movies'],
  description: 'Search & download SinhalaSub movies',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // Number reply
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const state = pending.get(from);

      // Quality selection
      if (state?.type === 'quality') {
        if (idx < 0 || idx >= state.qualities.length) {
          return sock.sendMessage(
            from,
            { text: `❌ *1*–*${state.qualities.length}* තෝරන්න.` },
            { quoted: msg }
          );
        }
        const q = state.qualities[idx];
        // keep pending for more tries? clear
        if (state.timeout) clearTimeout(state.timeout);
        pending.delete(from);
        return downloadQuality({
          sock,
          msg,
          from,
          quality: q,
          title: state.title,
          thumb: state.thumb,
        });
      }

      // Search selection
      if (state?.type === 'search') {
        if (idx < 0 || idx >= state.results.length) {
          return sock.sendMessage(
            from,
            { text: `❌ *1*–*${state.results.length}* තෝරන්න.` },
            { quoted: msg }
          );
        }
        const item = state.results[idx];
        return showQualities({ sock, msg, from, item });
      }

      return sock.sendMessage(
        from,
        {
          text: `❌ Active search නැහැ.\n💡 \`${prefix}ssub <movie name>\``,
        },
        { quoted: msg }
      );
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🎬 *SINHALASUB* 」───╮
│
│  ${prefix}ssub <movie name>
│  ${prefix}ssub <number>     ← movie / quality
│
│  Example:
│  ${prefix}ssub bad newz
│  ${prefix}ssub 1
│  ${prefix}ssub 2
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const direct = extractUrl(query);
    if (direct) {
      return showQualities({
        sock,
        msg,
        from,
        item: { title: 'SinhalaSub', url: direct, thumbnail: null },
      });
    }

    const loading = await sock.sendMessage(
      from,
      { text: '🔍 *Search කරමින්...*' },
      { quoted: msg }
    );

    try {
      const cleaned = await searchMovies(query);
      if (!cleaned.length) {
        return sock.sendMessage(from, {
          text: '❌ Results හමු නොවීය.',
          edit: loading.key,
        });
      }

      setPending(from, { type: 'search', results: cleaned });

      let list = `╭───「 🎬 *SINHALASUB* 」───╮\n│\n│  🔎 *${query.slice(0, 40)}*\n│  📦 ${cleaned.length} results\n│\n`;
      cleaned.forEach((item) => {
        list += `│  *${item.index}.* ${String(item.title).slice(0, 48)}\n`;
      });
      list += `\n│  👇 *${prefix}ssub <number>*\n│  ⏳ 3 min\n╰──────────────────────╯`;

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
      console.error('SSub search:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ \`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
