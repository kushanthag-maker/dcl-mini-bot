const axios = require('axios');

// chat (from) -> { videoId, title, thumbnail, timeout, createdAt }
const pendingSearch = new Map();
const PENDING_TTL_MS = 2 * 60 * 1000; // 2 minutes to pick a format
const MAX_DOWNLOAD_ATTEMPTS = 2;

// Remove characters that break WhatsApp document filenames (emoji, / \ : * ? " < > |)
function sanitizeFileName(name) {
  return (name || 'song')
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim()
    .substring(0, 40) || 'song';
}

// Real MP3 files start with an ID3 tag ("ID3") or an MPEG frame sync (0xFF Ex/Fx).
// If the "direct_link" actually points to an HTML error/redirect page, the
// downloaded bytes will NOT match this — that's the broken-file case.
function isValidMp3Buffer(buffer) {
  if (!buffer || buffer.length < 1000) return false;
  const b0 = buffer[0];
  const b1 = buffer[1];
  const isId3 = b0 === 0x49 && b1 === 0x44 && buffer[2] === 0x33; // "ID3"
  const isFrameSync = b0 === 0xff && (b1 & 0xe0) === 0xe0;
  return isId3 || isFrameSync;
}

async function getFreshDirectLink(videoUrl) {
  const apiUrl = `https://hashu-apis-production.up.railway.app/api/ytdl?apiKey=hashu_a70f3f6beed64bebddc7c36026f813f5&text=${encodeURIComponent(videoUrl)}&type=mp3`;
  const apiRes = await axios.get(apiUrl, { timeout: 60000, validateStatus: () => true });

  if (apiRes.status !== 200 || !apiRes.data?.success || !apiRes.data?.results?.direct_link) {
    return null;
  }
  return apiRes.data.results;
}

async function downloadAudioBuffer(directLink) {
  const audioRes = await axios.get(directLink, {
    responseType: 'arraybuffer',
    timeout: 120000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://www.youtube.com/',
    },
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024,
    validateStatus: () => true,
  });

  const contentType = (audioRes.headers?.['content-type'] || '').toLowerCase();
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    return null; // link expired / returned an error page instead of audio
  }

  return Buffer.from(audioRes.data);
}

async function fetchAndSend({ sock, msg, from, videoId, title, thumbnail, format }) {
  const loading = await sock.sendMessage(from, {
    text: '📥 *MP3 download වෙමින්...*'
  }, { quoted: msg });

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    let res = null;
    let audioBuffer = null;

    // Retry loop: if the buffer isn't a real MP3, fetch a fresh direct_link and try again
    for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
      res = await getFreshDirectLink(videoUrl);
      if (!res) continue;

      const buf = await downloadAudioBuffer(res.direct_link);
      if (buf && isValidMp3Buffer(buf)) {
        audioBuffer = buf;
        break;
      }

      if (attempt < MAX_DOWNLOAD_ATTEMPTS) {
        await sock.sendMessage(from, {
          text: '⚠️ Link එක fail වුණා, ආයෙත් try කරමින්...',
          edit: loading.key,
        }).catch(() => {});
      }
    }

    if (!res) {
      return sock.sendMessage(from, {
        text: '❌ Song එක download කරන්න බැරි වුණා.\n💡 Direct YouTube link එකක් දීලා try කරන්න.',
        edit: loading.key,
      });
    }

    if (!audioBuffer) {
      return sock.sendMessage(from, {
        text: '❌ Audio file එක corrupt/invalid (link expired වෙන්න ඇති).\n💡 ආයෙත් `.play <song name>` කරලා try කරන්න.',
        edit: loading.key,
      });
    }

    const finalTitle = res.title || title;
    const duration = Math.floor(parseFloat(res.duration) || 0);
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const durationStr = duration > 0
      ? `${mins}:${secs.toString().padStart(2, '0')}`
      : 'N/A';

    const fileSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);

    const caption = `
╭───「 🎵 *PLAY* 」───╮
│
│  📌 *Title*     ›  ${finalTitle}
│  ⏱️ *Duration*  ›  ${durationStr}
│  🎧 *Quality*   ›  ${res.quality || '128-320kbps'}
│  📦 *Size*      ›  ${fileSizeMB} MB
│  🔗 *Source*    ›  YouTube
│  📤 *Mode*      ›  ${format === 'document' ? 'Document' : 'Audio'}
│
╰──────────────────────╯`.trim();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    const fileName = `${sanitizeFileName(finalTitle)}.mp3`;

    if (format === 'document') {
      await sock.sendMessage(
        from,
        {
          document: audioBuffer,
          mimetype: 'audio/mpeg',
          fileName,
          caption,
        },
        { quoted: msg }
      );
    } else {
      // "audio" message type doesn't support captions, so send info first
      await sock.sendMessage(from, { image: { url: thumbnail }, caption }, { quoted: msg });
      await sock.sendMessage(
        from,
        {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          fileName,
          ptt: false,
        },
        { quoted: msg }
      );
    }
  } catch (err) {
    console.error('Play Download Error:', err.message);
    await sock.sendMessage(from, {
      text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``,
      edit: loading.key,
    }).catch(() => {});
  }
}

