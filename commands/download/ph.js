const axios = require('axios');
const config = require('../../config');

const SEARCH_API = 'https://porn-hub-scrap.vercel.app/api/search';
const DL_API = 'https://porn-hub-scrap.vercel.app/api/download';
const PENDING_TTL_MS = 2 * 60 * 1000;
const MAX_WA_BYTES = 95 * 1024 * 1024;
const MAX_SEGMENTS = 400; // safety cap

const pending = new Map();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractPhUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?pornhub\.com\/view_video\.php\?[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function pickHls(links) {
  const hls = (links || []).filter(
    (l) => l && l.url && String(l.format || '').toLowerCase() === 'hls'
  );
  for (const pref of ['480', '720', '240', '1080']) {
    const hit = hls.find((l) => String(l.quality) === pref);
    if (hit) return hit;
  }
  return hls[0] || null;
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch (_) {
    return relative;
  }
}

/** Fetch text playlist */
async function fetchText(url) {
  const res = await axios.get(url, {
    timeout: 45000,
    responseType: 'text',
    headers: { 'User-Agent': UA, Referer: 'https://www.pornhub.com/', Accept: '*/*' },
  });
  return { url, body: String(res.data || '') };
}

/** Parse m3u8 → segment URLs (or nested playlist) */
function parseM3u8(body, baseUrl) {
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  const segments = [];
  let nested = null;
  let isMaster = body.includes('#EXT-X-STREAM-INF');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('#')) continue;
    const abs = resolveUrl(baseUrl, line);
    if (isMaster && !nested) {
      nested = abs; // first variant
    } else if (!isMaster) {
      segments.push(abs);
    }
  }
  return { isMaster, nested, segments };
}

/**
 * Download HLS → single Buffer (MPEG-TS concat)
 * No ffmpeg — pure axios segment download
 */
async function downloadHlsBuffer(masterUrl, onProgress) {
  // 1) Master playlist
  let { url: curUrl, body } = await fetchText(masterUrl);
  let parsed = parseM3u8(body, curUrl);

  // 2) Nested index if master
  if (parsed.isMaster && parsed.nested) {
    const idx = await fetchText(parsed.nested);
    curUrl = idx.url;
    body = idx.body;
    parsed = parseM3u8(body, curUrl);
  }

  const segs = parsed.segments.slice(0, MAX_SEGMENTS);
  if (!segs.length) {
    throw new Error('HLS segments හොයාගන්න බැරි වුණා');
  }

  const chunks = [];
  let total = 0;

  // sequential is safer for memory + order; small concurrency
  const CONCURRENCY = 4;
  for (let i = 0; i < segs.length; i += CONCURRENCY) {
    const batch = segs.slice(i, i + CONCURRENCY);
    const parts = await Promise.all(
      batch.map(async (segUrl) => {
        const res = await axios.get(segUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
          maxContentLength: 30 * 1024 * 1024,
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
        throw new Error(`File too large while downloading (${(total / 1024 / 1024).toFixed(1)} MB)`);
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

async function downloadAndSend({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '📥 *PH download...*\n⏳ Stream buffer වෙමින්' },
    { quoted: msg }
  );

  try {
    const pageUrl = item.page_link || item.url;
    const apiRes = await axios.get(DL_API, {
      params: { url: pageUrl },
      timeout: 90000,
      validateStatus: () => true,
    });

    if (apiRes.status !== 200 || !apiRes.data || apiRes.data.success === false) {
      throw new Error(apiRes.data?.message || apiRes.data?.error || `HTTP ${apiRes.status}`);
    }

    const title = apiRes.data.title || item.title || 'PH Video';
    const links = apiRes.data.download_links || [];
    const picked = pickHls(links);

    if (!picked || !picked.url) {
      throw new Error('Download stream හොයාගන්න බැරි වුණා');
    }

    await sock
      .sendMessage(from, {
        text: `⬇️ *Buffering segments...*\n🎬 ${picked.quality || ''}p\n📡 No ffmpeg — pure stream`,
        edit: loading.key,
      })
      .catch(() => {});

    let lastPct = -1;
    const buffer = await downloadHlsBuffer(picked.url, async (done, total, bytes) => {
      const pct = Math.floor((done / total) * 100);
      if (pct >= lastPct + 20 || done === total) {
        lastPct = pct;
        await sock
          .sendMessage(from, {
            text: `⬇️ *Downloading...*\n📦 ${done}/${total} parts · ${(bytes / 1024 / 1024).toFixed(1)} MB`,
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

    const caption = `
╭───「 🔥 *PORNHUB* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 60)}
│  ⏱ *Duration* ›  ${item.duration || 'N/A'}
│  👁 *Views*    ›  ${item.views || 'N/A'}
│  🎬 *Quality*  ›  ${picked.quality || 'auto'}p
│  📦 *Size*     ›  ${sizeMB} MB
│
╰──────────────────────╯`.trim();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    // Always document (SinhalaSub style)
    const safeName =
      String(title)
        .replace(/[\/\\:*?"<>|]/g, '')
        .slice(0, 40)
        .trim() || 'ph-video';

    await sock.sendMessage(
      from,
      {
        document: buffer,
        mimetype: 'video/mp4',
        fileName: `${safeName}.mp4`,
        caption: caption + '\n\n📁 *Document*',
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
        item: { title: 'PH Video', page_link: direct, duration: 'N/A', views: 'N/A' },
      });
    }

    const loading = await sock.sendMessage(
      from,
      { text: '🔍 *PH search...*' },
      { quoted: msg }
    );

    try {
      const res = await axios.get(SEARCH_API, {
        params: { q: query },
        timeout: 45000,
        validateStatus: () => true,
      });

      if (res.status !== 200 || !res.data || res.data.success === false) {
        return sock.sendMessage(from, {
          text: `❌ Search fail.\n\`${res.data?.message || 'error'}\``,
          edit: loading.key,
        });
      }

      const data = Array.isArray(res.data.data) ? res.data.data : [];
      const cleaned = data
        .filter((r) => r && (r.page_link || r.viewkey))
        .slice(0, 12)
        .map((r, i) => ({
          index: i + 1,
          title: r.title || 'Untitled',
          page_link:
            r.page_link ||
            (r.viewkey
              ? `https://www.pornhub.com/view_video.php?viewkey=${r.viewkey}`
              : null),
          duration: r.duration || 'N/A',
          views: r.views || 'N/A',
          thumbnail: r.thumbnail || r.thumb || r.image || null,
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

      let list = `╭───「 🔥 *PH SEARCH* 」───╮\n│\n│  🔎 *${query.slice(0, 40)}*\n│\n`;
      cleaned.forEach((item) => {
        list +=
          `│  *${item.index}.* ${String(item.title).slice(0, 42)}\n` +
          `│      ⏱ ${item.duration} · 👁 ${item.views}\n`;
      });
      list += `\n│  👇 *${prefix}ph <number>*\n╰──────────────────────╯`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

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
        .sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key })
        .catch(() => {});
    }
  },
};
