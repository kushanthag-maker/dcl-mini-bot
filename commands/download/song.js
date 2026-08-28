const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const config = require('../../config');

const API_KEY = 'hashu_f9f45a96c8d49e4f05d1552e45eb2166';
const SEARCH_API = 'https://hashu-apis-production.up.railway.app/api/song/search';
const DL_API = 'https://hashu-apis-production.up.railway.app/api/song/dl';
const FILE_API = 'https://hashu-apis-production.up.railway.app/api/song/file';
const MAX_WA_BYTES = 60 * 1024 * 1024;
const PENDING_TTL_MS = 2 * 60 * 1000;

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

/** Detect real audio container from magic bytes */
function detectAudio(buffer) {
  if (!buffer || buffer.length < 12) return null;
  // ID3 / MP3
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return { mimetype: 'audio/mpeg', ext: 'mp3' };
  }
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return { mimetype: 'audio/mpeg', ext: 'mp3' };
  }
  // EBML / WebM
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mimetype: 'audio/webm', ext: 'webm' };
  }
  // Ogg
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return { mimetype: 'audio/ogg; codecs=opus', ext: 'ogg' };
  }
  // ftyp (m4a/mp4)
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    return { mimetype: 'audio/mp4', ext: 'm4a' };
  }
  // RIFF WAV
  if (buffer.toString('ascii', 0, 4) === 'RIFF') {
    return { mimetype: 'audio/wav', ext: 'wav' };
  }
  return null;
}

function isJsonBuffer(buffer) {
  if (!buffer || buffer.length < 2) return false;
  const s = buffer.slice(0, 80).toString('utf8').trim();
  return s.startsWith('{') || s.startsWith('[');
}

/** Convert any audio buffer → MP3 via ffmpeg (WhatsApp-friendly) */
async function toMp3(inputBuffer, inputExt) {
  const tmp = os.tmpdir();
  const inFile = path.join(tmp, `song_in_${Date.now()}.${inputExt || 'webm'}`);
  const outFile = path.join(tmp, `song_out_${Date.now()}.mp3`);
  try {
    fs.writeFileSync(inFile, inputBuffer);
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', inFile, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', outFile],
      { timeout: 120000 }
    );
    const out = fs.readFileSync(outFile);
    return out;
  } finally {
    try { fs.unlinkSync(inFile); } catch (_) {}
    try { fs.unlinkSync(outFile); } catch (_) {}
  }
}

