const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/anime/animexin/search';
const INFO_API = 'https://api.chamindu.site/api/v1/anime/animexin/infodl';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const PENDING_TTL_MS = 5 * 60 * 1000;
const MAX_ALL_EPS = 25;
const EP_DELAY_MS = 2500;
const CACHE_TTL = 3 * 60 * 1000;

const pending = new Map();
const infoCache = new Map();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 60000,
  headers: { 'User-Agent': UA },
  validateStatus: () => true,
});

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

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

function setPending(from, state) {
  var old = pending.get(from);
  if (old && old.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(function () {
    pending.delete(from);
  }, PENDING_TTL_MS);
  pending.set(from, state);
}

function clean(s, n) {
  n = n || 48;
  var t = String(s || '')
    .replace(/\u2019/g, "'")
    .replace(/â€™/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function fmtSize(bytes) {
  if (!bytes || bytes < 1) return 'unknown';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function pickDirectOptions(full) {
  var data = (full && full.data) || full || {};
  var downloads = Array.isArray(data.downloads) ? data.downloads : [];
  var options = [];
  for (var i = 0; i < downloads.length; i++) {
    var d = downloads[i];
    var url = null;
    if (d.direct && d.url) url = d.url;
    else if (d.url && String(d.url).indexOf('/api/v1/download/proxy') !== -1) url = d.url;
    else if (d.direct_url) url = d.direct_url;
    if (!url) continue;
    options.push({
      label: ((d.quality || 'HD') + ' · ' + (d.language || '') + ' · ' + (d.server || 'File'))
        .replace(/\s+/g, ' ')
        .trim(),
      quality: d.quality || 'HD',
      language: d.language || '',
      server: d.server || 'Direct',
      url: url,
    });
  }
  if (full && full.direct_download) {
    var exists = options.some(function (o) {
      return o.url === full.direct_download;
    });
    if (!exists) {
      options.unshift({
        label: '1080p · Direct · Mediafire',
        quality: '1080p',
        language: '',
        server: 'Mediafire',
        url: full.direct_download,
      });
    }
  }
  var seen = {};
  return options.filter(function (o) {
    if (seen[o.url]) return false;
    seen[o.url] = true;
    return true;
  });
}

function bestOption(options) {
  if (!options || !options.length) return null;
  var scored = options.map(function (o, i) {
    var s = 0;
    if (/mediafire/i.test(o.server) || /mediafire/i.test(o.url)) s += 5;
    if (/1080/i.test(o.quality)) s += 3;
    if (/eng/i.test(o.language) || /eng/i.test(o.label)) s += 2;
    if (/indo/i.test(o.language)) s += 1;
    return { o: o, s: s, i: i };
  });
  scored.sort(function (a, b) {
    return b.s - a.s || a.i - b.i;
  });
  return scored[0].o;
}

async function searchApi(query) {
  var res = await http.get(SEARCH_API, {
    params: { q: query, api_key: API_KEY },
  });
  if (res.status !== 200 || !res.data) throw new Error('Search HTTP ' + res.status);
  if (res.data.status === false) {
    throw new Error(res.data.error || res.data.message || 'Search failed');
  }
  var data = Array.isArray(res.data.data) ? res.data.data : [];
  return data
    .filter(function (r) {
      return r && (r.url || r.link);
    })
    .slice(0, 12)
    .map(function (r, i) {
      return {
        index: i + 1,
        title: r.title || 'Untitled',
        url: r.url || r.link,
        image: r.image || r.poster || null,
        status: r.status || r.type || 'N/A',
        sub: r.sub || '',
      };
    });
}

async function infoApi(pageUrl) {
  var cached = infoCache.get(pageUrl);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;
  var res = await http.get(INFO_API, {
    params: { q: pageUrl, api_key: API_KEY },
  });
  if (res.status !== 200 || !res.data) throw new Error('Info HTTP ' + res.status);
  if (res.data.status === false) {
    throw new Error(res.data.error || res.data.message || 'Info failed');
  }
  infoCache.set(pageUrl, { at: Date.now(), data: res.data });
  return res.data;
}

async function sendOneDoc(opts) {
  var sock = opts.sock;
  var from = opts.from;
  var option = opts.option;
  var title = opts.title;
  var fileName = opts.fileName;

  var safeName = (
    (fileName && String(fileName).replace(/[\/\\:*?"<>|]/g, '').slice(0, 55)) ||
    clean(title, 40).replace(/[\/\\:*?"<>|]/g, '') ||
    'anime'
  ).replace(/\.mp4$/i, '');

  var caption =
    '╭───「 💖 *ANIMEXIN* 」───╮\n│\n' +
    '│  👑 *' +
    clean(title, 42) +
    '*\n' +
    '│  🎥 *' +
    option.quality +
    '* · ' +
    option.server +
    '\n' +
    (option.language ? '│  🗣️ ' + option.language + '\n' : '') +
    '│  📁 Document upload…\n│\n' +
    '╰──────────────────────╯' +
    foot();

  var linkMsg =
    '🔗💕 *Backup link*\n' +
    option.url +
    '\n\n⏳ Large files may take several minutes.\nIf document fails, open the link.' +
    foot();

  await sock.sendMessage(from, { text: caption }).catch(function () {});
  await sock.sendMessage(from, { text: linkMsg }).catch(function () {});

  try {
    await sock.sendMessage(from, {
      document: { url: option.url },
      mimetype: 'video/mp4',
      fileName: safeName + '.mp4',
      caption: '📁💕 *' + option.label + '*\n> ✦ ' + FOOTER + ' ✦',
    });
    return { ok: true };
  } catch (err) {
    console.error('[animexin] document fail:', err.message);
    await sock
      .sendMessage(from, {
        text: '❌ Document failed\n`' + err.message + '`\n\n🔗 ' + option.url + foot(),
      })
      .catch(function () {});
    return { ok: false, reason: err.message };
  }
}

async function showSeries(ctx) {
  var sock = ctx.sock;
  var msg = ctx.msg;
  var from = ctx.from;
  var item = ctx.item;
  var prefix = config.prefix || '.';

  var loading = await sock.sendMessage(from, { text: '🌸✨ *Loading series...*' }, { quoted: msg });

  try {
    var full = await infoApi(item.url);
    var data = full.data || full;
    var title = data.title || item.title;
    var image = data.image || data.poster || item.image;
    var status = data.status || item.status || 'N/A';
    var type = data.type || 'N/A';
    var total = data.total_episodes || (data.episodes || []).length || 'N/A';
    var genres = Array.isArray(data.genres)
      ? Array.from(
          new Set(
            data.genres.filter(function (g) {
              return g && g !== 'Genres';
            })
          )
        )
          .slice(0, 5)
          .join(', ')
      : 'N/A';
    var story = clean(data.synopsis || data.story || '', 160);
    var episodes = Array.isArray(data.episodes) ? data.episodes : [];

    await sock.sendMessage(from, { delete: loading.key }).catch(function () {});

    if (!episodes.length) {
      var options0 = pickDirectOptions(full);
      if (!options0.length) {
        return sock.sendMessage(
          from,
          { text: '🥺 No direct links' + foot() },
          { quoted: msg }
        );
      }
      setPending(from, {
        type: 'quality',
        title: title,
        image: image,
        fileName: full.file_name,
        options: options0,
      });
      var cap0 =
        '╭───「 💗 *DOWNLOAD* 」───╮\n│\n│  👑 ' +
        clean(title, 42) +
        '\n│\n';
      options0.forEach(function (o, i) {
        cap0 += '│  *' + (i + 1) + '.* ' + o.label + '\n';
      });
      cap0 +=
        '\n│  👇 *' + prefix + 'animexin <number>*\n╰──────────────────────╯' + foot();
      if (image) {
        try {
          return await sock.sendMessage(
            from,
            { image: { url: image }, caption: cap0 },
            { quoted: msg }
          );
        } catch (e) {}
      }
      return sock.sendMessage(from, { text: cap0 }, { quoted: msg });
    }

    setPending(from, {
      type: 'episodes',
      title: title,
      image: image,
      episodes: episodes,
      seriesUrl: item.url,
    });

    var show = episodes.slice(0, 25);
    var caption =
      '╭───「 💖🌸 *ANIMEXIN* 」───╮\n│\n' +
      '│  👑 *' +
      clean(title, 42) +
      '*\n' +
      '│  💗 Status › ' +
      status +
      '\n' +
      '│  🎀 Type › ' +
      type +
      '\n' +
      '│  ✨ Genres › ' +
      clean(genres, 36) +
      '\n' +
      '│  📦 Episodes › ' +
      total +
      '\n│\n' +
      (story ? '│  📝 ' + story + '\n│\n' : '') +
      '│  💕 *Episodes (latest first):*\n';

    show.forEach(function (ep, i) {
      caption += '│  *' + (i + 1) + '.* Ep ' + (ep.episode || i + 1);
      if (ep.date) caption += ' · ' + ep.date;
      caption += '\n';
    });

    if (episodes.length > show.length) {
      caption += '│  … +' + (episodes.length - show.length) + ' more\n';
    }

    caption +=
      '\n│  👇 *' +
      prefix +
      'animexin <number>* → one ep\n' +
      '│  🌸 *' +
      prefix +
      'animexin all* → batch (max ' +
      MAX_ALL_EPS +
      ')\n' +
      '╰──────────────────────╯' +
      foot();

    if (image && /^https?:\/\//i.test(image)) {
      try {
        await sock.sendMessage(from, { image: { url: image }, caption: caption }, { quoted: msg });
        return;
      } catch (e) {}
    }
    await sock.sendMessage(from, { text: caption }, { quoted: msg });
  } catch (err) {
    console.error('Animexin series:', err.message);
    await sock
      .sendMessage(from, {
        text: '❌💔 `' + err.message + '`' + foot(),
        edit: loading.key,
      })
      .catch(function () {});
  }
}

async function showQualityForEpisode(ctx) {
  var sock = ctx.sock;
  var msg = ctx.msg;
  var from = ctx.from;
  var ep = ctx.ep;
  var seriesTitle = ctx.seriesTitle;
  var seriesImage = ctx.seriesImage;
  var prefix = config.prefix || '.';

  var loading = await sock.sendMessage(
    from,
    { text: '🌸💗 *Ep ' + (ep.episode || '') + ' loading...*' },
    { quoted: msg }
  );

  try {
    var full = await infoApi(ep.url);
    var data = full.data || full;
    var title =
      data.title || ep.title || (seriesTitle + ' Episode ' + (ep.episode || '')).trim();
    var image = data.image || data.poster || seriesImage;
    var options = pickDirectOptions(full);

    await sock.sendMessage(from, { delete: loading.key }).catch(function () {});

    if (!options.length) {
      return sock.sendMessage(
        from,
        {
          text:
            '🥺 No direct file for Ep ' +
            (ep.episode || '') +
            '\nOnly host pages (Terabox/Mirror)' +
            foot(),
        },
        { quoted: msg }
      );
    }

    var prev = pending.get(from);
    setPending(from, {
      type: 'quality',
      title: title,
      image: image,
      fileName: full.file_name,
      options: options,
      episodes: prev && prev.episodes ? prev.episodes : null,
      seriesTitle: seriesTitle || (prev && prev.title),
      seriesImage: seriesImage || (prev && prev.image),
      seriesUrl: prev && prev.seriesUrl,
    });

    var cap =
      '╭───「 💗 *EP ' +
      (ep.episode || '') +
      '* 」───╮\n│\n' +
      '│  👑 ' +
      clean(title, 42) +
      '\n│\n' +
      '│  📥 *Quality:*\n';
    options.forEach(function (o, i) {
      cap += '│  *' + (i + 1) + '.* ' + o.label + '\n';
    });
    cap +=
      '\n│  👇 *' +
      prefix +
      'animexin <number>*\n' +
      '│  📁 Document stream\n' +
      '╰──────────────────────╯' +
      foot();

    if (image) {
      try {
        await sock.sendMessage(from, { image: { url: image }, caption: cap }, { quoted: msg });
        return;
      } catch (e) {}
    }
    await sock.sendMessage(from, { text: cap }, { quoted: msg });
  } catch (err) {
    console.error('Animexin ep:', err.message);
    await sock
      .sendMessage(from, {
        text: '❌💔 `' + err.message + '`' + foot(),
        edit: loading.key,
      })
      .catch(function () {});
  }
}

async function downloadAllEpisodes(ctx) {
  var sock = ctx.sock;
  var msg = ctx.msg;
  var from = ctx.from;
  var state = ctx.state;
  var episodes = (state.episodes || []).slice(0, MAX_ALL_EPS);

  if (!episodes.length) {
    return sock.sendMessage(from, { text: '🥺 No episodes' + foot() }, { quoted: msg });
  }

  await sock.sendMessage(
    from,
    {
      text:
        '🌸💕 *Batch started*\n📦 ' +
        episodes.length +
        ' episode(s)\n⏳ Please wait' +
        foot(),
    },
    { quoted: msg }
  );

  var ok = 0;
  var fail = 0;

  for (var i = 0; i < episodes.length; i++) {
    var ep = episodes[i];
    try {
      await sock.sendMessage(from, {
        text: '💗 *' + (i + 1) + '/' + episodes.length + '* · Ep ' + (ep.episode || i + 1) + '…',
      });

      var full = await infoApi(ep.url);
      var data = full.data || full;
      var title =
        data.title ||
        ep.title ||
        (state.title + ' Episode ' + (ep.episode || i + 1)).trim();
      var options = pickDirectOptions(full);
      var option = bestOption(options);

      if (!option) {
        fail++;
        await sock.sendMessage(from, {
          text: '⚠️ Ep ' + (ep.episode || i + 1) + ' — no direct link',
        });
        continue;
      }

      await sendOneDoc({
        sock: sock,
        from: from,
        option: option,
        title: title,
        fileName: full.file_name,
      });
      ok++;
      if (i < episodes.length - 1) await sleep(EP_DELAY_MS);
    } catch (err) {
      fail++;
      console.error('Animexin all fail:', err.message);
      await sock
        .sendMessage(from, {
          text: '❌ Ep ' + (ep.episode || i + 1) + ': ' + err.message,
        })
        .catch(function () {});
      await sleep(1000);
    }
  }

  await sock.sendMessage(
    from,
    {
      text:
        '╭───「 💖 *DONE* 」───╮\n│\n│  ✅ Sent: *' +
        ok +
        '*\n│  ⚠️ Fail: *' +
        fail +
        '*\n│\n╰──────────────────────╯' +
        foot(),
    },
    { quoted: msg }
  );
}

module.exports = {
  name: 'animexin',
  aliases: ['axin', 'animein', 'animex'],
  description: 'Search & download Animexin anime',
  category: 'download',

  async execute(ctx) {
    var sock = ctx.sock;
    var msg = ctx.msg;
    var from = ctx.from;
    var args = ctx.args || [];
    var prefix = config.prefix || '.';
    var state = pending.get(from);

    try {
      // .animexin all
      if (args.length === 1 && /^all$/i.test(args[0])) {
        if (!state || state.type !== 'episodes' || !state.episodes || !state.episodes.length) {
          return sock.sendMessage(
            from,
            {
              text:
                '🥺 First select a series\n💡 `' +
                prefix +
                'animexin <name>` → number → all' +
                foot(),
            },
            { quoted: msg }
          );
        }
        return downloadAllEpisodes({ sock: sock, msg: msg, from: from, state: state });
      }

      // number
      if (args.length === 1 && /^\d+$/.test(args[0])) {
        var n = parseInt(args[0], 10);

        if (state && state.type === 'search') {
          var item = state.results[n - 1];
          if (!item) {
            return sock.sendMessage(
              from,
              { text: '❌💕 *1*–*' + state.results.length + '*' + foot() },
              { quoted: msg }
            );
          }
          return showSeries({ sock: sock, msg: msg, from: from, item: item });
        }

        if (state && state.type === 'episodes') {
          var ep = state.episodes[n - 1];
          if (!ep) {
            return sock.sendMessage(
              from,
              {
                text:
                  '❌💕 *1*–*' +
                  Math.min(25, state.episodes.length) +
                  '*' +
                  foot(),
              },
              { quoted: msg }
            );
          }
          setPending(from, {
            type: 'episodes',
            title: state.title,
            image: state.image,
            episodes: state.episodes,
            seriesUrl: state.seriesUrl,
          });
          return showQualityForEpisode({
            sock: sock,
            msg: msg,
            from: from,
            ep: ep,
            seriesTitle: state.title,
            seriesImage: state.image,
          });
        }

        if (state && state.type === 'quality') {
          var opt = state.options[n - 1];
          if (!opt) {
            return sock.sendMessage(
              from,
              { text: '❌💕 *1*–*' + state.options.length + '*' + foot() },
              { quoted: msg }
            );
          }
          var loading = await sock.sendMessage(
            from,
            { text: '⬆️🌸 *Sending...*' },
            { quoted: msg }
          );
          try {
            await sock.sendMessage(from, { delete: loading.key }).catch(function () {});
            await sendOneDoc({
              sock: sock,
              from: from,
              option: opt,
              title: state.title,
              fileName: state.fileName,
            });
            if (state.episodes) {
              setPending(from, {
                type: 'episodes',
                title: state.seriesTitle || state.title,
                image: state.seriesImage || state.image,
                episodes: state.episodes,
                seriesUrl: state.seriesUrl,
              });
            }
          } catch (err) {
            await sock
              .sendMessage(from, {
                text: '❌💔 `' + err.message + '`\n🔗 ' + opt.url + foot(),
                edit: loading.key,
              })
              .catch(function () {});
          }
          return;
        }

        return sock.sendMessage(
          from,
          { text: '🥺 No session\n💡 `' + prefix + 'animexin <name>`' + foot() },
          { quoted: msg }
        );
      }

      if (!args.length) {
        return sock.sendMessage(
          from,
          {
            text:
              '╭───「 💖🌸 *ANIMEXIN* 」───╮\n│\n' +
              '│  ' +
              prefix +
              'animexin <anime name>\n' +
              '│  ' +
              prefix +
              'animexin <number>\n' +
              '│  ' +
              prefix +
              'animexin all\n│\n' +
              '│  📌 Example:\n' +
              '│  ' +
              prefix +
              'animexin Record Of Mortal\n' +
              '│  ' +
              prefix +
              'animexin 1\n│\n' +
              '╰──────────────────────╯' +
              foot(),
          },
          { quoted: msg }
        );
      }

      var query = args.join(' ').trim();
      var loading2 = await sock.sendMessage(
        from,
        { text: '🔍💕 *Searching...*' },
        { quoted: msg }
      );

      try {
        var results = await searchApi(query);
        await sock.sendMessage(from, { delete: loading2.key }).catch(function () {});

        if (!results.length) {
          return sock.sendMessage(
            from,
            { text: '🥺 No results' + foot() },
            { quoted: msg }
          );
        }

        setPending(from, { type: 'search', results: results });

        var list =
          '╭───「 💖🔍 *SEARCH* 」───╮\n│\n' +
          '│  🔎 *' +
          clean(query, 36) +
          '*\n' +
          '│  📦 ' +
          results.length +
          ' results\n│\n';

        results.forEach(function (r) {
          list += '│  *' + r.index + '.* ' + clean(r.title, 40) + '\n';
          list += '│      💗 ' + r.status + '\n';
        });

        list +=
          '\n│  👇 *' +
          prefix +
          'animexin <number>*\n╰──────────────────────╯' +
          foot();

        if (results[0].image) {
          try {
            await sock.sendMessage(
              from,
              { image: { url: results[0].image }, caption: list },
              { quoted: msg }
            );
            return;
          } catch (e) {}
        }
        await sock.sendMessage(from, { text: list }, { quoted: msg });
      } catch (err) {
        console.error('Animexin search:', err.message);
        await sock
          .sendMessage(from, {
            text: '❌💔 `' + err.message + '`' + foot(),
            edit: loading2.key,
          })
          .catch(function () {});
      }
    } catch (err) {
      console.error('Animexin execute:', err);
      await sock
        .sendMessage(from, { text: '❌💔 `' + (err.message || err) + '`' + foot() }, { quoted: msg })
        .catch(function () {});
    }
  },
};
