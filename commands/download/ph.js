const axios = require('axios');
const config = require('../../config');

const API_KEY = 'Sasa_Dev_Api_479c9ed9917d15f5cacdb37b6df3fb4b6f4d7b34';
const SEARCH_API = 'https://sasa-dev-api.xyz/api/media/ph/search';
const DOWNLOAD_API = 'https://sasa-dev-api.xyz/api/media/ph/download';
const MAX_WA_BYTES = 60 * 1024 * 1024;
const PENDING_TTL_MS = 3 * 60 * 1000;

// chat (from) -> { results: [...], timeout }
const pendingSearch = new Map();

function isPhUrl(text) {
  return /pornhub\.com|phncdn\.com/i.test(text);
}

function extractUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?(?:[\w.-]+\.)?pornhub\.com\/[^\s]*/i
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

function pickMp4(result) {
  const list = result?.mp4 || result?.videos || result?.links || [];
  if (!Array.isArray(list) || !list.length) {
    if (typeof result?.url === 'string') return result.url;
    if (typeof result?.mp4 === 'string') return result.mp4;
    return null;
  }
  // Prefer later entries if they tend to be higher quality; still fall back to first working
  return list[list.length - 1] || list[0];
}

async function downloadAndSend({ sock, msg, from, pageUrl, titleHint }) {
  const loading = await sock.sendMessage(
    from,
    { text: '📥 *Video download වෙමින්...*' },
    { quoted: msg }
  );

  try {
    const apiUrl = `${DOWNLOAD_API}?apikey=${API_KEY}&url=${encodeURIComponent(pageUrl)}`;
    const apiRes = await axios.get(apiUrl, {
      timeout: 90000,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const data = apiRes.data;
    if (apiRes.status !== 200 || !data || data.status === false) {
      const reason = data?.msg || data?.error || data?.message || 'Download fail';
      return sock.sendMessage(from, {
        text: `❌ Download fail වුණා.\n\n\`${reason}\``,
        edit: loading.key,
      });
    }

    const result = data.result || data.data || data;
    const mp4Url = pickMp4(result);
    if (!mp4Url) {
      console.error('PH download no mp4:', JSON.stringify(result).slice(0, 500));
      return sock.sendMessage(from, {
        text: '❌ Video link එක හොයාගන්න බැරි වුණා.',
        edit: loading.key,
      });
    }

    const title = result.title || titleHint || 'Video';

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
        Referer: 'https://www.pornhub.com/',
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
╭───「 🔥 *PH DOWNLOAD* 」───╮
│
│  📌 *Title*  ›  ${String(title).slice(0, 70)}
│  📦 *Size*   ›  ${sizeMB} MB
│  ✅ *Status* ›  Done
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
      console.error('PH video send failed, document fallback:', sendErr.message);
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
    console.error('PH Download Error:', err.message);
    await sock.sendMessage(from, {
      text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``,
      edit: loading.key,
    }).catch(() => {});
  }
}

module.exports = {
  name: 'ph',
  aliases: ['pornhub', 'phdl', 'phsearch'],
  description: 'Search & download adult videos (18+)',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // ===== Select result: .ph 1 / .ph 2 =====
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const pending = pendingSearch.get(from);

      if (!pending || !pending.results?.length) {
        return sock.sendMessage(
          from,
          {
            text: `❌ Active search එකක් නැහැ.\n💡 කලින් \`${prefix}ph <query>\` කරලා search කරන්න.`,
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
          text: `╭───「 🔥 *PH (18+)* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}ph <search query>
│  ${prefix}ph <pornhub url>
│  ${prefix}ph <number>   ← after search
│
│  📌 *Example:*
│  ${prefix}ph japanese
│  ${prefix}ph 1
│  ${prefix}ph https://www.pornhub.com/view_video.php?viewkey=xxx
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

    // ===== Direct URL download =====
    if (directUrl || isPhUrl(query)) {
      return downloadAndSend({
        sock,
        msg,
        from,
        pageUrl: directUrl || query,
        titleHint: 'Pornhub Video',
      });
    }

    // ===== Search =====
    const loading = await sock.sendMessage(
      from,
      { text: '🔍 *Search කරමින්...*' },
      { quoted: msg }
    );

    try {
      const apiUrl = `${SEARCH_API}?apikey=${API_KEY}&q=${encodeURIComponent(query)}`;
      const apiRes = await axios.get(apiUrl, {
        timeout: 60000,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const data = apiRes.data;
      if (apiRes.status !== 200 || !data || data.status === false) {
        const reason = data?.msg || data?.error || 'Search fail';
        return sock.sendMessage(from, {
          text: `❌ Search fail වුණා.\n\n\`${reason}\``,
          edit: loading.key,
        });
      }

      const results = Array.isArray(data.result)
        ? data.result
        : Array.isArray(data.results)
          ? data.results
          : Array.isArray(data.data)
            ? data.data
            : [];

      const cleaned = results
        .filter((r) => r && (r.url || r.link) && (r.title || r.name))
        .slice(0, 10)
        .map((r) => ({
          title: r.title || r.name || 'Untitled',
          url: r.url || r.link,
          thumb: r.thumb || r.thumbnail || null,
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

      let list = `╭───「 🔥 *PH SEARCH* 」───╮\n│\n│  🔎 *Query* ›  ${query.slice(0, 40)}\n│\n`;
      cleaned.forEach((item, i) => {
        list += `│  *${i + 1}.* ${String(item.title).slice(0, 55)}\n`;
      });
      list += `│\n│  👇 තෝරන්න: *${prefix}ph <number>*\n│  ⏳ විනාඩි 3ක් ඇතුළත\n│\n│  ⚠️ *18+ only*\n│\n╰──────────────────────╯`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      await sock.sendMessage(from, { text: list }, { quoted: msg });
    } catch (err) {
      console.error('PH Search Error:', err.message);
      await sock.sendMessage(from, {
        text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``,
        edit: loading.key,
      }).catch(() => {});
    }
  },
};
