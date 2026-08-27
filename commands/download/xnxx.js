const axios = require('axios');
const config = require('../../config');

const API_KEY = 'zan_FLUs8y9T_fcz7cgi12p';
const SEARCH_API = 'https://api.zanta-mini.store/api/xnxx/search';
const DOWNLOAD_API = 'https://api.zanta-mini.store/api/xnxx/dl';
const MAX_WA_BYTES = 60 * 1024 * 1024;
const PENDING_TTL_MS = 3 * 60 * 1000;

// chat (from) -> { results, timeout }
const pendingSearch = new Map();

function isXnxxUrl(text) {
  return /xnxx\.(com|tv)|xvideos\.com/i.test(text);
}

function extractUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?(?:xnxx\.(?:com|tv)|[\w.-]*xvideos\.com)\/[^\s]*/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function sanitizeName(name) {
  return (name || 'video')
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim()
    .substring(0, 50) || 'video';
}

function pickDownloadUrl(result) {
  const links = result?.dl_links || result?.links || result?.download || {};
  if (typeof links === 'string' && /^https?:\/\//i.test(links)) return links;

  // Prefer high > medium > low
  const order = ['high', 'hd', 'medium', 'low', 'sd'];
  for (const key of order) {
    if (typeof links[key] === 'string' && /^https?:\/\//i.test(links[key])) {
      return links[key];
    }
  }

  // Array form
  if (Array.isArray(links) && links.length) {
    const last = links[links.length - 1];
    if (typeof last === 'string') return last;
    if (last?.url) return last.url;
  }

  if (typeof result?.url === 'string' && /\.mp4/i.test(result.url)) return result.url;
  if (typeof result?.mp4 === 'string') return result.mp4;

  return null;
}

async function downloadAndSend({ sock, msg, from, pageUrl, titleHint }) {
  const loading = await sock.sendMessage(
    from,
    { text: '📥 *Video download වෙමින්...*' },
    { quoted: msg }
  );

  try {
    const apiUrl = `${DOWNLOAD_API}?apiKey=${API_KEY}&url=${encodeURIComponent(pageUrl)}`;
    const apiRes = await axios.get(apiUrl, {
      timeout: 90000,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const data = apiRes.data;
    if (apiRes.status !== 200 || !data || data.success === false || data.status === false) {
      const reason = data?.message || data?.msg || data?.error || 'Download fail';
      return sock.sendMessage(from, {
        text: `❌ Download fail වුණා.\n\n\`${reason}\``,
        edit: loading.key,
      });
    }

    const result = data.result || data.data || data;
    const mp4Url = pickDownloadUrl(result);
    if (!mp4Url) {
      console.error('XNXX download no link:', JSON.stringify(result).slice(0, 500));
      return sock.sendMessage(from, {
        text: '❌ Video link එක හොයාගන්න බැරි වුණා.',
        edit: loading.key,
      });
    }

    const title = result.title || titleHint || 'XNXX Video';
    const quality =
      (result.dl_links && result.dl_links.high && mp4Url === result.dl_links.high && 'High') ||
      (result.dl_links && result.dl_links.low && mp4Url === result.dl_links.low && 'Low') ||
      'Auto';

    await sock.sendMessage(from, {
      text: '⬇️ *File ලබාගනිමින්...*',
      edit: loading.key,
    }).catch(() => {});

    const mediaRes = await axios.get(mp4Url, {
      responseType: 'arraybuffer',
      timeout: 180000,
      maxContentLength: MAX_WA_BYTES + 8 * 1024 * 1024,
      maxBodyLength: MAX_WA_BYTES + 8 * 1024 * 1024,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.xnxx.com/',
      },
      validateStatus: () => true,
    });

    const contentType = String(mediaRes.headers?.['content-type'] || '').toLowerCase();
    if (
      mediaRes.status !== 200 ||
      contentType.includes('text/html') ||
      contentType.includes('application/json')
    ) {
      return sock.sendMessage(from, {
        text: '❌ Video file එක ලබාගන්න බැරි වුණා (link expired / blocked).',
        edit: loading.key,
      });
    }

    const buffer = Buffer.from(mediaRes.data);
    if (!buffer.length || buffer.length < 10000) {
      return sock.sendMessage(from, {
        text: '❌ Video file එක empty / invalid.',
        edit: loading.key,
      });
    }

    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    if (buffer.length > MAX_WA_BYTES) {
      return sock.sendMessage(from, {
        text: `❌ File එක ගොඩක් ලොකුයි (*${sizeMB} MB*).\nWhatsApp limit ~60MB.\n💡 කෙටි video එකක් try කරන්න.`,
        edit: loading.key,
      });
    }

    const caption = `
╭───「 🔥 *XNXX DOWNLOAD* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 70)}
│  🎬 *Quality*  ›  ${quality}
│  📦 *Size*     ›  ${sizeMB} MB
│  ✅ *Status*   ›  Done
│
╰──────────────────────╯`.trim();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    const fileName = `${sanitizeName(title)}.mp4`;

    try {
      await sock.sendMessage(
        from,
        {
          video: buffer,
          mimetype: 'video/mp4',
          caption,
          fileName,
        },
        { quoted: msg }
      );
    } catch (sendErr) {
      console.error('XNXX video send failed, document fallback:', sendErr.message);
      await sock.sendMessage(
        from,
        {
          document: buffer,
          mimetype: 'video/mp4',
          fileName,
          caption: caption + '\n\n📁 _Sent as document_',
        },
        { quoted: msg }
      );
    }
  } catch (err) {
    console.error('XNXX Download Error:', err.message);
    await sock.sendMessage(from, {
      text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``,
      edit: loading.key,
    }).catch(() => {});
  }
}

module.exports = {
  name: 'xnxx',
  aliases: ['xnx', 'xnxxdl'],
  description: 'Search & download XNXX videos (18+)',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // ===== Select: .xnxx 1 =====
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const pending = pendingSearch.get(from);

      if (!pending || !pending.results?.length) {
        return sock.sendMessage(
          from,
          {
            text: `❌ Active search එකක් නැහැ.\n💡 කලින් \`${prefix}xnxx <query>\` කරලා search කරන්න.`,
          },
          { quoted: msg }
        );
      }

      if (idx < 0 || idx >= pending.results.length) {
        return sock.sendMessage(
          from,
          {
            text: `❌ Number එක වැරදියි. *1* සිට *${pending.results.length}* දක්වා තෝරන්න.`,
          },
          { quoted: msg }
        );
      }

      clearTimeout(pending.timeout);
      pendingSearch.delete(from);

      const item = pending.results[idx];
      return downloadAndSend({
        sock,
        msg,
        from,
        pageUrl: item.url,
        titleHint: item.title,
      });
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🔥 *XNXX (18+)* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}xnxx <search query>
│  ${prefix}xnxx <xnxx url>
│  ${prefix}xnxx <number>   ← after search
│
│  📌 *Example:*
│  ${prefix}xnxx sri lanka
│  ${prefix}xnxx 1
│  ${prefix}xnxx https://www.xnxx.tv/video-xxxxx/...
│
│  ⚠️ *18+ only*
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const directUrl = extractUrl(query);

    // ===== Direct URL =====
    if (directUrl || isXnxxUrl(query)) {
      return downloadAndSend({
        sock,
        msg,
        from,
        pageUrl: directUrl || query,
        titleHint: 'XNXX Video',
      });
    }

    // ===== Search =====
    const loading = await sock.sendMessage(
      from,
      { text: '🔍 *Search කරමින්...*' },
      { quoted: msg }
    );

    try {
      // API uses "url" query param for the search text
      const apiUrl = `${SEARCH_API}?apiKey=${API_KEY}&url=${encodeURIComponent(query)}`;
      const apiRes = await axios.get(apiUrl, {
        timeout: 60000,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const data = apiRes.data;
      if (apiRes.status !== 200 || !data || data.success === false || data.status === false) {
        const reason = data?.message || data?.msg || data?.error || 'Search fail';
        return sock.sendMessage(from, {
          text: `❌ Search fail වුණා.\n\n\`${reason}\``,
          edit: loading.key,
        });
      }

      const results = Array.isArray(data.results)
        ? data.results
        : Array.isArray(data.result)
          ? data.result
          : Array.isArray(data.data)
            ? data.data
            : [];

      const cleaned = results
        .filter((r) => r && (r.url || r.link) && (r.title || r.name))
        .slice(0, 12)
        .map((r) => ({
          title: r.title || r.name || 'Untitled',
          url: r.url || r.link,
          thumbnail: r.thumbnail || r.thumb || null,
        }));

      if (!cleaned.length) {
        return sock.sendMessage(from, {
          text: '❌ Results හමු නොවීය.\n💡 වෙන keyword එකක් try කරන්න.',
          edit: loading.key,
        });
      }

      const existing = pendingSearch.get(from);
      if (existing?.timeout) clearTimeout(existing.timeout);

      const timeout = setTimeout(() => {
        pendingSearch.delete(from);
      }, PENDING_TTL_MS);

      pendingSearch.set(from, { results: cleaned, timeout, createdAt: Date.now() });

      let list = `╭───「 🔥 *XNXX SEARCH* 」───╮\n│\n│  🔎 *Query* ›  ${query.slice(0, 40)}\n│\n`;
      cleaned.forEach((item, i) => {
        list += `│  *${i + 1}.* ${String(item.title).slice(0, 55)}\n`;
      });
      list += `│\n│  👇 තෝරන්න: *${prefix}xnxx <number>*\n│  ⏳ විනාඩි 3ක් ඇතුළත\n│\n│  ⚠️ *18+ only*\n│\n╰──────────────────────╯`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      await sock.sendMessage(from, { text: list }, { quoted: msg });
    } catch (err) {
      console.error('XNXX Search Error:', err.message);
      await sock.sendMessage(from, {
        text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``,
        edit: loading.key,
      }).catch(() => {});
    }
  },
};
