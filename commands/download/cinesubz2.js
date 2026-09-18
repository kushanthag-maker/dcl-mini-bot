const axios = require('axios');
const config = require('../../config');

const SEARCH_API = 'https://sadewapi.up.railway.app/api/cinesubz/search';
const DL_API = 'https://sadewapi.up.railway.app/api/cinesubz/movidl';
const THUMB = 'https://files.catbox.moe/7zd2gf.webp';
const SITE = 'https://dark-queen.vercel.app';
const DEFAULT_FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const PENDING_TTL = 5 * 60 * 1000;

const pending = new Map(); // from -> state
const footers = new Map(); // from -> custom footer text

function getFooter(from) {
  return footers.get(from) || DEFAULT_FOOTER;
}

function foot(from) {
  const f = getFooter(from);
  return (
    '\n🌸💕 *Pair:* ' +
    SITE +
    '\n> ✦ ' +
    f +
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
    .replace(/&#39;/g, "'")
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

async function searchApi(q) {
  const res = await axios.get(SEARCH_API, {
    params: { q: q },
    timeout: 45000,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    validateStatus: function () {
      return true;
    },
  });
  if (res.status !== 200 || !res.data) throw new Error('Search HTTP ' + res.status);
  if (res.data.success === false) {
    throw new Error(res.data.message || res.data.error || 'Search failed');
  }
  const list = Array.isArray(res.data.result) ? res.data.result : [];
  return list.slice(0, 12).map(function (r, i) {
    return {
      index: i + 1,
      id: r.id,
      title: r.title || 'Untitled',
      url: r.url,
      img: r.img || null,
      imdb: r.imdb || '',
      date: r.date || '',
      runtime: r.runtime || '',
      genres: r.genres || '',
      quality: r.quality || '',
      type: r.type || '',
      streamUrl: r.streamUrl || null,
    };
  });
}

async function infoApi(pageUrl) {
  const res = await axios.get(DL_API, {
    params: { url: pageUrl },
    timeout: 90000,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    validateStatus: function () {
      return true;
    },
  });
  if (res.status !== 200 || !res.data) throw new Error('Info HTTP ' + res.status);
  if (res.data.success === false) {
    throw new Error(res.data.message || res.data.error || 'Info failed');
  }
  return res.data.result || res.data;
}

function buildDetailCaption(item, info, from) {
  const title = info.title || item.title;
  const quality = info.quality || item.quality || 'N/A';
  const downloads = Array.isArray(info.downloads) ? info.downloads : [];

  let text =
    '╭───「 💖🎬 *CINESUBZ 2* 」───╮\n│\n' +
    '│  👑 *' +
    clean(title, 42) +
    '*\n' +
    '│  🎞️ Type › ' +
    (info.type || item.type || 'movie') +
    '\n' +
    '│  ⭐ IMDb › ' +
    (item.imdb || 'N/A') +
    '\n' +
    '│  📅 Year › ' +
    (item.date || 'N/A') +
    '\n' +
    '│  ⏱️ Runtime › ' +
    clean(item.runtime || 'N/A', 20) +
    '\n' +
    '│  🎥 Quality › ' +
    quality +
    '\n' +
    '│  🏷️ Genres › ' +
    clean(item.genres || 'N/A', 40) +
    '\n│\n' +
    '│  📥 *Download options:*\n';

  downloads.forEach(function (d, i) {
    text += '│  *' + (i + 1) + '.* ' + clean(d.meta || d.label || 'Link', 42) + '\n';
  });

  text +=
    '\n│  👇 *' +
    (config.prefix || '.') +
    'cinesubz2 <number>*\n' +
    '│  📁 Document stream\n' +
    '│  ✨ Footer › ' +
    getFooter(from) +
    '\n' +
    '╰──────────────────────╯';

  return text;
}

async function sendDocument(sock, from, msg, opt, title) {
  const footer = getFooter(from);
  const safeName = clean(title, 40)
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_') || 'movie';

  await replyImg(
    sock,
    from,
    msg,
    '⬆️💕 *Sending document...*\n🎥 ' + (opt.meta || opt.label || 'Video')
  );

  const caption =
    '📁 *' +
    clean(title, 50) +
    '*\n🎥 ' +
    (opt.meta || opt.label || '') +
    '\n> ✦ ' +
    footer +
    ' ✦';

  try {
    await sock.sendMessage(
      from,
      {
        document: { url: opt.resolvedUrl },
        mimetype: 'video/mp4',
        fileName: safeName + '.mp4',
        caption: caption,
      },
      { quoted: msg }
    );
  } catch (err) {
    console.error('[cinesubz2] doc', err.message);
    await replyImg(
      sock,
      from,
      msg,
      '⚠️ Document fail\n`' +
        err.message +
        '`\n\n🔗 ' +
        opt.resolvedUrl
    );
  }
}

module.exports = {
  name: 'cinesubz2',
  aliases: ['cs2', 'cine2'],
  description: 'CineSubz search & document download (v2)',
  category: 'download',

  async execute(ctx) {
    const sock = ctx.sock;
    const msg = ctx.msg;
    const from = ctx.from;
    const args = ctx.args || [];
    const prefix = config.prefix || '.';
    const state = pending.get(from);

    // number select
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const n = parseInt(args[0], 10);

      if (state && state.type === 'search') {
        const item = state.results[n - 1];
        if (!item) {
          return replyImg(sock, from, msg, '❌ Pick *1*–*' + state.results.length + '*');
        }

        await replyImg(sock, from, msg, '🌸✨ *Loading details...*');

        try {
          const info = await infoApi(item.url);
          const downloads = Array.isArray(info.downloads)
            ? info.downloads.filter(function (d) {
                return d && d.resolvedUrl;
              })
            : [];

          if (!downloads.length) {
            return replyImg(sock, from, msg, '🥺 No direct download links');
          }

          setPending(from, {
            type: 'quality',
            item: item,
            info: info,
            downloads: downloads,
          });

          const detail = buildDetailCaption(item, info, from);

          // detail card with poster if available
          const poster = item.img;
          if (poster && /^https?:\/\//i.test(poster)) {
            try {
              await sock.sendMessage(
                from,
                {
                  image: { url: poster },
                  caption: detail + foot(from),
                },
                { quoted: msg }
              );
              return;
            } catch (_) {}
          }
          return replyImg(sock, from, msg, detail);
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
            '❌ Pick *1*–*' + state.downloads.length + '*'
          );
        }
        const title = (state.info && state.info.title) || state.item.title;
        return sendDocument(sock, from, msg, opt, title);
      }

      return replyImg(
        sock,
        from,
        msg,
        '🥺 No active search\n💡 ' + prefix + 'cinesubz2 <name>'
      );
    }

    if (!args.length) {
      return replyImg(
        sock,
        from,
        msg,
        '╭───「 💖🎬 *CINESUBZ 2* 」───╮\n│\n' +
          '│  📌 Search:\n' +
          '│  ' +
          prefix +
          'cinesubz2 <movie name>\n│\n' +
          '│  📌 Select:\n' +
          '│  ' +
          prefix +
          'cinesubz2 <number>\n│\n' +
          '│  📌 Custom footer:\n' +
          '│  ' +
          prefix +
          'cinesubz2f <text>\n│\n' +
          '│  ✨ Footer › ' +
          getFooter(from) +
          '\n' +
          '╰──────────────────────╯'
      );
    }

    const query = args.join(' ').trim();
    await replyImg(sock, from, msg, '🔍💕 *Searching CineSubz...*\n🔎 ' + clean(query, 40));

    try {
      const results = await searchApi(query);
      if (!results.length) {
        return replyImg(sock, from, msg, '🥺 No results for *' + clean(query, 30) + '*');
      }

      setPending(from, { type: 'search', results: results });

      let list =
        '╭───「 💖🔍 *SEARCH* 」───╮\n│\n' +
        '│  🔎 *' +
        clean(query, 36) +
        '*\n' +
        '│  📦 ' +
        results.length +
        ' results\n│\n';

      results.forEach(function (r) {
        list += '│  *' + r.index + '.* ' + clean(r.title, 38) + '\n';
        list +=
          '│      ⭐' +
          (r.imdb || '-') +
          ' · ' +
          (r.date || '') +
          ' · ' +
          (r.type || '') +
          '\n';
      });

      list +=
        '\n│  👇 *' +
        prefix +
        'cinesubz2 <number>*\n' +
        '│  ⏳ 5 min session\n' +
        '╰──────────────────────╯';

      await replyImg(sock, from, msg, list);
    } catch (err) {
      console.error('[cinesubz2] search', err.message);
      await replyImg(sock, from, msg, '❌ `' + err.message + '`');
    }
  },
};

/** Separate export used by cinesubz2f.js — also keep footer setter here */
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
