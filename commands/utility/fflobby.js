const axios = require('axios');
const config = require('../../config');

const API_URL = 'https://whiteshadow-x-api.onrender.com/api/tools/fake-ff';
const API_TOKEN = 'CkExxE';

module.exports = {
  name: 'fakef',
  aliases: ['fflobby', 'ff', 'fakefree', 'freefire'],
  description: 'Generate fake Free Fire lobby image',
  category: 'fun',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🔫 *FAKE FF LOBBY* 」───╮
│
│  ❌ *Usage:*
│  ${prefix}fakef <username>
│
│  📌 *Example:*
│  ${prefix}fakef WhiteShadow
│  ${prefix}ff Zayra
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const username = args.join(' ').trim().slice(0, 20);
    if (!username) {
      return sock.sendMessage(
        from,
        { text: `❌ Username එකක් දෙන්න.\n💡 ${prefix}fakef YourName` },
        { quoted: msg }
      );
    }

    const loading = await sock.sendMessage(
      from,
      { text: `🔫 *FF Lobby generate...\n👤 ${username}` },
      { quoted: msg }
    );

    try {
      const res = await axios.get(API_URL, {
        params: {
          username,
          apitoken: API_TOKEN,
        },
        responseType: 'arraybuffer',
        timeout: 90000,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/jpeg,image/*,*/*',
        },
      });

      const ct = String(res.headers?.['content-type'] || '').toLowerCase();
      const buffer = Buffer.from(res.data || []);

      if (res.status !== 200 || buffer.length < 1000) {
        let err = `HTTP ${res.status}`;
        try {
          const j = JSON.parse(buffer.toString('utf8'));
          err = j.message || j.error || err;
        } catch (_) {}
        throw new Error(err);
      }

      if (ct.includes('application/json') || ct.includes('text/html')) {
        let err = 'API error';
        try {
          const j = JSON.parse(buffer.toString('utf8'));
          err = j.message || j.error || err;
        } catch (_) {}
        throw new Error(err);
      }

      // JPEG magic
      const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
      if (!isJpeg && !isPng && !ct.includes('image')) {
        throw new Error('Invalid image response');
      }

      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      const caption = `
╭───「 🔫 *FAKE FF LOBBY* 」───╮
│
│  👤 *Name*  ›  ${username}
│  📦 *Size*  ›  ${sizeMB} MB
│
╰──────────────────────╯`.trim();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      await sock.sendMessage(
        from,
        {
          image: buffer,
          caption,
          mimetype: isPng ? 'image/png' : 'image/jpeg',
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('FakeFF Error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ FF lobby fail.\n\n\`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
