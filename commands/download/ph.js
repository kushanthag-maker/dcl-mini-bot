const axios = require('axios');
const config = require('../../config');

const SEARCH_API = 'https://porn-hub-scrap.vercel.app/api/search';
const DL_API = 'https://porn-hub-scrap.vercel.app/api/download';
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

/** Prefer progressive mp4 direct links (new API shape) */
function pickDirectMp4(links) {
  const list = (links || []).filter((l) => {
    if (!l || !l.url) return false;
    const fmt = String(l.format || '').toLowerCase();
    const u = String(l.url);
    // skip HLS playlists
    if (fmt === 'hls' || u.includes('.m3u8')) return false;
    return true;
  });

  const score = (l) => {
    const q = String(l.quality || '').toLowerCase();
    if (q.includes('480')) return 40;
    if (q.includes('720')) return 30;
    if (q.includes('240')) return 20;
    if (q.includes('1080')) return 10;
    return 5;
  };

  list.sort((a, b) => score(b) - score(a));
  return list[0] || null;
}

async function downloadAndSend({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '📥 *PH process...*' },
    { quoted: msg }
  );

  try {
    const pageUrl = item.page_link || item.url;
    const apiRes = await axios.get(DL_API, {
      params: { url: pageUrl },
      timeout: 90000,
      validateStatus: () => true,
      headers: { 'User-Agent': UA },
    });

    if (apiRes.status !== 200 || !apiRes.data) {
      throw new Error(`API HTTP ${apiRes.status}`);
    }
    if (apiRes.data.success === false) {
      throw new Error(apiRes.data.message || apiRes.data.error || 'API failed');
    }

    const title = apiRes.data.title || item.title || 'PH Video';
    const links = apiRes.data.download_links || apiRes.data.links || [];

    console.log(
      '[PH] links:',
      links.map((l) => `${l.quality}/${l.format}`).join(', ')
    );

    const picked = pickDirectMp4(links);
    if (!picked || !picked.url) {
      throw new Error(
        'Direct MP4 URL හොයාගන්න බැරි වුණා. API links: ' +
          (links.length ? links.map((l) => l.format || '?').join(',') : 'empty')
      );
    }

    const quality = String(picked.quality || 'auto');
    const fileName =
      (String(title)
        .replace(/[\/\\:*?"<>|]/g, '')
        .slice(0, 40)
        .trim() || 'ph-video') + '.mp4';

    const caption = `
╭───「 🔥 *PORNHUB* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 60)}
│  ⏱ *Duration* ›  ${item.duration || 'N/A'}
│  👁 *Views*    ›  ${item.views || 'N/A'}
│  🎬 *Quality*  ›  ${quality}
│
│  📁 Document stream (low RAM)
│
╰──────────────────────╯`.trim();

    await sock
      .sendMessage(from, {
        text: `⬆️ *WhatsApp එකට upload...\n🎬 ${quality}\n📡 Direct URL stream`,
        edit: loading.key,
      })
      .catch(() => {});

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    // Zero-RAM style: Baileys fetches URL itself (no full buffer in our code)
    await sock.sendMessage(
      from,
      {
        document: { url: picked.url },
        mimetype: 'video/mp4',
        fileName,
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
        headers: { 'User-Agent': UA },
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
