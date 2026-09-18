const axios = require('axios');
const config = require('../../config');

const SEARCH_API = 'https://sadewapi.up.railway.app/api/cinesubz/search';
const DL_API = 'https://sadewapi.up.railway.app/api/cinesubz/movidl';
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

/** Collect direct download options from any shape */
function extractDownloads(node) {
  const out = [];
  if (!node) return out;

  const list = Array.isArray(node)
    ? node
    : Array.isArray(node.downloads)
      ? node.downloads
      : [];

  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (!d) continue;
    const url =
      d.resolvedUrl ||
      d.resolved_url ||
      d.directUrl ||
      d.direct ||
      d.downloadUrl ||
      d.url ||
      d.link ||
      null;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    // skip non-media host pages if only zt without resolve — still allow csplayer/drive
    out.push({
      label: d.label || 'Download',
      meta: d.meta || d.quality || d.label || 'Video',
      resolvedUrl: url,
      ztLink: d.ztLink || null,
    });
  }
  return out;
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
    };
  });
}

async function infoApi(pageUrl) {
  const res = await axios.get(DL_API, {
    params: { url: pageUrl },
    timeout: 120000,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    validateStatus: function () {
      return true;
    },
  });
  if (res.status !== 200 || !res.data) throw new Error('Info HTTP ' + res.status);
  if (res.data.success === false) {
    throw new Error(res.data.message || res.data.error || 'Info failed');
  }
  return res.data.result || res.data.data || res.data;
}

async function sendDocument(sock, from, msg, opt, title) {
  const footer = getFooter(from);
  const safeName =
    clean(title, 40).replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, '_') ||
    'movie';

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
      '⚠️ Document fail\n`' + err.message + '`\n\n🔗 ' + opt.resolvedUrl
    );
  }
}

function showQualityList(item, title, downloads, from, prefix) {
  let text =
    '╭───「 💖🎬 *DOWNLOAD* 」───╮\n│\n' +
    '│  👑 *' +
    clean(title, 42) +
    '*\n│\n' +
    '│  📥 *Pick quality:*\n';
  downloads.forEach(function (d, i) {
    text += '│  *' + (i + 1) + '.* ' + clean(d.meta || d.label, 42) + '\n';
  });
  text +=
    '\n│  👇 *' +
    prefix +
    'cinesubz2 <number>*\n' +
    '│  📁 Document stream\n' +
    '│  ✨ Footer › ' +
    getFooter(from) +
    '\n' +
    '╰──────────────────────╯';
  return text;
}

