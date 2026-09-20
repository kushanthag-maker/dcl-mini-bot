const axios = require('axios');
const config = require('../../config');

const SEARCH_API = 'https://qqflpixiejlcthtdpwlb.supabase.co/functions/v1/anime/search';
const SERIES_API = 'https://qqflpixiejlcthtdpwlb.supabase.co/functions/v1/anime/series';
const EPISODE_API = 'https://qqflpixiejlcthtdpwlb.supabase.co/functions/v1/anime/episode';
const THUMB = 'https://files.catbox.moe/t3m6ks.jpg';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const PENDING_TTL = 8 * 60 * 1000;
const MAX_LIST = 25;

const pending = new Map();

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

function setPending(from, state) {
  const old = pending.get(from);
  if (old && old.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(function () {
    pending.delete(from);
  }, PENDING_TTL);
  pending.set(from, state);
}

function clean(s, n) {
  n = n || 50;
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function slugFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/series\/([^\/]+)\/?/i);
  return m ? m[1] : null;
}

async function replyImg(sock, from, msg, text) {
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

async function searchAnime(q) {
  const res = await axios.get(SEARCH_API, {
    params: { q: q },
    timeout: 45000,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    validateStatus: function () {
      return true;
    },
  });
  if (res.status !== 200 || !res.data) throw new Error('Search HTTP ' + res.status);
  const list = Array.isArray(res.data.results) ? res.data.results : [];
  return list.slice(0, 12).map(function (r, i) {
    const slug = slugFromUrl(r.url) || '';
    return {
      index: i + 1,
      title: r.title || 'Untitled',
      url: r.url,
      slug: slug,
      image: r.image || null,
      status: r.status || r.episode || '',
      type: r.type || '',
      sub_type: r.sub_type || '',
    };
  });
}

async function seriesAnime(slug) {
  const res = await axios.get(SERIES_API, {
    params: { slug: slug },
    timeout: 60000,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    validateStatus: function () {
      return true;
    },
  });
  if (res.status !== 200 || !res.data) throw new Error('Series HTTP ' + res.status);
  return res.data;
}

async function episodeAnime(slug) {
  const res = await axios.get(EPISODE_API, {
    params: { slug: slug },
    timeout: 60000,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    validateStatus: function () {
      return true;
    },
  });
  if (res.status !== 200 || !res.data) throw new Error('Episode HTTP ' + res.status);
  return res.data;
}

/** Try resolve Gofile → direct URL (guest). May fail if premium-only. */
async function resolveGofile(pageUrl) {
  const idMatch = String(pageUrl).match(/gofile\.io\/d\/([a-zA-Z0-9]+)/i);
  if (!idMatch) return null;
  const cid = idMatch[1];
  try {
    const acc = await axios.post(
      'https://api.gofile.io/accounts',
      {},
      {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        validateStatus: function () {
          return true;
        },
      }
    );
    const token = acc.data && acc.data.data && acc.data.data.token;
    if (!token) return null;

    const cont = await axios.get('https://api.gofile.io/contents/' + cid, {
      params: { wt: '4fd6sg89d7s6', cache: true },
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
      },
      validateStatus: function () {
        return true;
      },
    });

    if (cont.status !== 200 || !cont.data || cont.data.status !== 'ok') {
      return null;
    }
    const data = cont.data.data || {};
    if (data.type === 'file' && (data.directLink || data.link)) {
      return data.directLink || data.link;
    }
    const children = data.children || {};
    for (const k of Object.keys(children)) {
      const f = children[k];
      if (f && (f.directLink || f.link)) return f.directLink || f.link;
    }
  } catch (e) {
    console.error('[animep] gofile', e.message);
  }
  return null;
}

