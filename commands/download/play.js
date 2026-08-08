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

    const query = args.join(' ');
    const isUrl = query.includes('youtube.com') || query.includes('youtu.be');

    const loading = await sock.sendMessage(from, {
      text: isUrl ? '🎵 *MP3 ලබාගනිමින්...*' : '🔍 *Song හොයමින්...*'
    }, { quoted: msg });

    try {
      let videoUrl = query;
      let videoId = null;

      // ===== Search mode =====
      if (!isUrl) {
        const searchRes = await axios.get(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            timeout: 15000,
          }
        );

        const match = searchRes.data.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
        if (!match) {
          return sock.sendMessage(from, {
            text: '❌ Song එක හමු නොවීය. වෙන නමකින් උත්සාහ කරන්න.',
            edit: loading.key,
          });
        }

        videoId = match[1];
        videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      } else {
        // Extract video ID from URL
        const idMatch = query.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
        videoId = idMatch ? idMatch[1] : null;
      }

      // ===== Download MP3 =====
      const api = `https://hashu-apis-production.up.railway.app/api/ytdl?apiKey=hashu_a70f3f6beed64bebddc7c36026f813f5&text=${encodeURIComponent(videoUrl)}&type=mp3`;
      const { data } = await axios.get(api, { timeout: 60000 });

      if (!data.success || !data.results?.direct_link) {
        return sock.sendMessage(from, {
          text: '❌ Song එක download කරන්න බැරි වුණා. වෙන එකක් උත්සාහ කරන්න.',
          edit: loading.key,
        });
      }

      const res = data.results;
      const duration = Math.floor(parseFloat(res.duration) || 0);
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const durationStr = `\( {mins}: \){secs.toString().padStart(2, '0')}`;

      // Thumbnail
      const thumbnail = videoId
        ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        : null;

      const caption = `
╭───「 🎵 *PLAY* 」───╮
│
│  📌 *Title*     ›  ${res.title}
│  ⏱️ *Duration*  ›  ${durationStr}
│  🎧 *Quality*   ›  ${res.quality || '128-320kbps'}
│  🔗 *Source*    ›  YouTube
│
│  ✅ *Downloading MP3...*
│
╰──────────────────────╯`.trim();

      // Delete loading message
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // 1. Send thumbnail + info
      if (thumbnail) {
        await sock.sendMessage(
          from,
          {
            image: { url: thumbnail },
            caption: caption,
          },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(from, { text: caption }, { quoted: msg });
      }

      // 2. Send the audio
      await sock.sendMessage(
        from,
        {
          audio: { url: res.direct_link },
          mimetype: 'audio/mpeg',
          fileName: `${res.title.substring(0, 50)}.mp3`,
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('Play Error:', err.message);
      await sock.sendMessage(from, {
        text: '❌ දෝෂයක් ඇතිවිය. නැවත උත්සාහ කරන්න.',
        edit: loading.key,
      }).catch(() => {});
    }
  },
};
