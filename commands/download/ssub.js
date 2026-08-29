const axios = require('axios');
const config = require('../../config');

const API_KEY = 'zan_FLUs8y9T_fcz7cgi12p';
const SEARCH_API = 'https://api.zanta-mini.store/api/sinhalasub/search';
const DL_API = 'https://api.zanta-mini.store/api/sinhalasub/dl';
const PENDING_TTL_MS = 3 * 60 * 1000;
const MAX_WA_BYTES = 60 * 1024 * 1024;

// from -> { results, timeout }
const pending = new Map();

function isSinhalaSubUrl(text) {
  return /sinhalasub\.lk/i.test(String(text || ''));
}

function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/(?:www\.)?sinhalasub\.lk\/[^\s]+/i);
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

async function fetchDetails(pageUrl) {
  const res = await axios.get(DL_API, {
    params: { apiKey: API_KEY, text: pageUrl },
    timeout: 60000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.success === false) {
    throw new Error(res.data?.message || res.data?.error || `HTTP ${res.status}`);
  }
  const r = res.data.results || res.data.result || res.data.data || res.data;
  return {
    title: r.title || '',
    rating: r.rating || 'N/A',
    thumbnail: (r.thumbnail || '').toString().trim(),
    links: Array.isArray(r.links) ? r.links : [],
  };
}

function formatLinks(links) {
  if (!links.length) return '❌ Download links නැහැ.';

  // Group by host/quality
  const groups = {};
  links.forEach((l) => {
    const host = l.quality || l.host || 'Link';
    const size = l.size || l.quality_label || '';
    const url = l.direct_link || l.url || l.link || '';
    if (!url) return;
    if (!groups[host]) groups[host] = [];
    groups[host].push({ size, url });
  });

  let text = '';
  Object.keys(groups).forEach((host) => {
    text += `\n*🔹 ${host}*\n`;
    groups[host].forEach((item) => {
      text += `  • ${item.size || 'Download'}\n    ${item.url}\n`;
    });
  });
  return text.trim();
}

/** Prefer Pixeldrain direct files for optional WA send */
function pickPixeldrain(links, preferSize) {
  const pd = links.filter((l) =>
    /pixeldrain/i.test(String(l.quality || '') + String(l.direct_link || l.url || ''))
  );
  if (!pd.length) return null;
  if (preferSize) {
    const hit = pd.find((l) =>
      String(l.size || '').toLowerCase().includes(String(preferSize).toLowerCase())
    );
    if (hit) return hit.direct_link || hit.url;
  }
  // prefer 480p then 720p for smaller size
  const order = ['480', '720', '1080'];
  for (const q of order) {
    const hit = pd.find((l) => String(l.size || '').includes(q));
    if (hit) return hit.direct_link || hit.url;
  }
  return pd[0].direct_link || pd[0].url;
}

async function sendMovieInfo({ sock, msg, from, pageUrl, titleHint, thumbHint }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🎬 *Movie details ලබාගනිමින්...*' },
    { quoted: msg }
  );

  try {
    const details = await fetchDetails(pageUrl);
    const title = details.title || titleHint || 'SinhalaSub Movie';
    const thumb = details.thumbnail || thumbHint || null;
    const rating = details.rating || 'N/A';
    const linksText = formatLinks(details.links);

    const caption = `
╭───「 🎬 *SINHALASUB* 」───╮
│
│  📌 *Title*   ›  ${String(title).slice(0, 70) || 'N/A'}
│  ⭐ *Rating*  ›  ${rating}
│  🔗 *Page*    ›  ${pageUrl}
│
│  📥 *Download Links*
${linksText.split('\n').map((l) => '│  ' + l).join('\n')}
│
│  💡 Pixeldrain links browser එකෙන් open කරන්න
│  ⚠️ Movies WhatsApp limit එකට වඩා ලොකුයි
│
╰──────────────────────╯`.trim();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (thumb && /^https?:\/\//i.test(thumb)) {
      try {
        await sock.sendMessage(
          from,
          { image: { url: thumb }, caption: caption.slice(0, 1024) },
          { quoted: msg }
        );
        // links may be long — send second message if needed
        if (caption.length > 1000) {
          await sock.sendMessage(
            from,
            { text: `📥 *Full links*\n\n${linksText}` },
            { quoted: msg }
          );
        }
        return;
      } catch (_) {}
    }

    await sock.sendMessage(from, { text: caption }, { quoted: msg });
  } catch (err) {
    console.error('SSub details error:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌ Details fail.\n\n\`${err.message}\``,
        edit: loading.key,
      })
      .catch(() => {});
  }
}

module.exports = {
  name: 'ssub',
  aliases: ['sinhalasub', 'movie', 'movies'],
  description: 'Search SinhalaSub movies',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // .ssub 1  → details of search result
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const p = pending.get(from);
      if (!p || !p.results?.length) {
        return sock.sendMessage(
          from,
          {
            text: `❌ Active search නැහැ.\n💡 \`${prefix}ssub <movie name>\` කරන්න.`,
          },
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
      // keep results a bit longer for more picks? clear selection only
      pending.delete(from);

      const item = p.results[idx];
      return sendMovieInfo({
        sock,
        msg,
        from,
        pageUrl: item.url,
        titleHint: item.title,
        thumbHint: item.thumbnail,
      });
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🎬 *SINHALASUB* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}ssub <movie name>
│  ${prefix}ssub <number>
│  ${prefix}ssub <sinhalasub url>
│
│  📌 *Example:*
│  ${prefix}ssub avengers
│  ${prefix}ssub 1
│  ${prefix}ssub https://sinhalasub.lk/movies/...
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const direct = extractUrl(query);

    if (direct || isSinhalaSubUrl(query)) {
      return sendMovieInfo({
        sock,
        msg,
        from,
        pageUrl: direct || query,
        titleHint: 'SinhalaSub',
        thumbHint: null,
      });
    }

    // Search
    const loading = await sock.sendMessage(
      from,
      { text: '🔍 *SinhalaSub search...*' },
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
        .filter((r) => r && (r.url || r.link) && (r.title || r.name))
        .slice(0, 15)
        .map((r, i) => ({
          index: i + 1,
          title: r.title || r.name || 'Untitled',
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

      let list = `╭───「 🎬 *SINHALASUB SEARCH* 」───╮\n│\n│  🔎 *${query.slice(0, 40)}*\n│  📦 *${cleaned.length}* results\n│\n`;
      cleaned.forEach((item) => {
        list += `│  *${item.index}.* ${String(item.title).slice(0, 50)}\n`;
      });
      list += `\n│  👇 *${prefix}ssub <number>*\n│  ⏳ 3 min\n╰──────────────────────╯`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // Image from first result
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
      console.error('SSub Search Error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ \`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
