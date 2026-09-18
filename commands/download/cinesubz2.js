const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/movie/cinesubz/search';
const INFO_API = 'https://api.chamindu.site/api/v1/movie/cinesubz/infodl';
const THUMB = 'https://files.catbox.moe/7zd2gf.webp';
const SITE = 'https://dark-queen.vercel.app';
const DEFAULT_FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const PENDING_TTL = 6 * 60 * 1000;

const pending = new Map();
const footers = new Map();

function getFooter(from) {
  return footers.get(from) || DEFAULT_FOOTER;
}

function foot(from) {
  return (
    '\n🌸💕 *Pair:* ' +
    SITE +
    '\n> ✦ ' +
    getFooter(from) +
    ' ✦\n_*✰┈ ' +
    BOT_FANCY +
    ' ┈✰*_'
  );
}

function setPending(from, state) {
  const old = pending.get(from);
  if (old && old.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(function () {
    pending.delete(from);
  }, PENDING_TTL);
  pending.set(from, state);
}

function clean(s, n) {
  n = n || 60;
  const t = String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

async function replyImg(sock, from, msg, text) {
  const caption = String(text) + foot(from);
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

function isDirectLink(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (/telegram\.me|t\.me\//i.test(url)) return false;
  return true;
}

function extractDownloads(data) {
  const list = Array.isArray(data?.downloads) ? data.downloads : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (!d) continue;
    const url = d.link || d.url || d.direct || d.resolvedUrl || null;
    if (!url) continue;
    out.push({
      quality: d.quality || d.label || 'Video',
      size: d.size || '',
      language: d.language || '',
      url: url,
      direct: isDirectLink(url),
    });
  }
  return out;
}

async function searchApi(q) {
  const res = await axios.get(SEARCH_API, {
    params: { q: q, api_key: API_KEY },
    timeout: 45000,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    validateStatus: function () {
      return true;
    },
  });
  if (res.status !== 200 || !res.data) throw new Error('Search HTTP ' + res.status);
  if (res.data.status === false) {
    throw new Error(res.data.error || res.data.message || 'Search failed');
  }
  const list = Array.isArray(res.data.data) ? res.data.data : [];
  return list.slice(0, 12).map(function (r, i) {
    return {
      index: i + 1,
      title: r.title || 'Untitled',
      url: r.link || r.url,
      img: r.image || r.img || null,
      type: r.type || '',
      quality: r.quality || '',
      rating: r.rating || '',
    };
  });
}

async function infoApi(pageUrl) {
  const res = await axios.get(INFO_API, {
    params: { q: pageUrl, api_key: API_KEY },
    timeout: 120000,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    validateStatus: function () {
      return true;
    },
  });
  if (res.status !== 200 || !res.data) throw new Error('Info HTTP ' + res.status);
  if (res.data.status === false) {
    throw new Error(res.data.error || res.data.message || 'Info failed');
  }
  return res.data.data || res.data.result || res.data;
}

async function sendDocument(sock, from, msg, opt, title) {
  const footer = getFooter(from);
  const safeName =
    clean(title, 40).replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, '_') ||
    'movie';

  if (!opt.direct) {
    return replyImg(
      sock,
      from,
      msg,
      '🔗 *Telegram / page link*\n' +
        clean(opt.quality, 40) +
        '\n' +
        opt.url +
        '\n\nOpen in browser / Telegram'
    );
  }

  await replyImg(
    sock,
    from,
    msg,
    '⬆️💕 *Sending document...*\n🎥 ' + opt.quality + (opt.size ? ' · ' + opt.size : '')
  );

  try {
    await sock.sendMessage(
      from,
      {
        document: { url: opt.url },
        mimetype: 'video/mp4',
        fileName: safeName + '.mp4',
        caption:
          '📁 *' +
          clean(title, 50) +
          '*\n🎥 ' +
          opt.quality +
          (opt.size ? ' · ' + opt.size : '') +
          '\n> ✦ ' +
          footer +
          ' ✦',
      },
      { quoted: msg }
    );
  } catch (err) {
    console.error('[cinesubz2] doc', err.message);
    await replyImg(
      sock,
      from,
      msg,
      '⚠️ Document fail\n`' + err.message + '`\n\n🔗 ' + opt.url
    );
  }
}

async function openDetails(sock, msg, from, item, prefix) {
  await replyImg(sock, from, msg, '🌸✨ *Loading details...*');

  const info = await infoApi(item.url);
  const downloads = extractDownloads(info);
  const title = info.title || item.title;

  if (!downloads.length) {
    return replyImg(sock, from, msg, '🥺 No download links from API');
  }

  setPending(from, {
    type: 'quality',
    item: item,
    info: info,
    downloads: downloads,
    title: title,
  });

  const genres = Array.isArray(info.genres)
    ? info.genres.join(', ')
    : info.genres || '';

  let text =
    '╭───「 💖🎬 *CINESUBZ 2* 」───╮\n│\n' +
    '│  👑 *' +
    clean(title, 42) +
    '*\n' +
    '│  ⭐ IMDb › ' +
    (info.imdb || info.rating || item.rating || 'N/A') +
    '\n' +
    '│  📅 Year › ' +
    (info.year || 'N/A') +
    '\n' +
    '│  ⏱️ Duration › ' +
    (info.duration || 'N/A') +
    '\n' +
    '│  🎥 Quality › ' +
    (info.quality || item.quality || 'N/A') +
    '\n' +
    '│  🗣️ Lang › ' +
    (info.language || 'N/A') +
    '\n' +
    '│  🏷️ ' +
    clean(genres, 40) +
    '\n';

  if (info.story) {
    text += '│\n│  📝 ' + clean(info.story, 120) + '\n';
  }

  text += '│\n│  📥 *Downloads:*\n';
  downloads.forEach(function (d, i) {
    text +=
      '│  *' +
      (i + 1) +
      '.* ' +
      clean(d.quality, 36) +
      (d.size ? ' · ' + d.size : '') +
      (d.direct ? ' ✅' : ' 🔗') +
      '\n';
  });

  text +=
    '\n│  ✅ = WhatsApp document\n' +
    '│  🔗 = Telegram / page link\n' +
    '│  👇 *' +
    prefix +
    'cinesubz2 <number>*\n' +
    '│  ✨ Footer › ' +
    getFooter(from) +
    '\n' +
    '╰──────────────────────╯';

  const poster = info.image || item.img;
  if (poster && /^https?:\/\//i.test(poster)) {
    try {
      await sock.sendMessage(
        from,
        { image: { url: poster }, caption: text + foot(from) },
        { quoted: msg }
      );
      return;
    } catch (_) {}
  }
  return replyImg(sock, from, msg, text);
}

module.exports = {
  name: 'cinesubz2',
  aliases: ['cs2', 'cine2'],
  description: 'CineSubz v2 (Chamindu API) + custom footer',
  category: 'download',

  async execute(ctx) {
    const sock = ctx.sock;
    const msg = ctx.msg;
    const from = ctx.from;
    const args = ctx.args || [];
    const prefix = config.prefix || '.';
    const state = pending.get(from);

    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const n = parseInt(args[0], 10);

      if (state && state.type === 'search') {
        const item = state.results[n - 1];
        if (!item) {
          return replyImg(sock, from, msg, '❌ *1*–*' + state.results.length + '*');
        }
        try {
          return await openDetails(sock, msg, from, item, prefix);
        } catch (err) {
          console.error('[cinesubz2] info', err.message);
          return replyImg(sock, from, msg, '❌ `' + err.message + '`');
        }
      }

      if (state && state.type === 'quality') {
        const opt = state.downloads[n - 1];
        if (!opt) {
          return replyImg(
            sock,
            from,
            msg,
            '❌ *1*–*' + state.downloads.length + '*'
          );
        }
        return sendDocument(sock, from, msg, opt, state.title);
      }

      return replyImg(
        sock,
        from,
        msg,
        '🥺 No session\n💡 ' + prefix + 'cinesubz2 <name>'
      );
    }

    if (!args.length) {
      return replyImg(
        sock,
        from,
        msg,
        '╭───「 💖🎬 *CINESUBZ 2* 」───╮\n│\n' +
          '│  ' +
          prefix +
          'cinesubz2 <name>\n' +
          '│  ' +
          prefix +
          'cinesubz2 <number>\n' +
          '│  ' +
          prefix +
          'cinesubz2f <footer>\n│\n' +
          '│  API › Chamindu CineSubz\n' +
          '│  ✨ Footer › ' +
          getFooter(from) +
          '\n' +
          '╰──────────────────────╯'
      );
    }

    const query = args.join(' ').trim();
    await replyImg(sock, from, msg, '🔍💕 *Searching...*\n🔎 ' + clean(query, 40));

    try {
      const results = await searchApi(query);
      if (!results.length) {
        return replyImg(sock, from, msg, '🥺 No results');
      }
      setPending(from, { type: 'search', results: results });

      let list =
        '╭───「 💖🔍 *SEARCH* 」───╮\n│\n' +
        '│  🔎 *' +
        clean(query, 36) +
        '*\n' +
        '│  📦 ' +
        results.length +
        '\n│\n';
      results.forEach(function (r) {
        list += '│  *' + r.index + '.* ' + clean(r.title, 38) + '\n';
        list +=
          '│      ' +
          (r.quality || '-') +
          ' · ' +
          (r.type || '') +
          ' · ⭐' +
          (r.rating || '-') +
          '\n';
      });
      list +=
        '\n│  👇 *' +
        prefix +
        'cinesubz2 <number>*\n╰──────────────────────╯';
      await replyImg(sock, from, msg, list);
    } catch (err) {
      console.error('[cinesubz2] search', err.message);
      await replyImg(sock, from, msg, '❌ `' + err.message + '`');
    }
  },
};

module.exports.setFooter = function (from, text) {
  if (!text || !String(text).trim()) {
    footers.delete(from);
    return DEFAULT_FOOTER;
  }
  const t = String(text).trim().slice(0, 80);
  footers.set(from, t);
  return t;
};
module.exports.getFooter = getFooter;
module.exports.DEFAULT_FOOTER = DEFAULT_FOOTER;
module.exports.THUMB = THUMB;
module.exports.replyImg = replyImg;
