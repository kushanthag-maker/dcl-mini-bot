const axios = require('axios');
const config = require('../../config');

const API_KEY = 'zan_FLUs8y9T_fcz7cgi12p';
const SEARCH_API = 'https://api.zanta-mini.store/api/xnxx/search';
const DOWNLOAD_API = 'https://api.zanta-mini.store/api/xnxx/dl';
const MAX_WA_BYTES = 60 * 1024 * 1024;
const PENDING_TTL_MS = 5 * 60 * 1000;
const MAX_ALL_DOWNLOADS = 8;

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

  const order = ['high', 'hd', 'medium', 'low', 'sd'];
  for (const key of order) {
    if (typeof links[key] === 'string' && /^https?:\/\//i.test(links[key])) {
      return links[key];
    }
  }

  if (Array.isArray(links) && links.length) {
    const last = links[links.length - 1];
    if (typeof last === 'string') return last;
    if (last?.url) return last.url;
  }

  if (typeof result?.url === 'string' && /\.mp4/i.test(result.url)) return result.url;
  if (typeof result?.mp4 === 'string') return result.mp4;

  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadAndSend({ sock, msg, from, pageUrl, titleHint, quiet }) {
  const loading = quiet
    ? null
    : await sock.sendMessage(from, { text: '📥 *Video download වෙමින්...*' }, { quoted: msg });

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
      const text = `❌ Download fail වුණා.\n\n\`${reason}\``;
      if (loading) return sock.sendMessage(from, { text, edit: loading.key });
      return sock.sendMessage(from, { text }, { quoted: msg });
    }

    const result = data.result || data.data || data;
    const mp4Url = pickDownloadUrl(result);
    if (!mp4Url) {
      const text = '❌ Video link එක හොයාගන්න බැරි වුණා.';
      if (loading) return sock.sendMessage(from, { text, edit: loading.key });
      return sock.sendMessage(from, { text }, { quoted: msg });
    }

    const title = result.title || titleHint || 'XNXX Video';
    const quality =
      (result.dl_links && result.dl_links.high && mp4Url === result.dl_links.high && 'High') ||
      (result.dl_links && result.dl_links.low && mp4Url === result.dl_links.low && 'Low') ||
      'Auto';

    if (loading) {
      await sock
        .sendMessage(from, { text: '⬇️ *File ලබාගනිමින්...*', edit: loading.key })
        .catch(() => {});
    }

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
      const text = '❌ Video file එක ලබාගන්න බැරි වුණා (link expired / blocked).';
      if (loading) return sock.sendMessage(from, { text, edit: loading.key });
      return sock.sendMessage(from, { text }, { quoted: msg });
    }

    const buffer = Buffer.from(mediaRes.data);
    if (!buffer.length || buffer.length < 10000) {
      const text = '❌ Video file එක empty / invalid.';
      if (loading) return sock.sendMessage(from, { text, edit: loading.key });
      return sock.sendMessage(from, { text }, { quoted: msg });
    }

    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    if (buffer.length > MAX_WA_BYTES) {
      const text = `❌ File එක ගොඩක් ලොකුයි (*${sizeMB} MB*). WhatsApp limit ~60MB.`;
      if (loading) return sock.sendMessage(from, { text, edit: loading.key });
      return sock.sendMessage(from, { text }, { quoted: msg });
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

    if (loading) {
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
    }

    const fileName = `${sanitizeName(title)}.mp4`;

    try {
      await sock.sendMessage(
        from,
        { video: buffer, mimetype: 'video/mp4', caption, fileName },
        { quoted: msg }
      );
    } catch (sendErr) {
      console.error('XNXX send failed, document fallback:', sendErr.message);
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
    return true;
  } catch (err) {
    console.error('XNXX Download Error:', err.message);
    const text = `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``;
    if (loading) {
      await sock.sendMessage(from, { text, edit: loading.key }).catch(() => {});
    } else {
      await sock.sendMessage(from, { text }, { quoted: msg }).catch(() => {});
    }
    return false;
  }
}

module.exports = {
  name: 'xnxx',
  // .xnxxdl / .xnxdl / .xndl එකම file එකෙන් work වෙනවා
  aliases: ['xnx', 'xnxxdl', 'xnxdl', 'xndl'],
  description: 'Search / download XNXX videos (18+)',
  category: 'download',

  async execute({ sock, msg, from, args, body }) {
    const prefix = config.prefix || '.';
    // Detect which alias was typed (.xnxx vs .xnxxdl)
    let cmdName = 'xnxx';
    if (body && typeof body === 'string') {
      const rawCmd = body.slice(prefix.length).trim().split(/\s+/)[0] || '';
      cmdName = rawCmd.toLowerCase();
    }

    // ===== Direct-download aliases: .xnxxdl <url> =====
    const isDlOnly = ['xnxxdl', 'xnxdl', 'xndl'].includes(cmdName);

    if (isDlOnly) {
      if (!args.length) {
        return sock.sendMessage(
          from,
          {
            text: `╭───「 🔥 *XNXX DL (18+)* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}xnxxdl <xnxx video url>
│
│  📌 *Example:*
│  ${prefix}xnxxdl https://www.xnxx.tv/video-xxxxx/...
│
│  💡 Search: ${prefix}xnxx <query>
│
│  ⚠️ *18+ only*
│
╰──────────────────────╯`,
          },
          { quoted: msg }
        );
      }

      const raw = args.join(' ').trim();
      const pageUrl = extractUrl(raw) || (isXnxxUrl(raw) ? raw : null);

      if (!pageUrl) {
        return sock.sendMessage(
          from,
          {
            text: `❌ Valid XNXX link එකක් නොවේ.\n\n💡 *Example:*\n${prefix}xnxxdl https://www.xnxx.tv/video-xxxxx/...`,
          },
          { quoted: msg }
        );
      }

      return downloadAndSend({
        sock,
        msg,
        from,
        pageUrl,
        titleHint: 'XNXX Video',
      });
    }

    // ===== .xnxx all → download every result from last search =====
    if (args.length === 1 && args[0].toLowerCase() === 'all') {
      const pending = pendingSearch.get(from);

      if (!pending || !pending.results?.length) {
        return sock.sendMessage(
          from,
          {
            text: `❌ Active search එකක් නැහැ.\n💡 කලින් \`${prefix}xnxx <query>\` කරලා search කරන්න.\nඊට පස්සේ \`${prefix}xnxx all\``,
          },
          { quoted: msg }
        );
      }

      const list = pending.results.slice(0, MAX_ALL_DOWNLOADS);
      clearTimeout(pending.timeout);
      pendingSearch.delete(from);

      await sock.sendMessage(
        from,
        {
          text: `📦 *${list.length}* videos download කරමින්...\n⏳ ටිකක් ඉන්න (එකින් එක).`,
        },
        { quoted: msg }
      );

      let ok = 0;
      let fail = 0;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        await sock
          .sendMessage(from, {
            text: `⬇️ *[${i + 1}/${list.length}]* ${String(item.title).slice(0, 50)}`,
          })
          .catch(() => {});

        const success = await downloadAndSend({
          sock,
          msg,
          from,
          pageUrl: item.url,
          titleHint: item.title,
          quiet: true,
        });
        if (success) ok++;
        else fail++;

        if (i < list.length - 1) await sleep(1500);
      }

      return sock.sendMessage(
        from,
        {
          text: `✅ *Done*\n📦 Sent: *${ok}*\n❌ Failed: *${fail}*${
            pending.results.length > MAX_ALL_DOWNLOADS
              ? `\n⚠️ Max ${MAX_ALL_DOWNLOADS} videos per .xnxx all`
              : ''
          }`,
        },
        { quoted: msg }
      );
    }

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
            text: `❌ Number එක වැරදියි. *1* සිට *${pending.results.length}* දක්වා තෝරන්න.\nහැම එකම ඕනි නම්: \`${prefix}xnxx all\``,
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
│  ${prefix}xnxx <number>     ← එක video එකක්
│  ${prefix}xnxx all          ← හැම video එකම
│  ${prefix}xnxxdl <url>      ← direct link
│  ${prefix}xnxx <url>        ← direct link
│
│  📌 *Example:*
│  ${prefix}xnxx sri lanka
│  ${prefix}xnxx 1
│  ${prefix}xnxx all
│  ${prefix}xnxxdl https://www.xnxx.tv/video-xxxxx/...
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

    // Direct URL on .xnxx
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
        .slice(0, 25)
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

      const header = `╭───「 🔥 *XNXX SEARCH* 」───╮\n│\n│  🔎 *Query* ›  ${query.slice(0, 40)}\n│  📦 *Total* ›  ${cleaned.length}\n│\n`;
      let body = '';
      cleaned.forEach((item, i) => {
        body += `│  *${i + 1}.* ${String(item.title).slice(0, 55)}\n`;
      });
      const footer = `\n│  👇 තෝරන්න:\n│  • *${prefix}xnxx <number>*  → එකක්\n│  • *${prefix}xnxx all*       → හැම එකම (max ${MAX_ALL_DOWNLOADS})\n│  ⏳ විනාඩි 5ක් ඇතුළත\n│\n│  ⚠️ *18+ only*\n│\n╰──────────────────────╯`;

      const full = header + body + footer;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (full.length > 3500) {
        const mid = Math.ceil(cleaned.length / 2);
        let p1 = header;
        cleaned.slice(0, mid).forEach((item, i) => {
          p1 += `│  *${i + 1}.* ${String(item.title).slice(0, 55)}\n`;
        });
        p1 += `│\n│  _(continued...)_\n╰──────────────────────╯`;
        let p2 = `╭───「 🔥 *continued* 」───╮\n│\n`;
        cleaned.slice(mid).forEach((item, i) => {
          p2 += `│  *${mid + i + 1}.* ${String(item.title).slice(0, 55)}\n`;
        });
        p2 += footer;
        await sock.sendMessage(from, { text: p1 }, { quoted: msg });
        await sock.sendMessage(from, { text: p2 }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { text: full }, { quoted: msg });
      }
    } catch (err) {
      console.error('XNXX Search Error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
