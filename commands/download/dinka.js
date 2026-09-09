const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/movie/dinkamovies/search';
const INFO_API = 'https://api.chamindu.site/api/v1/movie/dinkamovies/info';
const PENDING_TTL_MS = 3 * 60 * 1000;

const pending = new Map();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractDinkaUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?dinkamovieslk\.app\/[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

/** Pixeldrain /u/ID → api direct file URL */
function toDirectFileUrl(link) {
  if (!link || typeof link !== 'string') return null;
  const u = link.trim();

  // already api file
  if (/pixeldrain\.com\/api\/file\//i.test(u)) {
    return u.includes('download') ? u : u.replace(/\/?$/, '') + '?download';
  }

  // https://pixeldrain.com/u/XXXX
  const m = u.match(/pixeldrain\.com\/u\/([a-zA-Z0-9]+)/i);
  if (m) {
    return `https://pixeldrain.com/api/file/${m[1]}?download`;
  }

  // gdrive / other direct-ish
  if (/^https?:\/\//i.test(u) && !/wa\.me|t\.me|telegram/i.test(u)) {
    return u;
  }
  return null;
}

function normalizeDownloads(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const d of list) {
    const raw =
      d.direct_link ||
      d.gdrive_link ||
      d.link ||
      d.url ||
      d.download ||
      null;
    const direct = toDirectFileUrl(raw);
    if (!direct) continue;
    out.push({
      quality: d.quality || d.label || 'Download',
      size: d.size || 'N/A',
      type: d.type || 'File',
      url: direct,
      raw,
    });
  }
  // unique by url
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

async function fetchInfo(pageUrl) {
  const res = await axios.get(INFO_API, {
    params: { url: pageUrl, api_key: API_KEY },
    timeout: 60000,
    validateStatus: () => true,
    headers: { 'User-Agent': UA },
  });
  if (res.status !== 200 || !res.data) {
    throw new Error(`Info HTTP ${res.status}`);
  }
  if (res.data.status === false || res.data.success === false) {
    throw new Error(res.data.error || res.data.message || 'Info failed');
  }
  const data = res.data.data || res.data.result || res.data;
  return data;
}

async function showQualities({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🎬✨ *Movie info ලබාගනිමින්...*' },
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
        text: '❌😥 Downloadable links හමු නොවීය.\n💡 වෙන movie එකක් try කරන්න.',
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
      `╭───「 🎥🍿 *DINKA MOVIES* 」───╮\n│\n` +
      `│  📌 *Title*  ›  ${String(title).slice(0, 55)}\n` +
      `│  📅 *Year*   ›  ${year}\n` +
      `│  📦 *Files*  ›  ${downloads.length}\n│\n` +
      `│  📥 *Quality තෝරන්න:*\n│\n`;

    downloads.forEach((d, i) => {
      list += `│  *${i + 1}.* ${d.quality}\n`;
      list += `│      💾 ${d.size} · 🏷️ ${d.type}\n`;
    });

    list += `\n│  👇 *${config.prefix || '.'}dinka <number>*\n`;
    list += `│  ⏳ 3 min · 📡 DARK QUEEN OFC\n`;
    list += `╰──────────────────────╯`;

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
    console.error('Dinka info error:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💥 \`${err.message}\``,
        edit: loading.key,
      })
      .catch(() => {});
  }
}

async function sendDocument({ sock, msg, from, quality, title, poster }) {
  const loading = await sock.sendMessage(
    from,
    {
      text: `⬆️📡 *Document stream...*\n🎬 ${quality.quality}\n💾 ${quality.size}`,
    },
    { quoted: msg }
  );

  try {
    const caption = `
╭───「 🎬✨ *DINKA* 」───╮
│
│  📌 *Title*   ›  ${String(title).slice(0, 55)}
│  🎥 *Quality* ›  ${quality.quality}
│  💾 *Size*    ›  ${quality.size}
│  🏷️ *Host*    ›  ${quality.type}
│  📁 *Type*    ›  Document
│
╰──────────────────────╯
📡 *𝐷𝐴𝑅𝐾 𝑄𝑈𝐸𝐸𝑁 · 𝑂𝐹𝐶*`.trim();

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

    // Cinesubz style — Baileys downloads from URL (no local buffer)
    await sock.sendMessage(
      from,
      {
        document: { url: quality.url },
        mimetype: 'video/mp4',
        fileName,
        caption: `📁🎬 *${quality.quality}*`,
      },
      { quoted: msg }
    );
  } catch (err) {
    console.error('Dinka send error:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💥 Upload fail.\n\n\`${err.message}\``,
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

    // number reply
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const state = pending.get(from);

      if (state?.type === 'quality') {
        if (idx < 0 || idx >= state.downloads.length) {
          return sock.sendMessage(
            from,
            { text: `❌ *1*–*${state.downloads.length}* තෝරන්න 🙏` },
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
            { text: `❌ *1*–*${state.results.length}* තෝරන්න 🙏` },
            { quoted: msg }
          );
        }
        const item = state.results[idx];
        return showQualities({ sock, msg, from, item });
      }

      return sock.sendMessage(
        from,
        {
          text: `❌ Active search නැහැ 😅\n💡 \`${prefix}dinka <movie name>\``,
        },
        { quoted: msg }
      );
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🎥🍿 *DINKA MOVIES* 」───╮
│
│  ${prefix}dinka <movie name>
│  ${prefix}dinka <number>
│  ${prefix}dinka <dinka url>
│
│  📌 Example:
│  ${prefix}dinka Gamani
│  ${prefix}dinka 1
│
│  📡 DARK QUEEN MINI OFC
│
╰──────────────────────╯`,
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
      { text: '🔍✨ *Dinka search...*' },
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
          text: `❌ Search HTTP ${res.status}`,
          edit: loading.key,
        });
      }
      if (res.data.status === false || res.data.success === false) {
        return sock.sendMessage(from, {
          text: `❌ \`${res.data.error || res.data.message || 'fail'}\``,
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
          text: '❌😥 Results හමු නොවීය.',
          edit: loading.key,
        });
      }

      setPending(from, { type: 'search', results: cleaned });

      let list =
        `╭───「 🎥🍿 *𝐷𝐼𝑁𝐸𝐾𝐴 𝑆𝐸𝐴𝑅𝐶𝐻* 」───╮\n│\n` +
        `│  🔎 *${query.slice(0, 40)}*\n` +
        `│  📦 ${cleaned.length} results\n│\n`;

      cleaned.forEach((item) => {
        list += `│  *${item.index}.* ${String(item.title).slice(0, 45)}\n`;
        list += `│      📅 ${item.year}\n`;
      });

      list += `\n│  👇 *${prefix}dinka <number>*\n│  ⏳ 3 min\n╰──────────────────────╯`;

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
          text: `❌💥 \`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