async function sendEpisodeDoc(sock, from, msg, epData, seriesTitle) {
  const title = epData.title || seriesTitle || 'Episode';
  const gofiles = Array.isArray(epData.download_links)
    ? epData.download_links
    : [];
  const streams = Array.isArray(epData.stream_servers)
    ? epData.stream_servers
    : [];

  await replyImg(
    sock,
    from,
    msg,
    '⏳💕 *Fetching episode...*\n🎬 ' + clean(title, 40)
  );

  let direct = null;
  for (let i = 0; i < gofiles.length; i++) {
    direct = await resolveGofile(gofiles[i]);
    if (direct) break;
  }

  if (direct) {
    await replyImg(
      sock,
      from,
      msg,
      '⬆️ *Streaming document (zero-RAM url)*\n📁 ' + clean(title, 36)
    );
    try {
      await sock.sendMessage(
        from,
        {
          document: { url: direct },
          mimetype: 'video/mp4',
          fileName:
            clean(title, 40).replace(/[\/\\:*?"<>|]/g, '_') + '.mp4',
          caption:
            '📁 *' +
            clean(title, 50) +
            '*\n🌸 AnimeP\n> ✦ ' +
            FOOTER +
            ' ✦',
        },
        { quoted: msg }
      );
      return;
    } catch (err) {
      console.error('[animep] doc', err.message);
      await replyImg(
        sock,
        from,
        msg,
        '⚠️ Buffer/upload fail\n`' + err.message + '`\nSending links…'
      );
    }
  }

  // Fallback: links (Gofile often needs browser / premium API)
  let text =
    '╭───「 💖🎬 *EPISODE* 」───╮\n│\n' +
    '│  👑 *' +
    clean(title, 40) +
    '*\n│\n';

  if (gofiles.length) {
    text += '│  📦 *Gofile download:*\n';
    gofiles.forEach(function (u, i) {
      text += '│  ' + (i + 1) + '. ' + u + '\n';
    });
    text +=
      '│\n│  💡 Open Gofile in browser → Download\n│  (API premium block වෙන්න පුළුවන්)\n';
  }

  if (streams.length) {
    text += '│\n│  📺 *Stream servers:*\n';
    streams.slice(0, 3).forEach(function (s, i) {
      text += '│  ' + (i + 1) + '. ' + (s.stream_url || s) + '\n';
    });
  }

  if (epData.stream_url) {
    text += '│\n│  ▶️ Main stream:\n│  ' + epData.stream_url + '\n';
  }

  text += '│\n╰──────────────────────╯';
  await replyImg(sock, from, msg, text);
}

async function openSeries(sock, from, msg, item, prefix) {
  const slug = item.slug;
  if (!slug) {
    return replyImg(sock, from, msg, '❌ No series slug');
  }

  await replyImg(sock, from, msg, '🌸✨ *Loading series...*\n📺 ' + clean(item.title, 36));

  const series = await seriesAnime(slug);
  const episodes = Array.isArray(series.episodes) ? series.episodes : [];
  if (!episodes.length) {
    return replyImg(sock, from, msg, '🥺 No episodes in API list');
  }

  // newest first already
  setPending(from, {
    type: 'episodes',
    item: item,
    series: series,
    episodes: episodes,
    slug: slug,
  });

  const show = episodes.slice(0, MAX_LIST);
  let text =
    '╭───「 💖📺 *SERIES* 」───╮\n│\n' +
    '│  👑 *' +
    clean(series.title || item.title, 40) +
    '*\n' +
    '│  📦 Listed › *' +
    episodes.length +
    '* eps\n' +
    '│  📊 Status › ' +
    (series.status || item.status || 'N/A') +
    '\n│\n' +
    '│  💕 *Pick episode number:*\n';

  show.forEach(function (ep, i) {
    text +=
      '│  *' +
      (i + 1) +
      '.* EP ' +
      (ep.episode != null ? ep.episode : '?') +
      '\n';
  });
  if (episodes.length > show.length) {
    text += '│  … +' + (episodes.length - show.length) + ' more in API\n';
  }

  text +=
    '\n│  👇 *' +
    prefix +
    'animep <list#>*\n' +
    '│  👇 *' +
    prefix +
    'animep ep <episodeNo>*\n' +
    '│  Example: `' +
    prefix +
    'animep ep 1178`\n' +
    '╰──────────────────────╯';

  const poster = series.image || item.image;
  if (poster && /^https?:\/\//i.test(poster)) {
    try {
      await sock.sendMessage(
        from,
        { image: { url: poster }, caption: text + foot() },
        { quoted: msg }
      );
      return;
    } catch (_) {}
  }
  return replyImg(sock, from, msg, text);
}

module.exports = {
  name: 'animep',
  aliases: ['animepahe', 'aphe', 'anip'],
  description: 'AnimePahe search → episodes → Gofile/document',
  category: 'download',

  async execute(ctx) {
    const sock = ctx.sock;
    const msg = ctx.msg;
    const from = ctx.from;
    const args = ctx.args || [];
    const prefix = config.prefix || '.';
    const state = pending.get(from);

    // .animep ep 1178
    if (args.length >= 2 && /^ep(isode)?$/i.test(args[0])) {
      const epNo = parseInt(args[1], 10);
      if (!state || !state.episodes) {
        return replyImg(
          sock,
          from,
          msg,
          '🥺 First search a series\n💡 ' + prefix + 'animep one piece'
        );
      }
      const found = state.episodes.find(function (e) {
        return Number(e.episode) === epNo;
      });
      if (!found) {
        return replyImg(
          sock,
          from,
          msg,
          '❌ EP ' + epNo + ' not in listed set\nTry list number instead'
        );
      }
      try {
        const epData = await episodeAnime(found.label || found.slug);
        return await sendEpisodeDoc(
          sock,
          from,
          msg,
          epData,
          state.series && state.series.title
        );
      } catch (err) {
        return replyImg(sock, from, msg, '❌ `' + err.message + '`');
      }
    }

    // number select
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const n = parseInt(args[0], 10);

      if (state && state.type === 'search') {
        const item = state.results[n - 1];
        if (!item) {
          return replyImg(sock, from, msg, '❌ *1*–*' + state.results.length + '*');
        }
        try {
          return await openSeries(sock, from, msg, item, prefix);
        } catch (err) {
          return replyImg(sock, from, msg, '❌ `' + err.message + '`');
        }
      }

      if (state && state.type === 'episodes') {
        const ep = state.episodes[n - 1];
        if (!ep) {
          return replyImg(
            sock,
            from,
            msg,
            '❌ *1*–*' + Math.min(MAX_LIST, state.episodes.length) + '*'
          );
        }
        try {
          const epData = await episodeAnime(ep.label);
          return await sendEpisodeDoc(
            sock,
            from,
            msg,
            epData,
            state.series && state.series.title
          );
        } catch (err) {
          return replyImg(sock, from, msg, '❌ `' + err.message + '`');
        }
      }

      return replyImg(
        sock,
        from,
        msg,
        '🥺 No session\n💡 ' + prefix + 'animep <name>'
      );
    }

    if (!args.length) {
      return replyImg(
        sock,
        from,
        msg,
        '╭───「 💖📺 *ANIMEP* 」───╮\n│\n' +
          '│  📌 Search:\n' +
          '│  ' +
          prefix +
          'animep one piece\n│\n' +
          '│  📌 Select series:\n' +
          '│  ' +
          prefix +
          'animep 1\n│\n' +
          '│  📌 Episode:\n' +
          '│  ' +
          prefix +
          'animep 1\n' +
          '│  ' +
          prefix +
          'animep ep 1178\n│\n' +
          '│  📁 Gofile → document when possible\n' +
          '╰──────────────────────╯'
      );
    }

    const query = args.join(' ').trim();
    await replyImg(sock, from, msg, '🔍💕 *Searching anime...*\n🔎 ' + clean(query, 40));

    try {
      const results = await searchAnime(query);
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
        list += '│  *' + r.index + '.* ' + clean(r.title, 36) + '\n';
        list +=
          '│      ' +
          (r.status || '-') +
          ' · ' +
          (r.sub_type || '') +
          '\n';
      });
      list +=
        '\n│  👇 *' +
        prefix +
        'animep <number>*\n╰──────────────────────╯';
      await replyImg(sock, from, msg, list);
    } catch (err) {
      console.error('[animep] search', err.message);
      await replyImg(sock, from, msg, '❌ `' + err.message + '`');
    }
  },
};
