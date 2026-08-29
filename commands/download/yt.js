const axios = require('axios');
const config = require('../../config');

const API_URL = 'https://whiteshadow-x-api.onrender.com/api/download/ytdlfast';
const API_TOKEN = 'CkExxE';
const MAX_WA_BYTES = 60 * 1024 * 1024;

function extractYtUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function pickVideo(list) {
  if (!Array.isArray(list) || !list.length) return null;
  // Prefer progressive mp4 that WhatsApp can play: 360p first, then 720p, then any mp4
  const score = (item) => {
    const q = String(item.quality || '').toLowerCase();
    const f = String(item.format || '').toLowerCase();
    let s = 0;
    if (f === 'mp4') s += 50;
    if (q.includes('360')) s += 30;
    else if (q.includes('480')) s += 25;
    else if (q.includes('720')) s += 15;
    else if (q.includes('144') || q.includes('240')) s += 10;
    return s;
  };
  const sorted = [...list].filter((x) => x && x.url).sort((a, b) => score(b) - score(a));
  return sorted[0] || null;
}

function pickAudio(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const score = (item) => {
    const q = String(item.quality || '').toLowerCase();
    const f = String(item.format || '').toLowerCase();
    let s = 0;
    if (f === 'm4a') s += 40;
    if (f === 'mp3') s += 50;
    if (f === 'opus') s += 20;
    const kb = parseInt(q, 10);
    if (!isNaN(kb)) s += Math.min(kb, 200) / 10;
    return s;
  };
  const sorted = [...list].filter((x) => x && x.url).sort((a, b) => score(b) - score(a));
  return sorted[0] || null;
}

module.exports = {
  name: 'yt',
  aliases: ['ytdl', 'youtube', 'ytv'],
  description: 'Download YouTube video / audio',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 ▶️ *YOUTUBE DL* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}yt <youtube url>
│  ${prefix}yt audio <youtube url>
│
│  📌 *Example:*
│  ${prefix}yt https://youtu.be/M7y9sIvMGjw
│  ${prefix}yt audio https://youtu.be/M7y9sIvMGjw
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    let mode = 'video'; // video | audio
    let raw = args.join(' ').trim();
    if (/^(audio|mp3|song)$/i.test(args[0])) {
      mode = 'audio';
      raw = args.slice(1).join(' ').trim();
    } else if (/^(video|mp4|vid)$/i.test(args[0])) {
      mode = 'video';
      raw = args.slice(1).join(' ').trim();
    }

    const url = extractYtUrl(raw) || extractYtUrl(args.join(' '));
    if (!url) {
      return sock.sendMessage(
        from,
        { text: `❌ Valid YouTube link එකක් දෙන්න.\n💡 ${prefix}yt https://youtu.be/xxxxx` },
        { quoted: msg }
      );
    }

    const loading = await sock.sendMessage(
      from,
      { text: '📥 *YouTube process වෙමින්...*' },
      { quoted: msg }
    );

    try {
      const apiRes = await axios.get(API_URL, {
        params: { url, apitoken: API_TOKEN },
        timeout: 120000,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (apiRes.status !== 200 || !apiRes.data) {
        throw new Error(`API HTTP ${apiRes.status}`);
      }
      const body = apiRes.data;
      if (body.success === false || body.status === false) {
        throw new Error(body.message || body.error || 'API failed');
      }

      const meta = body.metadata || body.meta || {};
      const result = body.result || body.data || body;
      const title = meta.title || result.title || 'YouTube';
      const duration = meta.duration || result.duration || 'N/A';
      const thumb = meta.thumbnail || result.thumbnail || null;

      const videos = result.video || result.videos || [];
      const audios = result.audio || result.audios || [];

      let picked =
        mode === 'audio' ? pickAudio(audios) || pickAudio(videos) : pickVideo(videos);

      if (!picked || !picked.url) {
        throw new Error('Download link හොයාගන්න බැරි වුණා');
      }

      const quality = picked.quality || picked.format || mode;
      const isAudio =
        mode === 'audio' ||
        /m4a|mp3|opus|audio/i.test(String(picked.format || '') + String(picked.quality || ''));

      await sock
        .sendMessage(from, {
          text: `⬇️ *Download කරමින්...*\n🎬 ${quality}`,
          edit: loading.key,
        })
        .catch(() => {});

      const mediaRes = await axios.get(picked.url, {
        responseType: 'arraybuffer',
        timeout: 300000,
        maxContentLength: MAX_WA_BYTES + 15 * 1024 * 1024,
        maxBodyLength: MAX_WA_BYTES + 15 * 1024 * 1024,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.youtube.com/',
        },
      });

      const ct = String(mediaRes.headers?.['content-type'] || '').toLowerCase();
      if (
        mediaRes.status !== 200 ||
        ct.includes('text/html') ||
        ct.includes('application/json')
      ) {
        throw new Error('Media file ලබාගන්න බැරි වුණා (link expired)');
      }

      const buffer = Buffer.from(mediaRes.data);
      if (!buffer.length || buffer.length < 5000) {
        throw new Error('File empty / invalid');
      }

      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      if (buffer.length > MAX_WA_BYTES) {
        return sock.sendMessage(from, {
          text: `❌ File ලොකුයි (*${sizeMB} MB*).\n💡 \`${prefix}yt audio <url>\` try කරන්න හෝ short video එකක්.`,
          edit: loading.key,
        });
      }

      const caption = `
╭───「 ▶️ *YOUTUBE* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 60)}
│  ⏱ *Duration* ›  ${duration}
│  🎬 *Quality*  ›  ${quality}
│  📦 *Size*     ›  ${sizeMB} MB
│  📁 *Type*     ›  ${isAudio ? 'Audio' : 'Video'}
│
╰──────────────────────╯`.trim();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (thumb && /^https?:\/\//i.test(thumb) && isAudio) {
        try {
          await sock.sendMessage(from, { image: { url: thumb }, caption }, { quoted: msg });
        } catch (_) {
          await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
        }
      }

      if (isAudio) {
        let mimetype = 'audio/mp4';
        if (/mp3/i.test(quality + ct)) mimetype = 'audio/mpeg';
        else if (/opus/i.test(quality + ct)) mimetype = 'audio/ogg; codecs=opus';
        else if (/m4a|mp4/i.test(quality + ct)) mimetype = 'audio/mp4';

        try {
          await sock.sendMessage(
            from,
            {
              audio: buffer,
              mimetype,
              ptt: false,
              fileName: `${String(title).slice(0, 40).replace(/[^\w\s\-]/g, '')}.m4a`,
            },
            { quoted: msg }
          );
        } catch (e1) {
          await sock.sendMessage(
            from,
            {
              document: buffer,
              mimetype,
              fileName: 'youtube-audio.m4a',
              caption: caption,
            },
            { quoted: msg }
          );
        }
      } else {
        try {
          await sock.sendMessage(
            from,
            {
              video: buffer,
              mimetype: 'video/mp4',
              caption,
              fileName: 'youtube.mp4',
            },
            { quoted: msg }
          );
        } catch (e1) {
          console.error('YT video send fail:', e1.message);
          await sock.sendMessage(
            from,
            {
              document: buffer,
              mimetype: 'video/mp4',
              fileName: 'youtube.mp4',
              caption: caption + '\n\n📁 _Sent as document_',
            },
            { quoted: msg }
          );
        }
      }
    } catch (err) {
      console.error('YT Error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ YouTube download fail.\n\n\`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
