const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/adult/pornhub/search';
const DL_API = 'https://api.chamindu.site/api/adult/pornhub/dl';
const STREAM_BASE = 'https://api.chamindu.site';
const PENDING_TTL_MS = 2 * 60 * 1000;

const pending = new Map();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractPhUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?pornhub\.com\/view_video\.php\?[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

/** Pick best direct URL for Baileys document:{url} (zero RAM) */
function pickDirectUrl(data) {
  if (!data || typeof data !== 'object') return null;

  // Prefer stream_proxy (API CDN / proxy — better for WA upload from server)
  if (data.stream_proxy) {
    const p = String(data.stream_proxy);
    return p.startsWith('http') ? p : STREAM_BASE + p;
  }

  const keys = ['download_url', 'direct_link', 'raw_link', 'url', 'link'];
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}

async function downloadAndSend({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '📥 *PH process...*' },
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
    const mediaUrl = pickDirectUrl(apiRes.data);
    if (!mediaUrl) {
      throw new Error('Direct download link හොයාගන්න බැරි වුණා');
    }

    const thumb = item.thumbnail || null;
    const duration = item.duration || 'N/A';
    const fileName =
      (String(title).replace(/[\/\\:*?"<>|]/g, '').slice(0, 40).trim() || 'ph-video') +
      '.mp4';

    const caption = `
╭───「 🔥 *PORNHUB* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 60)}
│  ⏱ *Duration* ›  ${duration}
│  📁 *Type*     ›  Document
│
╰──────────────────────╯`.trim();

    await sock
      .sendMessage(from, {
        text: '⬆️ *Document stream (zero RAM)...*\n📡 Baileys URL upload',
        edit: loading.key,
      })
      .catch(() => {});

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    // Thumbnail + info
    if (thumb && /^https?:\/\//i.test(thumb)) {
      try {
        await sock.sendMessage(
          from,
          { image: { url: thumb }, caption },
          { quoted: msg }
        );
      } catch (_) {
        await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
      }
    } else {
      await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
    }

    // Cinesubz style: Baileys fetches URL — no local buffer / zero RAM on our side
    await sock.sendMessage(
      from,
      {
        document: { url: mediaUrl },
        mimetype: 'video/mp4',
        fileName,
        caption: '📁 *PH Document*',
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
        item: { title: 'PH Video', url: direct, duration: 'N/A', thumbnail: null },
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
