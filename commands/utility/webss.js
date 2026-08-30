const axios = require('axios');
const config = require('../../config');

const API_URL = 'https://whiteshadow-x-api.onrender.com/api/tools/webss';
const API_TOKEN = 'CkExxE';

function normalizeUrl(input) {
  let u = String(input || '').trim();
  if (!u) return null;
  // strip wrapping
  u = u.replace(/^[<\[]+|[>\]]+$/g, '');
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u;
  }
  try {
    const parsed = new URL(u);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch (_) {
    return null;
  }
}

module.exports = {
  name: 'webss',
  aliases: ['ss', 'screenshot', 'webscreen'],
  description: 'Take website screenshot',
  category: 'tools',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 📸 *WEB SCREENSHOT* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}webss <url>
│
│  📌 *Example:*
│  ${prefix}webss https://google.com
│  ${prefix}ss github.com
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const target = normalizeUrl(args.join(' ').trim());
    if (!target) {
      return sock.sendMessage(
        from,
        { text: `❌ Valid URL එකක් දෙන්න.\n💡 ${prefix}webss https://google.com` },
        { quoted: msg }
      );
    }

    const loading = await sock.sendMessage(
      from,
      { text: `📸 *Screenshot...\n🔗 ${target}` },
      { quoted: msg }
    );

    try {
      const apiRes = await axios.get(API_URL, {
        params: {
          url: target,
          apitoken: API_TOKEN,
        },
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

      const data = apiRes.data;

      // Direct image response
      if (Buffer.isBuffer(data) || (typeof data === 'object' && data.type === 'Buffer')) {
        throw new Error('Unexpected binary — use JSON path');
      }

      if (data.success === false || data.status === false) {
        throw new Error(data.message || data.error || 'API failed');
      }

      const imgUrl =
        data.result_url ||
        data.download_url ||
        data.url ||
        data.result ||
        data.image ||
        null;

      if (!imgUrl || !/^https?:\/\//i.test(String(imgUrl))) {
        throw new Error('Screenshot image URL හොයාගන්න බැරි වුණා');
      }

      const caption = `
╭───「 📸 *WEB SS* 」───╮
│
│  🔗 *URL*  ›  ${target}
│
╰──────────────────────╯`.trim();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      try {
        await sock.sendMessage(
          from,
          { image: { url: imgUrl }, caption },
          { quoted: msg }
        );
      } catch (e1) {
        // buffer fallback
        const imgRes = await axios.get(imgUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
        });
        const buf = Buffer.from(imgRes.data || []);
        if (buf.length < 500) throw new Error('Image empty');
        await sock.sendMessage(
          from,
          { image: buf, caption, mimetype: 'image/png' },
          { quoted: msg }
        );
      }
    } catch (err) {
      console.error('WebSS Error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ Screenshot fail.\n\n\`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
