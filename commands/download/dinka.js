const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/movie/dinkamovies/search';
const INFO_API = 'https://api.chamindu.site/api/v1/movie/dinkamovies/info';
const PENDING_TTL_MS = 3 * 60 * 1000;
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';

const pending = new Map();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractDinkaUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?dinkamovieslk\.app\/[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

/** Extract Google Drive file ID */
function gdriveId(url) {
  if (!url) return null;
  const s = String(url);
  let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

/** Convert any host link → Baileys-friendly direct URL */
function toDirectFileUrl(link) {
  if (!link || typeof link !== 'string') return null;
  let u = link.trim();
  if (!/^https?:\/\//i.test(u)) return null;

  // skip chat bots
  if (/wa\.me|t\.me|telegram|whatsapp/i.test(u)) return null;

  // Pixeldrain /u/ID → api file
  const pd = u.match(/pixeldrain\.com\/u\/([a-zA-Z0-9]+)/i);
  if (pd) return `https://pixeldrain.com/api/file/${pd[1]}?download`;

  if (/pixeldrain\.com\/api\/file\//i.test(u)) {
    return u.includes('download') ? u : u.replace(/\/?$/, '') + '?download';
  }

  // Google Drive → direct export
  const gid = gdriveId(u);
  if (gid) {
    return `https://drive.google.com/uc?export=download&id=${gid}&confirm=t`;
  }

  // R2 / CDN / portal / other https — use as-is
  return u;
}

function hostLabel(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('pixeldrain')) return '📦 Pixeldrain';
  if (u.includes('drive.google')) return '☁ Google Drive';
  if (u.includes('r2.dev')) return '⚡ R2 CDN';
  if (u.includes('dinkamovieslk')) return '🌐 Dinka Portal';
  try {
    return '🔗 ' + new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '🔗 Link';
  }
}

function cleanQuality(q) {
  return String(q || 'Download')
    .replace(/📥|⬇|🔗/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Download';
}

function normalizeDownloads(list) {
  if (!Array.isArray(list)) return [];
  const out = [];

  for (const d of list) {
    const candidates = [
      d.direct_link,
      d.gdrive_link,
      d.link,
      d.url,
      d.download,
      d.portal_link,
    ];

    let direct = null;
    let raw = null;
    for (const c of candidates) {
      const resolved = toDirectFileUrl(c);
      if (resolved) {
        direct = resolved;
        raw = c;
        break;
      }
    }
    if (!direct) continue;

    out.push({
      quality: cleanQuality(d.quality || d.label || d.name),
      size: d.size && String(d.size).toUpperCase() !== 'N/A' ? String(d.size) : 'N/A',
      type: d.type || hostLabel(direct),
      url: direct,
      raw,
    });
  }

  const seen = new Set();
  return out.filter((x) => {
    if (seen.has(x.url)) return false;
    seen.add(x.url);
    return true;
  });
}

function setPending(from, state) {
  const old = pending.get(from);
  if (old?.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
  pending.set(from, state);
}

function foot() {
  return `\n> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`;
}

async function fetchInfo(pageUrl) {
  const res = await axios.get(INFO_API, {
    params: { url: pageUrl, api_key: API_KEY },
    timeout: 60000,
    validateStatus: () => true,
    headers: { 'User-Agent': UA },
  });
  if (res.status !== 200 || !res.data) throw new Error(`Info HTTP ${res.status}`);
  if (res.data.status === false || res.data.success === false) {
    throw new Error(res.data.error || res.data.message || 'Info failed');
  }
  return res.data.data || res.data.result || res.data;
}

async function showQualities({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🎬✨ *𝐌𝐨𝐯𝐢𝐞 𝐢𝐧𝐟𝐨 𝐥𝐨𝐚𝐝𝐢𝐧𝐠...*' },
    { quoted: msg }
  );

  try {
    const info = await fetchInfo(item.url);
    const title = info.title || item.title || 'Dinka Movie';
    const poster = info.poster || item.poster || null;
    const year = item.year || info.year || 'N/A';
    const downloads = normalizeDownloads(info.downloads || info.download || []);

    if (!downloads.length) {
      return sock.sendMessage(from, {
        text: '❌😥 *𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝 𝐥𝐢𝐧𝐤𝐬 𝐧𝐨𝐭 𝐟𝐨𝐮𝐧𝐝*' + foot(),
        edit: loading.key,
      });
    }

    setPending(from, {
      type: 'quality',
      title,
      poster,
      year,
      downloads,
      pageUrl: item.url,
    });

    let list =
      `╭───「 🎥🍿 *𝐃𝐈𝐍𝐊𝐀 𝐌𝐎𝐕𝐈𝐄𝐒* 」───╮\n│\n` +
      `│  📌 *𝐓𝐢𝐭𝐥𝐞*  ›  ${String(title).slice(0, 52)}\n` +
      `│  📅 *𝐘𝐞𝐚𝐫*   ›  ${year}\n` +
      `│  📦 *𝐅𝐢𝐥𝐞𝐬*  ›  ${downloads.length}\n│\n` +
      `│  📥 *𝐐𝐮𝐚𝐥𝐢𝐭𝐲 𝐬𝐞𝐥𝐞𝐜𝐭:*\n│\n`;

    downloads.forEach((d, i) => {
      list += `│  *${i + 1}.* ${d.quality}\n`;
      list += `│      💾 ${d.size} · ${d.type}\n`;
    });

    list +=
      `\n│  👇 *${config.prefix || '.'}dinka <number>*\n` +
      `│  ⏳ 3 𝐦𝐢𝐧 · 📡 𝐳𝐞𝐫𝐨-𝐑𝐀𝐌\n` +
      `╰──────────────────────╯` +
      foot();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (poster && /^https?:\/\//i.test(poster)) {
      try {
        await sock.sendMessage(
          from,
          { image: { url: poster }, caption: list },
          { quoted: msg }
        );
        return;
      } catch (_) {}
    }
    await sock.sendMessage(from, { text: list }, { quoted: msg });
  } catch (err) {
    console.error('Dinka info:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💥 \`${err.message}\`` + foot(),
        edit: loading.key,
      })
      .catch(() => {});
  }
}

async function sendDocument({ sock, msg, from, quality, title, poster }) {
  const loading = await sock.sendMessage(
    from,
    {
      text: `⬆️📡 *𝐃𝐨𝐜𝐮𝐦𝐞𝐧𝐭 𝐬𝐭𝐫𝐞𝐚𝐦...*\n🎬 ${quality.quality}\n💾 ${quality.size}`,
    },
    { quoted: msg }
  );

  try {
    const caption =
      `╭───「 🎬✨ *𝐃𝐈𝐍𝐊𝐀* 」───╮\n│\n` +
      `│  📌 *𝐓𝐢𝐭𝐥𝐞*   ›  ${String(title).slice(0, 52)}\n` +
      `│  🎥 *𝐐𝐮𝐚𝐥𝐢𝐭𝐲* ›  ${quality.quality}\n` +
      `│  💾 *𝐒𝐢𝐳𝐞*    ›  ${quality.size}\n` +
      `│  🏷️ *𝐇𝐨𝐬𝐭*    ›  ${quality.type}\n` +
      `│  📁 *𝐓𝐲𝐩𝐞*    ›  Document\n│\n` +
      `╰──────────────────────╯` +
      foot();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (poster && /^https?:\/\//i.test(poster)) {
      await sock
        .sendMessage(from, { image: { url: poster }, caption }, { quoted: msg })
        .catch(() =>
          sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {})
        );
    } else {
      await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
    }

    const fileName =
      (String(title).replace(/[\/\\:*?"<>|]/g, '').slice(0, 40).trim() || 'dinka') +
      '.mp4';

    // Zero-RAM: Baileys pulls URL (GDrive / Pixeldrain / R2)
    await sock.sendMessage(
      from,
      {
        document: { url: quality.url },
        mimetype: 'video/mp4',
        fileName,
        caption: `📁🎬 *${quality.quality}*\n> ✦ ${FOOTER} ✦`,
      },
      { quoted: msg }
    );
  } catch (err) {
    console.error('Dinka send:', err.message);
    await sock
      .sendMessage(from, {
        text:
          `❌💥 *𝐔𝐩𝐥𝐨𝐚𝐝 𝐟𝐚𝐢𝐥*\n\n\`${err.message}\`\n\n` +
          `💡 GDrive virus-scan page නම් fail වෙන්න පුළුවන්.` +
          foot(),
        edit: loading.key,
      })
      .catch(() => {});
  }
}

module.exports = {
  name: 'dinka',
  aliases: ['dinkamovie', 'dinkamovies', 'dm'],
  description: 'Search & download Dinka Movies',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const state = pending.get(from);

      if (state?.type === 'quality') {
        if (idx < 0 || idx >= state.downloads.length) {
          return sock.sendMessage(
            from,
            { text: `❌ *1*–*${state.downloads.length}* 𝐬𝐞𝐥𝐞𝐜𝐭 🙏` + foot() },
            { quoted: msg }
          );
        }
        const q = state.downloads[idx];
        if (state.timeout) clearTimeout(state.timeout);
        pending.delete(from);
        return sendDocument({
          sock,
          msg,
          from,
          quality: q,
          title: state.title,
          poster: state.poster,
        });
      }

      if (state?.type === 'search') {
        if (idx < 0 || idx >= state.results.length) {
          return sock.sendMessage(
            from,
            { text: `❌ *1*–*${state.results.length}* 𝐬𝐞𝐥𝐞𝐜𝐭 🙏` + foot() },
            { quoted: msg }
          );
        }
        return showQualities({ sock, msg, from, item: state.results[idx] });
      }

      return sock.sendMessage(
        from,
        {
          text: `❌ Active search නැහැ 😅\n💡 \`${prefix}dinka <movie>\`` + foot(),
        },
        { quoted: msg }
      );
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 🎥🍿 *𝐃𝐈𝐍𝐊𝐀 𝐌𝐎𝐕𝐈𝐄𝐒* 」───╮\n│\n` +
            `│  ${prefix}dinka <movie name>\n` +
            `│  ${prefix}dinka <number>\n` +
            `│  ${prefix}dinka <dinka url>\n│\n` +
            `│  📌 Example:\n` +
            `│  ${prefix}dinka Gamani\n` +
            `│  ${prefix}dinka 1\n│\n` +
            `│  📡 Zero-RAM · GDrive / PD / R2\n` +
            `╰──────────────────────╯` +
            foot(),
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const direct = extractDinkaUrl(query);
    if (direct) {
      return showQualities({
        sock,
        msg,
        from,
        item: { title: 'Dinka Movie', url: direct, poster: null, year: 'N/A' },
      });
    }

    const loading = await sock.sendMessage(
      from,
      { text: '🔍✨ *𝐃𝐢𝐧𝐤𝐚 𝐬𝐞𝐚𝐫𝐜𝐡...*' },
      { quoted: msg }
    );

    try {
      const res = await axios.get(SEARCH_API, {
        params: { q: query, api_key: API_KEY },
        timeout: 45000,
        validateStatus: () => true,
        headers: { 'User-Agent': UA },
      });

      if (res.status !== 200 || !res.data) {
        return sock.sendMessage(from, {
          text: `❌ Search HTTP ${res.status}` + foot(),
          edit: loading.key,
        });
      }
      if (res.data.status === false || res.data.success === false) {
        return sock.sendMessage(from, {
          text: `❌ \`${res.data.error || res.data.message || 'fail'}\`` + foot(),
          edit: loading.key,
        });
      }

      const results = Array.isArray(res.data.data)
        ? res.data.data
        : Array.isArray(res.data.results)
          ? res.data.results
          : [];

      const cleaned = results
        .filter((r) => r && (r.url || r.link))
        .slice(0, 12)
        .map((r, i) => ({
          index: i + 1,
          title: r.title || 'Untitled',
          url: r.url || r.link,
          poster: r.poster || r.image || r.thumbnail || null,
          year: r.year || 'N/A',
        }));

      if (!cleaned.length) {
        return sock.sendMessage(from, {
          text: '❌😥 *𝐍𝐨 𝐫𝐞𝐬𝐮𝐥𝐭𝐬*' + foot(),
          edit: loading.key,
        });
      }

      setPending(from, { type: 'search', results: cleaned });

      let list =
        `╭───「 🎥🍿 *𝐃𝐈𝐍𝐊𝐀 𝐒𝐄𝐀𝐑𝐂𝐇* 」───╮\n│\n` +
        `│  🔎 *${query.slice(0, 40)}*\n` +
        `│  📦 ${cleaned.length} 𝐫𝐞𝐬𝐮𝐥𝐭𝐬\n│\n`;

      cleaned.forEach((item) => {
        list += `│  *${item.index}.* ${String(item.title).slice(0, 45)}\n`;
        list += `│      📅 ${item.year}\n`;
      });

      list +=
        `\n│  👇 *${prefix}dinka <number>*\n│  ⏳ 3 𝐦𝐢𝐧\n╰──────────────────────╯` +
        foot();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (cleaned[0].poster && /^https?:\/\//i.test(cleaned[0].poster)) {
        try {
          await sock.sendMessage(
            from,
            { image: { url: cleaned[0].poster }, caption: list },
            { quoted: msg }
          );
          return;
        } catch (_) {}
      }
      await sock.sendMessage(from, { text: list }, { quoted: msg });
    } catch (err) {
      console.error('Dinka search:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌💥 \`${err.message}\`` + foot(),
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