module.exports = {
  name: 'play',
  aliases: ['song', 'p'],
  description: 'Search song, then .play 1 (MP3) or .play 2 (Document)',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    // ===== Format selection: .play 1 / .play 2 =====
    if (args.length === 1 && (args[0] === '1' || args[0] === '2')) {
      const pending = pendingSearch.get(from);

      if (!pending) {
        return sock.sendMessage(from, {
          text: '❌ Active search එකක් නැහැ.\n💡 කලින් `.play <song name>` කරලා song එකක් search කරන්න.'
        }, { quoted: msg });
      }

      clearTimeout(pending.timeout);
      pendingSearch.delete(from);

      const format = args[0] === '2' ? 'document' : 'audio';

      return fetchAndSend({
        sock,
        msg,
        from,
        videoId: pending.videoId,
        title: pending.title,
        thumbnail: pending.thumbnail,
        format,
      });
    }

    // ===== Normal search =====
    if (!args.length) {
      return sock.sendMessage(from, {
        text: `╭───「 🎵 *PLAY* 」───╮
│
│  ❌ *Usage:*
│  .play <song name>
│  .play <youtube url>
│
│  📌 *After search:*
│  .play 1   › 🎧 MP3 (Audio)
│  .play 2   › 📁 Document
│
│  📌 *Example:*
│  .play maa dihaa dilu
│  .play https://youtu.be/K4UjOgTd_hM
│
╰──────────────────────╯`
      }, { quoted: msg });
    }

    const query = args.join(' ').trim();
    const isUrl = /youtube\.com|youtu\.be/i.test(query);

    const loading = await sock.sendMessage(from, {
      text: isUrl ? '🎵 *සොයමින්...*' : '🔍 *Song හොයමින්...*'
    }, { quoted: msg });

    try {
      let videoId = null;

      // ===== Get Video ID =====
      if (isUrl) {
        const idMatch = query.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})/);
        if (!idMatch) {
          return sock.sendMessage(from, {
            text: '❌ Valid YouTube link එකක් නොවේ.',
            edit: loading.key,
          });
        }
        videoId = idMatch[1];
      } else {
        const searchRes = await axios.get(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 20000,
            validateStatus: () => true,
          }
        );

        if (searchRes.status !== 200) {
          return sock.sendMessage(from, {
            text: '❌ YouTube search fail වුණා. Link එකක් දීලා try කරන්න.',
            edit: loading.key,
          });
        }

        const html = searchRes.data;
        const patterns = [
          /"videoId":"([a-zA-Z0-9_-]{11})"/,
          /watch\?v=([a-zA-Z0-9_-]{11})/,
          /\/shorts\/([a-zA-Z0-9_-]{11})/,
        ];

        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match?.[1]) {
            videoId = match[1];
            break;
          }
        }

        if (!videoId) {
          return sock.sendMessage(from, {
            text: '❌ Song එක හමු නොවීය.\n💡 YouTube link එකක් දීලා try කරන්න.',
            edit: loading.key,
          });
        }
      }

      const title = query;
      const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      // Clear any previous pending entry + timeout for this chat
      const existing = pendingSearch.get(from);
      if (existing?.timeout) clearTimeout(existing.timeout);

      const timeout = setTimeout(() => {
        pendingSearch.delete(from);
      }, PENDING_TTL_MS);

      pendingSearch.set(from, { videoId, title, thumbnail, timeout, createdAt: Date.now() });

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      await sock.sendMessage(
        from,
        {
          image: { url: thumbnail },
          caption: `╭───「 🎵 *PLAY* 」───╮
│
│  📌 *Title*  ›  ${title}
│
│  👇 *Reply* කරන්න format එක choose කරන්න:
│
│  *.play 1* › 🎧 MP3 (Audio)
│  *.play 2* › 📁 Document
│
│  ⏳ විනාඩි 2ක් ඇතුළත command එක දෙන්න
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('Play Search Error:', err.message);
      await sock.sendMessage(from, {
        text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``,
        edit: loading.key,
      }).catch(() => {});
    }
  },
};
