const axios = require('axios');

module.exports = {
  name: 'play',
  aliases: ['song', 'p'],
  description: 'Search & download song as MP3 with thumbnail',
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
      text: isUrl ? '🎵 *MP3 ලබාගනිමින්...*' : '🔍 *Song හොයමින්...*'
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

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

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
      const duration = Math.floor(parseFloat(res.duration) || 0);
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const durationStr = `\( {mins}: \){secs.toString().padStart(2, '0')}`;

      // Update loading
      await sock.sendMessage(from, {
        text: '📥 *MP3 download වෙමින්...*',
        edit: loading.key,
      }).catch(() => {});

      // ===== Download MP3 as BUFFER (important) =====
      const audioRes = await axios.get(res.direct_link, {
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.youtube.com/',
        },
        maxContentLength: 50 * 1024 * 1024, // 50MB limit
        maxBodyLength: 50 * 1024 * 1024,
      });

      const audioBuffer = Buffer.from(audioRes.data);

      if (!audioBuffer || audioBuffer.length < 1000) {
        return sock.sendMessage(from, {
          text: '❌ Audio file එක හිස් හෝ invalid.',
          edit: loading.key,
        });
      }

      const caption = `
╭───「 🎵 *PLAY* 」───╮
│
│  📌 *Title*     ›  ${res.title}
│  ⏱️ *Duration*  ›  ${durationStr}
│  🎧 *Quality*   ›  ${res.quality || '128-320kbps'}
│  📦 *Size*      ›  ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB
│  🔗 *Source*    ›  YouTube
│
╰──────────────────────╯`.trim();

      // Delete loading
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // 1. Send thumbnail + info
      await sock.sendMessage(
        from,
        {
          image: { url: thumbnail },
          caption: caption,
        },
        { quoted: msg }
      );

      // 2. Send audio as BUFFER (this is the reliable way)
      await sock.sendMessage(
        from,
        {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          fileName: `${(res.title || 'song').substring(0, 40)}.mp3`,
          ptt: false,
        },
        { quoted: msg }
      );

    } catch (err) {
      console.error('Play Error:', err.message);
      await sock.sendMessage(from, {
        text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\``,
        edit: loading.key,
      }).catch(() => {});
    }
  },
};
