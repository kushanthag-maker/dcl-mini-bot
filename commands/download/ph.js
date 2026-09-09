const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/adult/pornhub/search';
const DL_API = 'https://api.chamindu.site/api/adult/pornhub/dl';
const STREAM_BASE = 'https://api.chamindu.site';
const PENDING_TTL_MS = 2 * 60 * 1000;
const MAX_WA_BYTES = 95 * 1024 * 1024;
const MAX_SEGMENTS = 350;

const pending = new Map();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractPhUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?pornhub\.com\/view_video\.php\?[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch (_) {
    return relative;
  }
}

async function fetchText(url) {
  const res = await axios.get(url, {
    timeout: 45000,
    responseType: 'text',
    headers: {
      'User-Agent': UA,
      Referer: 'https://www.pornhub.com/',
      Accept: '*/*',
    },
  });
  return { url, body: String(res.data || '') };
}

function parseM3u8(body, baseUrl) {
  const lines = String(body || '').split(/\r?\n/).map((l) => l.trim());
  const isMaster = body.includes('#EXT-X-STREAM-INF');
  const segments = [];
  let nested = null;
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const abs = resolveUrl(baseUrl, line);
    if (isMaster && !nested) nested = abs;
    else if (!isMaster) segments.push(abs);
  }
  return { isMaster, nested, segments };
}

/** Pure Node HLS → buffer (no ffmpeg) */
async function downloadHlsBuffer(masterUrl, onProgress) {
  let { url: curUrl, body } = await fetchText(masterUrl);
  let parsed = parseM3u8(body, curUrl);

  if (parsed.isMaster && parsed.nested) {
    const idx = await fetchText(parsed.nested);
    curUrl = idx.url;
    body = idx.body;
    parsed = parseM3u8(body, curUrl);
  }

  const segs = parsed.segments.slice(0, MAX_SEGMENTS);
  if (!segs.length) throw new Error('HLS segments හොයාගන්න බැරි වුණා');

  const chunks = [];
  let total = 0;
  const CONCURRENCY = 4;

  for (let i = 0; i < segs.length; i += CONCURRENCY) {
    const batch = segs.slice(i, i + CONCURRENCY);
    const parts = await Promise.all(
      batch.map(async (segUrl) => {
        const res = await axios.get(segUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
          maxContentLength: 25 * 1024 * 1024,
          headers: {
            'User-Agent': UA,
            Referer: 'https://www.pornhub.com/',
            Accept: '*/*',
          },
        });
        return Buffer.from(res.data || []);
      })
    );
    for (const p of parts) {
      chunks.push(p);
      total += p.length;
      if (total > MAX_WA_BYTES + 5 * 1024 * 1024) {
        throw new Error(`File too large (${(total / 1024 / 1024).toFixed(1)} MB)`);
      }
    }
    if (onProgress) {
      try {
        await onProgress(Math.min(i + CONCURRENCY, segs.length), segs.length, total);
      } catch (_) {}
    }
  }
  return Buffer.concat(chunks);
}

function pickMediaUrl(data) {
  if (!data || typeof data !== 'object') return null;
  const candidates = [
    data.direct_link,
    data.download_url,
    data.raw_link,
    data.url,
    data.link,
  ].filter(Boolean);

  // Prefer non-m3u8 if any
  const mp4 = candidates.find((u) => typeof u === 'string' && !u.includes('.m3u8'));
  if (mp4) return { url: mp4, kind: 'mp4' };

  if (data.stream_proxy) {
    const proxy = String(data.stream_proxy).startsWith('http')
      ? data.stream_proxy
      : STREAM_BASE + data.stream_proxy;
    return { url: proxy, kind: 'hls' };
  }

  const hls = candidates.find((u) => typeof u === 'string' && u.includes('.m3u8'));
  if (hls) return { url: hls, kind: 'hls' };

  return candidates[0] ? { url: candidates[0], kind: 'unknown' } : null;
}