/** Stream download from file API into Buffer */
async function streamSongFile(youtubeUrl) {
  const res = await axios.get(FILE_API, {
    params: { apiKey: API_KEY, text: youtubeUrl },
    responseType: 'arraybuffer',
    timeout: 180000,
    maxContentLength: MAX_WA_BYTES + 10 * 1024 * 1024,
    maxBodyLength: MAX_WA_BYTES + 10 * 1024 * 1024,
    validateStatus: () => true,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
    // follow redirects
    maxRedirects: 5,
  });

  const buffer = Buffer.from(res.data || []);
  const ct = String(res.headers?.['content-type'] || '').toLowerCase();

  if (res.status !== 200) {
    let msg = `HTTP ${res.status}`;
    if (isJsonBuffer(buffer)) {
      try {
        msg = JSON.parse(buffer.toString()).message || msg;
      } catch (_) {}
    }
    throw new Error(msg);
  }

  if (isJsonBuffer(buffer) || ct.includes('application/json')) {
    let msg = 'API returned JSON error';
    try {
      msg = JSON.parse(buffer.toString()).message || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  if (buffer.length < 5000) {
    throw new Error(`File too small (${buffer.length} bytes)`);
  }

  return { buffer, contentType: ct };
}

async function fetchSongInfo(youtubeUrl) {
  try {
    const res = await axios.get(DL_API, {
      params: { apiKey: API_KEY, text: youtubeUrl },
      timeout: 60000,
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
    { text: '📥 *Song download වෙමින්...*\n⏳ ටිකක් ඉන්න' },
    { quoted: msg }
  );

  try {
    const ytUrl = item.url;
    const info = (await fetchSongInfo(ytUrl)) || {};
    const title = info.title || item.title || 'Song';
    const duration = info.duration || item.duration || 'N/A';
    const author = info.author || info.channel || item.author || 'Unknown';
    const thumb = info.thumbnail || item.thumbnail || null;

    await sock
      .sendMessage(from, {
        text: '⬇️ *Audio stream ලබාගනිමින්...*',
        edit: loading.key,
      })
      .catch(() => {});

    // 1) Stream file API → buffer
    const { buffer: rawBuf, contentType } = await streamSongFile(ytUrl);
    let detected = detectAudio(rawBuf);

    let audioBuffer = rawBuf;
    let mimetype = 'audio/mpeg';
    let ext = 'mp3';

    // 2) Convert webm/ogg to mp3 for WhatsApp compatibility
    if (detected && (detected.ext === 'webm' || detected.ext === 'ogg' || detected.ext === 'wav')) {
      await sock
        .sendMessage(from, {
          text: '🔄 *MP3 බවට convert කරමින්...*',
          edit: loading.key,
        })
        .catch(() => {});
      try {
        audioBuffer = await toMp3(rawBuf, detected.ext);
        mimetype = 'audio/mpeg';
        ext = 'mp3';
        detected = detectAudio(audioBuffer) || { mimetype, ext };
      } catch (convErr) {
        console.error('ffmpeg convert failed:', convErr.message);
        // fallback: send original
        mimetype = detected.mimetype;
        ext = detected.ext;
        audioBuffer = rawBuf;
      }
    } else if (detected) {
      mimetype = detected.mimetype;
      ext = detected.ext;
    } else {
      // Unknown — try force convert to mp3
      try {
        audioBuffer = await toMp3(rawBuf, 'webm');
        mimetype = 'audio/mpeg';
        ext = 'mp3';
      } catch (_) {
        mimetype = contentType.includes('webm') ? 'audio/webm' : 'audio/mpeg';
        ext = contentType.includes('webm') ? 'webm' : 'mp3';
        audioBuffer = rawBuf;
      }
    }

    if (!audioBuffer || audioBuffer.length < 3000) {
      return sock.sendMessage(from, {
        text: '❌ Audio buffer empty / invalid after download.',
        edit: loading.key,
      });
    }

    const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
    if (audioBuffer.length > MAX_WA_BYTES) {
      return sock.sendMessage(from, {
        text: `❌ File ගොඩක් ලොකුයි (*${sizeMB} MB*).`,
        edit: loading.key,
      });
    }

    const caption = `
╭───「 🎵 *SONG* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 60)}
│  👤 *Artist*   ›  ${String(author).slice(0, 40)}
│  ⏱ *Duration* ›  ${duration}
│  📦 *Size*     ›  ${sizeMB} MB
│  🎧 *Format*   ›  ${ext.toUpperCase()}
│  🔗 *Source*   ›  YouTube
│
╰──────────────────────╯`.trim();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    // Thumbnail + caption
    if (thumb && /^https?:\/\//i.test(thumb)) {
      try {
        await sock.sendMessage(from, { image: { url: thumb }, caption }, { quoted: msg });
      } catch (_) {
        await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
      }
    } else {
      await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
    }

    const fileName = `${sanitizeFileName(title)}.${ext}`;

    // Baileys: send as audio buffer (streamed already into memory)
    try {
      await sock.sendMessage(
        from,
        {
          audio: audioBuffer,
          mimetype: mimetype,
          fileName: fileName,
          ptt: false,
        },
        { quoted: msg }
      );
    } catch (e1) {
      console.error('audio send failed:', e1.message);
      // Document fallback (always works on WA)
      try {
        await sock.sendMessage(
          from,
          {
            document: audioBuffer,
            mimetype: mimetype,
            fileName: fileName,
            caption: '📁 Audio',
          },
          { quoted: msg }
        );
      } catch (e2) {
        throw e2;
      }
    }
  } catch (err) {
    console.error('Song Download Error:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌ Song download fail.\n\n\`${err.message}\`\n\n💡 වෙන number එකක් / song එකක් try කරන්න.`,
        edit: loading.key,
      })
      .catch(() => {});
  }
}

module.exports = {
  name: 'song',
  aliases: ['s', 'ytsong', 'music'],
  description: 'Search & download song (YouTube)',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const p = pending.get(from);
      if (!p || !p.results?.length) {
        return sock.sendMessage(
          from,
          { text: `❌ Active search නැහැ.\n💡 \`${prefix}song <name>\`` },
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
          text: `╭───「 🎵 *SONG* 」───╮
│
│  ${prefix}song <name>
│  ${prefix}song <youtube url>
│  ${prefix}song <number>
│
│  Example:
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

    if (isUrl) {
      return downloadAndSend({
        sock,
        msg,
        from,
        item: {
          url: query,
          title: 'YouTube Song',
          author: 'YouTube',
          duration: 'N/A',
          thumbnail: null,
        },
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

      let list = `╭───「 🎵 *SONG SEARCH* 」───╮\n│\n│  🔎 *${query.slice(0, 40)}*\n│\n`;
      cleaned.forEach((item) => {
        list +=
          `│  *${item.index}.* ${String(item.title).slice(0, 42)}\n` +
          `│      ⏱ ${item.duration} · 👁 ${formatViews(item.views)}\n` +
          `│      👤 ${String(item.author).slice(0, 28)}\n│\n`;
      });
      list += `│  👇 *${prefix}song <number>*\n│  ⏳ 2 min\n╰──────────────────────╯`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

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
      console.error('Song Search Error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ \`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