async function openMovieOrTv(sock, msg, from, item, prefix) {
  await replyImg(sock, from, msg, '🌸✨ *Loading details...*');

  const info = await infoApi(item.url);
  const type = String(info.type || item.type || 'movie').toLowerCase();

  // ----- TV SHOW: episode list -----
  if (type.includes('tv') || Array.isArray(info.episodes)) {
    const episodes = Array.isArray(info.episodes) ? info.episodes : [];
    if (!episodes.length) {
      return replyImg(sock, from, msg, '🥺 No episodes found');
    }

    setPending(from, {
      type: 'episodes',
      item: item,
      info: info,
      episodes: episodes,
    });

    const show = episodes.slice(0, 30);
    let text =
      '╭───「 💖📺 *TV SHOW* 」───╮\n│\n' +
      '│  👑 *' +
      clean(info.title || item.title, 42) +
      '*\n' +
      '│  📦 Seasons › ' +
      (info.totalSeasons || '?') +
      '\n' +
      '│  🎬 Episodes › ' +
      (info.totalEpisodes || episodes.length) +
      '\n│\n' +
      '│  💕 *Pick episode:*\n';

    show.forEach(function (ep, i) {
      text +=
        '│  *' +
        (i + 1) +
        '.* S' +
        (ep.season || '?') +
        'E' +
        (ep.episode || i + 1) +
        ' · ' +
        clean(ep.episodeTitle || '', 24) +
        '\n';
    });
    if (episodes.length > show.length) {
      text += '│  … +' + (episodes.length - show.length) + ' more\n';
    }
    text +=
      '\n│  👇 *' +
      prefix +
      'cinesubz2 <number>*\n' +
      '╰──────────────────────╯';

    const poster = item.img;
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

  // ----- MOVIE: quality list -----
  let downloads = extractDownloads(info);
  if (!downloads.length && info.result) {
    downloads = extractDownloads(info.result);
  }

  if (!downloads.length) {
    console.error('[cinesubz2] no downloads keys=', Object.keys(info || {}));
    return replyImg(
      sock,
      from,
      msg,
      '🥺 No direct download links\nAPI returned empty downloads for this title'
    );
  }

  setPending(from, {
    type: 'quality',
    item: item,
    info: info,
    downloads: downloads,
    title: info.title || item.title,
  });

  const detail =
    '╭───「 💖🎬 *MOVIE* 」───╮\n│\n' +
    '│  👑 *' +
    clean(info.title || item.title, 42) +
    '*\n' +
    '│  ⭐ IMDb › ' +
    (item.imdb || 'N/A') +
    '\n' +
    '│  📅 Year › ' +
    (item.date || 'N/A') +
    '\n' +
    '│  ⏱️ ' +
    clean(item.runtime || 'N/A', 20) +
    '\n' +
    '│  🎥 ' +
    (info.quality || item.quality || 'N/A') +
    '\n' +
    '│  🏷️ ' +
    clean(item.genres || 'N/A', 40) +
    '\n│\n' +
    showQualityList(item, info.title || item.title, downloads, from, prefix).replace(
      /^╭───「 💖🎬 \*DOWNLOAD\* 」───╮\n│\n│  👑 \*[^\n]*\*\n│\n/,
      ''
    );

  // simpler combined caption
  let text =
    '╭───「 💖🎬 *MOVIE* 」───╮\n│\n' +
    '│  👑 *' +
    clean(info.title || item.title, 42) +
    '*\n' +
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
    (info.quality || item.quality || 'N/A') +
    '\n' +
    '│  🏷️ Genres › ' +
    clean(item.genres || 'N/A', 40) +
    '\n│\n' +
    '│  📥 *Pick quality:*\n';
  downloads.forEach(function (d, i) {
    text += '│  *' + (i + 1) + '.* ' + clean(d.meta || d.label, 42) + '\n';
  });
  text +=
    '\n│  👇 *' +
    prefix +
    'cinesubz2 <number>*\n' +
    '│  📁 Document stream\n' +
    '│  ✨ Footer › ' +
    getFooter(from) +
    '\n' +
    '╰──────────────────────╯';

  const poster = item.img;
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
  description: 'CineSubz v2 search & document download',
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

      // search → open movie/tv
      if (state && state.type === 'search') {
        const item = state.results[n - 1];
        if (!item) {
          return replyImg(sock, from, msg, '❌ *1*–*' + state.results.length + '*');
        }
        try {
          return await openMovieOrTv(sock, msg, from, item, prefix);
        } catch (err) {
          console.error('[cinesubz2] open', err.message);
          return replyImg(sock, from, msg, '❌ `' + err.message + '`');
        }
      }

      // episodes → quality
      if (state && state.type === 'episodes') {
        const ep = state.episodes[n - 1];
        if (!ep) {
          return replyImg(
            sock,
            from,
            msg,
            '❌ *1*–*' + Math.min(30, state.episodes.length) + '*'
          );
        }
        let downloads = extractDownloads(ep);
        if (!downloads.length) {
          return replyImg(
            sock,
            from,
            msg,
            '🥺 No direct links for this episode'
          );
        }
        const title =
          (state.info.title || state.item.title) +
          ' S' +
          (ep.season || '') +
          'E' +
          (ep.episode || n);

        setPending(from, {
          type: 'quality',
          item: state.item,
          info: state.info,
          downloads: downloads,
          title: title,
          episodes: state.episodes,
        });

        return replyImg(
          sock,
          from,
          msg,
          showQualityList(state.item, title, downloads, from, prefix)
        );
      }

      // quality → document
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
        return sendDocument(
          sock,
          from,
          msg,
          opt,
          state.title || (state.info && state.info.title) || state.item.title
        );
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
          'cinesubz2 <movie/tv name>\n' +
          '│  ' +
          prefix +
          'cinesubz2 <number>\n' +
          '│  ' +
          prefix +
          'cinesubz2f <footer>\n│\n' +
          '│  ✨ Footer › ' +
          getFooter(from) +
          '\n' +
          '╰──────────────────────╯'
      );
    }

    const query = args.join(' ').trim();
    await replyImg(
      sock,
      from,
      msg,
      '🔍💕 *Searching...*\n🔎 ' + clean(query, 40)
    );

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
