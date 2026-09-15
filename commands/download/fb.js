const axios = require('axios');
const config = require('../../config');

const API = 'https://sadewapi.up.railway.app/api/facebook/download';
const THUMB = 'https://files.catbox.moe/gi50va.jpg';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';

function foot() {
  return (
    '\n🌸💕 *Pair:* ' +
    SITE +
    '\n> ✦ ' +
    FOOTER +
    ' ✦\n_*✰┈ ' +
    BOT_FANCY +
    ' ┈✰*_'
  );
}

function isFbUrl(s) {
  if (!s) return false;
  return /facebook\.com|fb\.watch|fb\.com|fburl/i.test(s);
}

function pickMedia(data) {
  if (!data) return { title: null, thumb: null, videos: [] };
  const root = data.result || data.data || data;
  const title =
    root.title || root.caption || data.title || 'Facebook Video';
  const thumb =
    root.thumbnail ||
    root.thumb ||
    root.image ||
    root.picture ||
    data.thumbnail ||
    null;

  const videos = [];
  const push = (url, label) => {
    if (url && /^https?:\/\//i.test(url)) {
      videos.push({ url, label: label || 'Video' });
    }
  };

  // common shapes
  if (typeof root === 'string' && /^https?:\/\//i.test(root)) {
    push(root, 'Video');
  }
  push(root.hd || root.hdUrl || root.video_hd || root.high, 'HD');
  push(root.sd || root.sdUrl || root.video_sd || root.low || root.normal, 'SD');
  push(root.url || root.video || root.videoUrl || root.download, 'Video');
  push(root.mp4, 'MP4');

  if (Array.isArray(root.videos)) {
    root.videos.forEach((v, i) => {
      if (typeof v === 'string') push(v, 'Video ' + (i + 1));
      else push(v?.url || v?.link, v?.quality || v?.resolution || 'Video');
    });
  }
  if (Array.isArray(root.media)) {
    root.media.forEach((v, i) => {
      push(v?.url || v?.link || v, v?.quality || 'Media ' + (i + 1));
    });
  }
  if (Array.isArray(data.links)) {
    data.links.forEach((v, i) => {
      push(v?.url || v, v?.quality || 'Link ' + (i + 1));
    });
  }

  // de-dupe
  const seen = {};
  const uniq = videos.filter((v) => {
    if (seen[v.url]) return false;
    seen[v.url] = true;
    return true;
  });

  return { title: String(title).slice(0, 120), thumb, videos: uniq };
}

async function sendBanner(sock, from, msg, caption) {
  try {
    await sock.sendMessage(
      from,
      { image: { url: THUMB }, caption },
      { quoted: msg }
    );
  } catch (_) {
    await sock.sendMessage(from, { text: caption }, { quoted: msg });
  }
}

module.exports = {
  name: 'fb',
  aliases: ['facebook', 'fbdl', 'fbdown'],
  description: 'Download Facebook video',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (!args || !args.length) {
      return sendBanner(
        sock,
        from,
        msg,
        '╭───「 💖📥 *FACEBOOK* 」───╮\n│\n' +
          '│  📌 Usage:\n' +
          '│  ' +
          prefix +
          'fb <facebook link>\n│\n' +
          '│  🌸 Example:\n' +
          '│  ' +
          prefix +
          'fb https://fb.watch/xxxx\n│\n' +
          '╰──────────────────────╯' +
          foot()
      );
    }

    const url = args.find((a) => isFbUrl(a)) || args[0];
    if (!isFbUrl(url) && !/^https?:\/\//i.test(url)) {
      return sendBanner(
        sock,
        from,
        msg,
        '❌💕 Invalid Facebook link\n💡 ' + prefix + 'fb <link>' + foot()
      );
    }

    await sendBanner(
      sock,
      from,
      msg,
      '╭───「 💖📥 *FACEBOOK* 」───╮\n│\n' +
        '│  ⏳ *Downloading for you...*\n' +
        '│  🌸 Please wait\n│\n' +
        '╰──────────────────────╯' +
        foot()
    );

    try {
      const res = await axios.get(API, {
        params: { url },
        timeout: 90000,
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        validateStatus: () => true,
      });

      if (res.status !== 200 || !res.data) {
        return sendBanner(
          sock,
          from,
          msg,
          '❌💔 API error HTTP ' + res.status + foot()
        );
      }

      if (res.data.status === false || res.data.success === false) {
        return sendBanner(
          sock,
          from,
          msg,
          '❌💔 ' +
            (res.data.msg || res.data.message || res.data.error || 'Download failed') +
            foot()
        );
      }

      const { title, thumb, videos } = pickMedia(res.data);

      if (!videos.length) {
        return sendBanner(
          sock,
          from,
          msg,
          '🥺 No video link found\nTry another post' + foot()
        );
      }

      // prefer HD then first
      const best =
        videos.find((v) => /hd/i.test(v.label)) ||
        videos[0];

      const info =
        '╭───「 💖📥 *FACEBOOK* 」───╮\n│\n' +
        '│  👑 *' +
        (title || 'Facebook Video') +
        '*\n' +
        '│  🎥 Quality › *' +
        best.label +
        '*\n' +
        '│  💕 Sending video...\n│\n' +
        '╰──────────────────────╯' +
        foot();

      // info with your banner image
      await sendBanner(sock, from, msg, info);

      // optional API thumb
      if (thumb && /^https?:\/\//i.test(thumb)) {
        await sock
          .sendMessage(
            from,
            {
              image: { url: thumb },
              caption: '🖼️ *Preview*\n> ✦ ' + FOOTER + ' ✦',
            },
            { quoted: msg }
          )
          .catch(() => {});
      }

      // send video (direct url stream)
      try {
        await sock.sendMessage(
          from,
          {
            video: { url: best.url },
            caption:
              '📁💕 *' +
              (title || 'FB Video') +
              '*\n🎥 ' +
              best.label +
              '\n> ✦ ' +
              FOOTER +
              ' ✦',
          },
          { quoted: msg }
        );
      } catch (e1) {
        // fallback document
        try {
          await sock.sendMessage(
            from,
            {
              document: { url: best.url },
              mimetype: 'video/mp4',
              fileName: 'facebook.mp4',
              caption: '📁 *FB Video*\n> ✦ ' + FOOTER + ' ✦',
            },
            { quoted: msg }
          );
        } catch (e2) {
          await sendBanner(
            sock,
            from,
            msg,
            '⚠️ Upload failed — use link:\n' + best.url + foot()
          );
        }
      }

      // other qualities as links
      if (videos.length > 1) {
        let extra = '🔗 *Other qualities:*\n';
        videos.forEach((v, i) => {
          extra += '*' + (i + 1) + '.* ' + v.label + '\n' + v.url + '\n';
        });
        await sock.sendMessage(from, { text: extra + foot() }, { quoted: msg });
      }
    } catch (err) {
      console.error('[fb]', err.message);
      await sendBanner(sock, from, msg, '❌💔 `' + err.message + '`' + foot());
    }
  },
};
