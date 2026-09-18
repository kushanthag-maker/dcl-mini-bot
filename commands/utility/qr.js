const axios = require('axios');
const config = require('../../config');

const QR_API = 'https://qqflpixiejlcthtdpwlb.supabase.co/functions/v1/zayra-api/qr';
const THUMB = 'https://files.catbox.moe/8ahyot.jpg';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const DEFAULT_SIZE = 300;
const MAX_SIZE = 1000;
const MIN_SIZE = 50;

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

async function replyBanner(sock, from, msg, text) {
  const caption = String(text) + foot();
  try {
    await sock.sendMessage(
      from,
      { image: { url: THUMB }, caption: caption },
      msg ? { quoted: msg } : undefined
    );
  } catch (_) {
    await sock.sendMessage(
      from,
      { text: caption },
      msg ? { quoted: msg } : undefined
    );
  }
}

module.exports = {
  name: 'qr',
  aliases: ['qrcode', 'genqr', 'makeqr'],
  description: 'Generate QR code from text / URL',
  category: 'tools',

  async execute(ctx) {
    const sock = ctx.sock;
    const msg = ctx.msg;
    const from = ctx.from;
    const args = ctx.args || [];
    const prefix = config.prefix || '.';

    if (!args.length) {
      return replyBanner(
        sock,
        from,
        msg,
        '╭───「 💖📱 *QR CODE* 」───╮\n│\n' +
          '│  Generate a QR code\n│\n' +
          '│  📌 Usage:\n' +
          '│  ' +
          prefix +
          'qr <text or url>\n' +
          '│  ' +
          prefix +
          'qr <text> | <size>\n│\n' +
          '│  🌸 Example:\n' +
          '│  ' +
          prefix +
          'qr https://dark-queen.vercel.app\n' +
          '│  ' +
          prefix +
          'qr Hello Queen | 400\n│\n' +
          '│  Size: ' +
          MIN_SIZE +
          '–' +
          MAX_SIZE +
          ' (default ' +
          DEFAULT_SIZE +
          ')\n' +
          '╰──────────────────────╯'
      );
    }

    let size = DEFAULT_SIZE;
    let dataParts = args.slice();
    const joined = args.join(' ');
    if (joined.includes('|')) {
      const bits = joined.split('|').map(function (s) {
        return s.trim();
      });
      dataParts = [bits[0]];
      const n = parseInt(bits[1], 10);
      if (!isNaN(n)) size = n;
    } else if (args.length > 1 && /^\d+$/.test(args[args.length - 1])) {
      size = parseInt(args[args.length - 1], 10);
      dataParts = args.slice(0, -1);
    }

    size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size || DEFAULT_SIZE));
    const data = dataParts.join(' ').trim();
    if (!data) {
      return replyBanner(sock, from, msg, '❌ Empty text');
    }

    await replyBanner(
      sock,
      from,
      msg,
      '⏳💕 *Generating QR...*\n📝 ' +
        (data.length > 40 ? data.slice(0, 40) + '…' : data) +
        '\n📐 size ' +
        size
    );

    try {
      const res = await axios.get(QR_API, {
        params: { data: data, size: size },
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/png,*/*' },
        validateStatus: function () {
          return true;
        },
      });

      if (res.status !== 200 || !res.data || res.data.byteLength < 50) {
        let errMsg = 'HTTP ' + res.status;
        try {
          errMsg = Buffer.from(res.data || []).toString('utf8').slice(0, 120);
        } catch (_) {}
        return replyBanner(sock, from, msg, '❌ QR failed\n`' + errMsg + '`');
      }

      const ct = String(res.headers['content-type'] || '');
      if (
        !ct.includes('image') &&
        Buffer.from(res.data).slice(0, 8).toString('hex').indexOf('89504e47') !== 0
      ) {
        const t = Buffer.from(res.data).toString('utf8').slice(0, 200);
        return replyBanner(sock, from, msg, '❌ Not an image\n`' + t + '`');
      }

      const buffer = Buffer.from(res.data);
      const caption =
        '╭───「 💖📱 *QR CODE* 」───╮\n│\n' +
        '│  ✅ *Generated*\n' +
        '│  📝 ' +
        (data.length > 60 ? data.slice(0, 60) + '…' : data) +
        '\n' +
        '│  📐 Size › *' +
        size +
        'px*\n│\n' +
        '╰──────────────────────╯' +
        foot();

      await sock.sendMessage(
        from,
        { image: buffer, caption: caption },
        { quoted: msg }
      );

      try {
        await sock.sendMessage(
          from,
          {
            image: { url: THUMB },
            caption: '✨ QR ready · ' + FOOTER + foot(),
          },
          { quoted: msg }
        );
      } catch (_) {}
    } catch (err) {
      console.error('[qr]', err.message);
      await replyBanner(sock, from, msg, '❌ `' + err.message + '`');
    }
  },
};
