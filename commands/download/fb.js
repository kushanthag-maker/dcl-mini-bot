const axios = require('axios');

const API =
  'https://uzwid-52-12-117-99.run.pinggy-free.link/v1/fb/video';

function formatDuration(sec) {
  const n = Math.floor(Number(sec) || 0);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `\( {m}: \){s.toString().padStart(2, '0')}`;
}

function formatViews(v) {
  const n = Number(v) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

module.exports = {
  name: 'fb',
  aliases: ['facebook', 'fbdl'],
  description: 'Download Facebook video',
  category: 'download',
  async execute({ sock, msg, from, args }) {
    if (!args.length) {
      return sock.sendMessage(from, {
        text: `╭───「 📘 *FB DOWNLOAD* 」───╮
│
│  ❌ *Usage:*
│  .fb <facebook url>
│
│  📌 *Example:*
│  .fb https://www.facebook.com/share/v/xxxxx
│
╰──────────────────────╯`,
      }, { quoted: msg });
    }

    const url = args.join(' ').trim();
    if (!/facebook\.com|fb\.watch/i.test(url)) {
      return sock.sendMessage(from, {
        text: '❌ Valid Facebook link එකක් දෙන්න.',
      }, { quoted: msg });
    }

    const loading = await sock.sendMessage(from, {
      text: '📘 *Facebook video ලබාගනිමින්...*',
    }, { quoted: msg });

    try {
      const { data, status } = await axios.get(API, {
        params: { url },
        timeout: 60000,
        validateStatus: () => true,
      });

      if (status !== 200 || !data?.success || !data?.data) {
        return sock.sendMessage(from, {
          text: '❌ Video එක ගන්න බැරි වුණා. Link එක publicද බලන්න.',
          edit: loading.key,
        }).catch(() =>
          sock.sendMessage(from, {
            text: '❌ Video එක ගන්න බැරි වුණා. Link එක publicද බලන්න.',
          }, { quoted: msg })
        );
      }

      const v = data.data;
      const videoUrl = v.hd_url || v.sd_url;
      if (!videoUrl) {
        return sock.sendMessage(from, {
          text: '❌ Download link එකක් හමු නොවීය.',
          edit: loading.key,
        }).catch(() => {});
      }

      const quality = v.hd_url ? 'HD' : 'SD';
      const caption = `
╭───「 📘 *FB VIDEO* 」───╮
│
│  📌 *Title*     ›  ${v.title || 'Facebook Video'}
│  👤 *Uploader*  ›  ${(v.uploader || '—').trim()}
│  ⏱️ *Duration*  ›  ${formatDuration(v.duration)}
│  👀 *Views*     ›  ${formatViews(v.views)}
│  📺 *Quality*   ›  ${quality}
│
│  📥 *Downloading...*
│
╰──────────────────────╯`.trim();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (v.thumbnail) {
        await sock.sendMessage(from, {
          image: { url: v.thumbnail },
          caption,
        }, { quoted: msg }).catch(() =>
          sock.sendMessage(from, { text: caption }, { quoted: msg })
        );
      } else {
        await sock.sendMessage(from, { text: caption }, { quoted: msg });
      }

      const sending = await sock.sendMessage(from, {
        text: '📥 *Video buffer වෙමින්...*',
      }, { quoted: msg });

      // Prefer HD, fallback SD if HD is too big / fails
      let buffer = null;
      let used = quality;

      const tryDownload = async (link) => {
        const res = await axios.get(link, {
          responseType: 'arraybuffer',
          timeout: 180000,
          maxContentLength: 80 * 1024 * 1024,
          maxBodyLength: 80 * 1024 * 1024,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        return Buffer.from(res.data);
      };

      try {
        buffer = await tryDownload(videoUrl);
      } catch (e) {
        if (v.hd_url && v.sd_url && videoUrl === v.hd_url) {
          used = 'SD';
          buffer = await tryDownload(v.sd_url);
        } else {
          throw e;
        }
      }

      if (!buffer || buffer.length < 1000) {
        return sock.sendMessage(from, {
          text: '❌ Video file එක invalid.',
          edit: sending.key,
        }).catch(() => {});
      }

      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);

      await sock.sendMessage(from, { delete: sending.key }).catch(() => {});

      await sock.sendMessage(from, {
        video: buffer,
        mimetype: 'video/mp4',
        fileName: `${String(v.title || 'fb-video').substring(0, 40)}.mp4`,
        caption: `✅ *${v.title || 'Facebook Video'}*\n📺 ${used} • 📦 ${sizeMB} MB`,
      }, { quoted: msg });
    } catch (err) {
      console.error('FB Error:', err.message);
      await sock.sendMessage(from, {
        text: `❌ දෝෂයක් ඇතිවිය.\n\n\`${err.message}\`\n\n💡 Video එක ලොකු නම් fail වෙන්න පුළුවන්.`,
        edit: loading.key,
      }).catch(() =>
        sock.sendMessage(from, {
          text: `❌ දෝෂයක් ඇතිවිය.\n\`${err.message}\``,
        }, { quoted: msg })
      );
    }
  },
};