async function downloadAndSend({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '📥 *PH download...*' },
    { quoted: msg }
  );

  try {
    const pageUrl = item.url || item.page_link;
    const apiRes = await axios.get(DL_API, {
      params: { url: pageUrl, api_key: API_KEY },
      timeout: 90000,
      validateStatus: () => true,
      headers: { 'User-Agent': UA },
    });

    if (apiRes.status !== 200 || !apiRes.data) {
      throw new Error(`API HTTP ${apiRes.status}`);
    }
    if (apiRes.data.success === false) {
      throw new Error(apiRes.data.error || apiRes.data.message || 'API failed');
    }

    const title = item.title || apiRes.data.title || 'PH Video';
    const media = pickMediaUrl(apiRes.data);
    if (!media) throw new Error('Download link හොයාගන්න බැරි වුණා');

    const thumb = item.thumbnail || null;
    const duration = item.duration || 'N/A';

    const caption = `
╭───「 🔥 *PORNHUB* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 60)}
│  ⏱ *Duration* ›  ${duration}
│  🎬 *Type*     ›  ${media.kind.toUpperCase()}
│
╰──────────────────────╯`.trim();

    // Progressive MP4 → zero-RAM document URL stream
    if (media.kind === 'mp4') {
      await sock
        .sendMessage(from, {
          text: '⬆️ *Document upload (direct MP4)...*',
          edit: loading.key,
        })
        .catch(() => {});

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (thumb && /^https?:\/\//i.test(thumb)) {
        await sock
          .sendMessage(from, { image: { url: thumb }, caption }, { quoted: msg })
          .catch(() =>
            sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {})
          );
      } else {
        await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
      }

      const fileName =
        (String(title).replace(/[\/\\:*?"<>|]/g, '').slice(0, 40) || 'ph') + '.mp4';

      await sock.sendMessage(
        from,
        {
          document: { url: media.url },
          mimetype: 'video/mp4',
          fileName,
          caption: '📁 PH Video',
        },
        { quoted: msg }
      );
      return;
    }

    // HLS → segment buffer → document
    await sock
      .sendMessage(from, {
        text: '⬇️ *HLS segments buffer...*\n⏳ ටිකක් ඉන්න',
        edit: loading.key,
      })
      .catch(() => {});

    let lastPct = -1;
    const buffer = await downloadHlsBuffer(media.url, async (done, total, bytes) => {
      const pct = Math.floor((done / total) * 100);
      if (pct >= lastPct + 25 || done === total) {
        lastPct = pct;
        await sock
          .sendMessage(from, {
            text: `⬇️ *Downloading...*\n📦 ${done}/${total} · ${(bytes / 1024 / 1024).toFixed(1)} MB`,
            edit: loading.key,
          })
          .catch(() => {});
      }
    });

    if (!buffer || buffer.length < 20000) {
      throw new Error('Buffer empty / invalid');
    }

    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    if (buffer.length > MAX_WA_BYTES) {
      return sock.sendMessage(from, {
        text: `❌ File ලොකුයි (*${sizeMB} MB*).`,
        edit: loading.key,
      });
    }

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (thumb && /^https?:\/\//i.test(thumb)) {
      await sock
        .sendMessage(
          from,
          {
            image: { url: thumb },
            caption: caption + `\n│  📦 *Size* ›  ${sizeMB} MB`,
          },
          { quoted: msg }
        )
        .catch(() =>
          sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {})
        );
    } else {
      await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
    }

    const fileName =
      (String(title).replace(/[\/\\:*?"<>|]/g, '').slice(0, 40) || 'ph') + '.mp4';

    await sock.sendMessage(
      from,
      {
        document: buffer,
        mimetype: 'video/mp4',
        fileName,
        caption: '📁 *Document*',
      },
      { quoted: msg }
    );
  } catch (err) {
    console.error('PH Error:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌ PH download fail.\n\n\`${err.message}\``,
        edit: loading.key,
      })
      .catch(() => {});
  }
}

module.exports = {
  name: 'ph',
  aliases: ['pornhub', 'phdl'],
  description: 'Search & download Pornhub videos',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // .ph 1
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const p = pending.get(from);
      if (!p || !p.results?.length) {
        return sock.sendMessage(
          from,
          { text: `❌ Active search නැහැ.\n💡 \`${prefix}ph <query>\`` },
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
          text: `╭───「 🔥 *PORNHUB* 」───╮
│
│  ${prefix}ph <query>
│  ${prefix}ph <number>
│  ${prefix}ph <pornhub url>
│
│  Example:
│  ${prefix}ph japanese
│  ${prefix}ph 1
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const direct = extractPhUrl(query);
    if (direct) {
      return downloadAndSend({
        sock,
        msg,
        from,
        item: {
          title: 'PH Video',
          url: direct,
          duration: 'N/A',
          thumbnail: null,
        },
      });
    }

    const loading = await sock.sendMessage(
      from,
      { text: '🔍 *PH search...*' },
      { quoted: msg }
    );

    try {
      const res = await axios.get(SEARCH_API, {
        params: { q: query, page: 1, api_key: API_KEY },
        timeout: 45000,
        validateStatus: () => true,
        headers: { 'User-Agent': UA },
      });

      if (res.status !== 200 || !res.data || res.data.success === false) {
        return sock.sendMessage(from, {
          text: `❌ Search fail.\n\`${res.data?.error || res.data?.message || 'error'}\``,
          edit: loading.key,
        });
      }

      const results = Array.isArray(res.data.results) ? res.data.results : [];
      const cleaned = results
        .filter((r) => r && (r.url || r.link))
        .slice(0, 12)
        .map((r, i) => ({
          index: i + 1,
          title: r.title || 'Untitled',
          url: r.url || r.link,
          thumbnail: r.thumbnail || r.thumb || r.image || null,
          duration: r.duration || 'N/A',
        }));

      if (!cleaned.length) {
        return sock.sendMessage(from, {
          text: '❌ Results හමු නොවීය.',
          edit: loading.key,
        });
      }

      const existing = pending.get(from);
      if (existing?.timeout) clearTimeout(existing.timeout);
      pending.set(from, {
        results: cleaned,
        timeout: setTimeout(() => pending.delete(from), PENDING_TTL_MS),
      });

      let list = `╭───「 🔥 *PH SEARCH* 」───╮\n│\n│  🔎 *${query.slice(0, 40)}*\n│  📦 ${cleaned.length} results\n│\n`;
      cleaned.forEach((item) => {
        list +=
          `│  *${item.index}.* ${String(item.title).slice(0, 42)}\n` +
          `│      ⏱ ${item.duration}\n`;
      });
      list += `\n│  👇 *${prefix}ph <number>*\n│  ⏳ 2 min\n╰──────────────────────╯`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // Image + list (xnxx style)
      if (cleaned[0].thumbnail && /^https?:\/\//i.test(cleaned[0].thumbnail)) {
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
      console.error('PH Search:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ \`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
