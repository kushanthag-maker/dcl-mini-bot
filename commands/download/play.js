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
      let videoUrl = null;

      // ===== Extract / Search Video ID =====
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
        // Search YouTube
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
            text: '❌ YouTube search fail වුණා. Link එකක් දීලා try කරන්න.\nඋදා: `.play https://youtu.be/xxxxx`',
            edit: loading.key,
          });
        }

        const html = searchRes.data;

        // Multiple patterns to find video ID
        const patterns = [
          /"videoId":"([a-zA-Z0-9_-]{11})"/,
          /watch\?v=([a-zA-Z0-9_-]{11})/,
          /\/shorts\/([a-zA-Z0-9_-]{11})/,
        ];

        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            videoId = match[1];
            break;
          }
        }

        if (!videoId) {
          return sock.sendMessage(from, {
            text: '❌ Song එක හමු නොවීය.\n\n💡 YouTube link එකක් දීලා try කරන්න:\n`.play https://youtu.be/xxxxx`',
            edit: loading.key,
          });
        }
      }

      videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      // ===== Download MP3 =====
      const apiUrl = `https://hashu-apis-production.up.railway.app/api/ytdl?apiKey=hashu_a70f3f6beed64bebddc7c36026f813f5&text=${encodeURIComponent(videoUrl)}&type=mp3`;

      const { data, status } = await axios.get(apiUrl, {
        timeout: 60000,
        validateStatus: () => true, // 404 නිසා throw නොවෙන්න
      });

      if (status !== 200 || !data?.success || !data?.results?.direct_link) {
        return sock.sendMessage(from, {
          text: `❌ Song එක download කරන්න බැරි වුණා.\n\n📌 *Title search* fail වෙන්න පුළුවන්.\n💡 Direct YouTube link එකක් දීලා try කරන්න.`,
          edit: loading.key,
        });
      }

      const res = data.results;
      const duration = Math.floor(parseFloat(res.duration) || 0);
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const durationStr = `\( {mins}: \){secs.toString().padStart(2, '0')}`;

      const caption = `
╭───「 🎵 *PLAY* 」───╮
│
│  📌 *Title*     ›  ${res.title}
│  ⏱️ *Duration*  ›  ${durationStr}
│  🎧 *Quality*   ›  ${res.quality || '128-320kbps'}
│  🔗 *Source*    ›  YouTube
│
│  ✅ *Sending MP3...*
│
╰──────────────────────╯`.trim();

      // Delete loading
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // 1. Thumbnail + Info
      await sock.sendMessage(
        from,
        {
          image: { url: thumbnail },
          caption: caption,
        },
        { quoted: msg }
      );

      // 2. Audio
      await sock.sendMessage(
        from,
        {
          audio: { url: res.direct_link },
          mimetype: 'audio/mpeg',
          fileName: `${(res.title || 'song').substring(0, 50)}.mp3`,
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('Play Error:', err.message);
      await sock.sendMessage(from, {
        text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\`\n\n💡 YouTube link එකක් දීලා try කරන්න.`,
        edit: loading.key,
      }).catch(() => {});
    }
  },
};
