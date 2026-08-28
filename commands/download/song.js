const axios = require('axios');
const config = require('../../config');

const API_KEY = 'hashu_f9f45a96c8d49e4f05d1552e45eb2166';
const SEARCH_API = 'https://hashu-apis-production.up.railway.app/api/song/search';
const DL_API = 'https://hashu-apis-production.up.railway.app/api/song/dl';
const FILE_API = 'https://hashu-apis-production.up.railway.app/api/song/file';
const MAX_WA_BYTES = 60 * 1024 * 1024;
const PENDING_TTL_MS = 2 * 60 * 1000;

// from -> { results, timeout }
const pending = new Map();

function sanitizeFileName(name) {
  return (name || 'song')
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim()
    .substring(0, 40) || 'song';
}

function formatViews(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

async function fetchSongInfo(youtubeUrl) {
  try {
    const res = await axios.get(DL_API, {
      params: { apiKey: API_KEY, text: youtubeUrl },
      timeout: 90000,
      validateStatus: () => true,
    });
    if (res.status === 200 && res.data && res.data.success !== false) {
      return res.data.results || res.data.result || res.data.data || res.data;
    }
  } catch (_) {}
  return null;
}

async function downloadAndSend({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '📥 *Song download වෙමින්...*' },
    { quoted: msg }
  );

  try {
    const ytUrl = item.url;
    const info = (await fetchSongInfo(ytUrl)) || {};
    const title = info.title || item.title || 'Song';
    const duration = info.duration || item.duration || 'N/A';
    const author = info.author || info.channel || item.author || 'Unknown';
    const thumb = info.thumbnail || item.thumbnail || null;
    const quality = info.quality || info.audioQuality || 'Audio';

    // Prefer file stream API (works reliably)
    const fileRes = await axios.get(FILE_API, {
      params: { apiKey: API_KEY, text: ytUrl },
      responseType: 'arraybuffer',
      timeout: 180000,
      maxContentLength: MAX_WA_BYTES + 5 * 1024 * 1024,
      maxBodyLength: MAX_WA_BYTES + 5 * 1024 * 1024,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const ct = String(fileRes.headers?.['content-type'] || '').toLowerCase();
    if (
      fileRes.status !== 200 ||
      ct.includes('application/json') ||
      ct.includes('text/html')
    ) {
      let errMsg = 'Download fail';
      try {
        errMsg = JSON.parse(Buffer.from(fileRes.data).toString()).message || errMsg;
      } catch (_) {}
      return sock.sendMessage(from, {
        text: `❌ Song download වුණේ නැහැ.\n\n\`${errMsg}\`\n💡 වෙන result number එකක් try කරන්න.`,
        edit: loading.key,
      });
    }

    const buffer = Buffer.from(fileRes.data);
    if (!buffer.length || buffer.length < 2000) {
      return sock.sendMessage(from, {
        text: '❌ Audio file එක empty / invalid.',
        edit: loading.key,
      });
    }

    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    if (buffer.length > MAX_WA_BYTES) {
      return sock.sendMessage(from, {
        text: `❌ File එක ගොඩක් ලොකුයි (*${sizeMB} MB*). WhatsApp limit ~60MB.`,
        edit: loading.key,
      });
    }

    // webm / mp3 / m4a
    let mimetype = 'audio/mpeg';
    let ext = 'mp3';
    if (ct.includes('webm')) {
      mimetype = 'audio/webm';
      ext = 'webm';
    } else if (ct.includes('ogg') || ct.includes('opus')) {
      mimetype = 'audio/ogg; codecs=opus';
      ext = 'ogg';
    } else if (ct.includes('mp4') || ct.includes('m4a')) {
      mimetype = 'audio/mp4';
      ext = 'm4a';
    } else if (ct.includes('mpeg') || ct.includes('mp3')) {
      mimetype = 'audio/mpeg';
      ext = 'mp3';
    }

    const caption = `
╭───「 🎵 *SONG* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 60)}
│  👤 *Artist*   ›  ${String(author).slice(0, 40)}
│  ⏱ *Duration* ›  ${duration}
│  🎧 *Quality*  ›  ${quality}
│  📦 *Size*     ›  ${sizeMB} MB
│  🔗 *Source*   ›  YouTube
│
╰──────────────────────╯`.trim();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    // Image + caption first
    if (thumb && /^https?:\/\//i.test(thumb)) {
      try {
        await sock.sendMessage(
          from,
          { image: { url: thumb }, caption },
          { quoted: msg }
        );
      } catch (e) {
        await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
      }
    } else {
      await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
    }

    const fileName = `${sanitizeFileName(title)}.${ext}`;

    // Send as audio, fallback document
    try {
      await sock.sendMessage(
        from,
        {
          audio: buffer,
          mimetype,
          fileName,
          ptt: false,
        },
        { quoted: msg }
      );
    } catch (e) {
      console.error('Song audio send fail, document:', e.message);
      await sock.sendMessage(
        from,
        {
          document: buffer,
          mimetype,
          fileName,
          caption: '📁 *Audio format fail — document*',
        },
        { quoted: msg }
      );
    }
  } catch (err) {
    console.error('Song Download Error:', err.message);
    await sock.sendMessage(from, {
      text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``,
      edit: loading.key,
    }).catch(() => {});
  }
}

module.exports = {
  name: 'song',
  aliases: ['s', 'ytsong', 'music'],
  description: 'Search & download song (YouTube)',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // ===== Select: .song 1 =====
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const p = pending.get(from);
      if (!p || !p.results?.length) {
        return sock.sendMessage(
          from,
          {
            text: `❌ Active search එකක් නැහැ.\n💡 \`${prefix}song <name>\` කරලා search කරන්න.`,
          },
          { quoted: msg }
        );
      }
      if (idx < 0 || idx >= p.results.length) {
        return sock.sendMessage(
          from,
          { text: `❌ Number එක වැරදියි. *1*–*${p.results.length}* තෝරන්න.` },
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
          text: `╭───「 🎵 *SONG* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}song <song name>
│  ${prefix}song <youtube url>
│  ${prefix}song <number>   ← after search
│
│  📌 *Example:*
│  ${prefix}song Lokayen yamu
│  ${prefix}song 1
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const isUrl = /youtube\.com|youtu\.be/i.test(query);

    // Direct URL → download
    if (isUrl) {
      return downloadAndSend({
        sock,
        msg,
        from,
        item: { url: query, title: query, author: 'YouTube', duration: 'N/A', thumbnail: null },
      });
    }

    const loading = await sock.sendMessage(
      from,
      { text: '🔍 *Song හොයමින්...*' },
      { quoted: msg }
    );

    try {
      const res = await axios.get(SEARCH_API, {
        params: { apiKey: API_KEY, text: query },
        timeout: 45000,
        validateStatus: () => true,
      });

      if (res.status !== 200 || !res.data || res.data.success === false) {
        const reason = res.data?.message || 'Search fail';
        return sock.sendMessage(from, {
          text: `❌ Search fail.\n\n\`${reason}\``,
          edit: loading.key,
        });
      }

      const results = Array.isArray(res.data.results)
        ? res.data.results
        : Array.isArray(res.data.result)
          ? res.data.result
          : [];

      const cleaned = results
        .filter((r) => r && (r.url || r.link))
        .slice(0, 10)
        .map((r, i) => ({
          index: i + 1,
          title: r.title || 'Untitled',
          duration: r.duration || 'N/A',
          views: r.views || 0,
          author: r.author || r.channel || 'Unknown',
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

      let list = `╭───「 🎵 *SONG SEARCH* 」───╮\n│\n│  🔎 *Query* ›  ${query.slice(0, 40)}\n│\n`;
      cleaned.forEach((item) => {
        list +=
          `│  *${item.index}.* ${String(item.title).slice(0, 42)}\n` +
          `│      ⏱ ${item.duration} · 👁 ${formatViews(item.views)}\n` +
          `│      👤 ${String(item.author).slice(0, 28)}\n│\n`;
      });
      list += `│  👇 *${prefix}song <number>*\n│  ⏳ විනාඩි 2ක් ඇතුළත\n│\n╰──────────────────────╯`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      const firstThumb = cleaned[0].thumbnail;
      if (firstThumb) {
        try {
          await sock.sendMessage(
            from,
            { image: { url: firstThumb }, caption: list },
            { quoted: msg }
          );
          return;
        } catch (_) {}
      }
      await sock.sendMessage(from, { text: list }, { quoted: msg });
    } catch (err) {
      console.error('Song Search Error:', err.message);
      await sock.sendMessage(from, {
        text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``,
        edit: loading.key,
      }).catch(() => {});
    }
  },
};
