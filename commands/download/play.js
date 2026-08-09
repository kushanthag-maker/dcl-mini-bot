const axios = require('axios');

// chat (from) -> { videoId, title, thumbnail, videoUrl, timeout, createdAt }
const pendingSearch = new Map();
const PENDING_TTL_MS = 2 * 60 * 1000; // 2 minutes to reply

async function fetchAndSend({ sock, msg, from, videoId, title, thumbnail, format }) {
  const loading = await sock.sendMessage(from, {
    text: '📥 *MP3 download වෙමින්...*'
  }, { quoted: msg });

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // ===== Get MP3 direct link =====
    const apiUrl = `https://hashu-apis-production.up.railway.app/api/ytdl?apiKey=hashu_a70f3f6beed64bebddc7c36026f813f5&text=${encodeURIComponent(videoUrl)}&type=mp3`;

    const apiRes = await axios.get(apiUrl, {
      timeout: 60000,
      validateStatus: () => true,
    });

    if (apiRes.status !== 200 || !apiRes.data?.success || !apiRes.data?.results?.direct_link) {
      return sock.sendMessage(from, {
        text: '❌ Song එක download කරන්න බැරි වුණා.\n💡 Direct YouTube link එකක් දීලා try කරන්න.',
        edit: loading.key,
      });
    }

    const res = apiRes.data.results;
    const finalTitle = res.title || title;
    const duration = Math.floor(parseFloat(res.duration) || 0);
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const durationStr = duration > 0
      ? `${mins}:${secs.toString().padStart(2, '0')}`
      : 'N/A';

    // ===== Download MP3 as BUFFER (required for reliable WA delivery) =====
    const audioRes = await axios.get(res.direct_link, {
      responseType: 'arraybuffer',
      timeout: 120000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.youtube.com/',
      },
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    });

    const audioBuffer = Buffer.from(audioRes.data);

    if (!audioBuffer || audioBuffer.length < 1000) {
      return sock.sendMessage(from, {
        text: '❌ Audio file එක හිස් හෝ invalid.',
        edit: loading.key,
      });
    }

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

    const fileName = `${finalTitle.substring(0, 40)}.mp3`;

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
      // caption not supported on audio type, send info separately first
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
  description: 'Search song, then reply 1=MP3 / 2=Document',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    if (!args.length) {
      return sock.sendMessage(from, {
        text: `╭───「 🎵 *PLAY* 」───╮
│
│  ❌ *Usage:*
│  .play <song name>
│  .play <youtube url>
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
│  👇 *Reply* එකෙන් format එක choose කරන්න:
│
│  *1* › 🎧 MP3 (Audio)
│  *2* › 📁 Document
│
│  ⏳ විනාඩි 2ක් ඇතුළත reply කරන්න
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

  // Call this from your main message handler for every incoming message
  // (non-command text) BEFORE/alongside your other pendingSearch checks.
  // Returns true if it handled the message, false otherwise.
  async handleReply({ sock, msg, from, text }) {
    const pending = pendingSearch.get(from);
    if (!pending) return false;

    const choice = (text || '').trim();
    if (choice !== '1' && choice !== '2') return false;

    clearTimeout(pending.timeout);
    pendingSearch.delete(from);

    const format = choice === '2' ? 'document' : 'audio';

    await fetchAndSend({
      sock,
      msg,
      from,
      videoId: pending.videoId,
      title: pending.title,
      thumbnail: pending.thumbnail,
      format,
    });

    return true;
  },
};
