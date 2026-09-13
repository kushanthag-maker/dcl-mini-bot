const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/anime/animexin/search';
const INFO_API = 'https://api.chamindu.site/api/v1/anime/animexin/infodl';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const PENDING_TTL_MS = 5 * 60 * 1000;
const CACHE_TTL = 3 * 60 * 1000;

const pending = new Map();
const infoCache = new Map();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
  if (!bytes || bytes < 1) return '?';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + 'MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + 'GB';
}

/** Build FULL quality list from API (direct + page hosts) */
function buildQualityList(full) {
  var data = (full && full.data) || full || {};
  var downloads = Array.isArray(data.downloads) ? data.downloads : [];
  var list = [];
  var i;

  for (i = 0; i < downloads.length; i++) {
    var d = downloads[i];
    var raw = d.url || d.link || d.direct_url || d.original_url || null;
    if (!raw) continue;
    var isDirect =
      !!d.direct ||
      String(raw).indexOf('/api/v1/download/proxy') !== -1 ||
      /\.mp4(\?|$)/i.test(raw);
    list.push({
      label:
        (d.quality || 'HD') +
        ' · ' +
        (d.language || '') +
        ' · ' +
        (d.server || d.hoster || 'Host'),
      quality: d.quality || 'HD',
      language: d.language || '',
      server: d.server || d.hoster || 'Host',
      url: raw,
      direct: isDirect,
    });
  }

  if (full && full.direct_download) {
    var has = list.some(function (x) {
      return x.url === full.direct_download;
    });
    if (!has) {
      list.unshift({
        label: '1080p · Direct · Mediafire Proxy',
        quality: '1080p',
        language: '',
        server: 'Mediafire',
        url: full.direct_download,
        direct: true,
      });
    }
  }

  // de-dupe by url
  var seen = {};
  return list
    .map(function (x) {
      return {
        label: String(x.label).replace(/\s+/g, ' ').trim(),
        quality: x.quality,
        language: x.language,
        server: x.server,
        url: x.url,
        direct: !!x.direct,
      };
    })
    .filter(function (x) {
      if (seen[x.url]) return false;
      seen[x.url] = true;
      return true;
    });
}

async function searchApi(query) {
  var res = await axios.get(SEARCH_API, {
    params: { q: query, api_key: API_KEY },
    timeout: 45000,
    headers: { 'User-Agent': UA },
    validateStatus: function () {
      return true;
    },
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
      };
    });
}

async function infoApi(pageUrl) {
  var cached = infoCache.get(pageUrl);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;
  var res = await axios.get(INFO_API, {
    params: { q: pageUrl, api_key: API_KEY },
    timeout: 90000,
    headers: { 'User-Agent': UA },
    validateStatus: function () {
      return true;
    },
  });
  if (res.status !== 200 || !res.data) throw new Error('Info HTTP ' + res.status);
  if (res.data.status === false) {
    throw new Error(res.data.error || res.data.message || 'Info failed');
  }
  infoCache.set(pageUrl, { at: Date.now(), data: res.data });
  return res.data;
}

async function headLen(url) {
  try {
    var res = await axios.head(url, {
      timeout: 25000,
      maxRedirects: 5,
      headers: { 'User-Agent': UA, Accept: '*/*' },
      validateStatus: function () {
        return true;
      },
    });
    return parseInt(res.headers['content-length'] || '0', 10) || 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Stream URL → disk (not RAM), then Baileys document from file stream.
 * Note: Baileys encrypt still needs memory ≈ file size once.
 * We stream download to /tmp to avoid double-buffer during download.
 */
async function streamToTempFile(url) {
  var tmp = path.join(
    '/tmp',
    'animexin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.mp4'
  );
  var res = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
    timeout: 0,
    maxRedirects: 5,
    headers: { 'User-Agent': UA, Accept: '*/*' },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: function (s) {
      return s >= 200 && s < 400;
    },
  });
  await pipeline(res.data, fs.createWriteStream(tmp));
  var st = fs.statSync(tmp);
  return { tmp: tmp, size: st.size };
}

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {}
}

async function sendDocumentStreaming(opts) {
  var sock = opts.sock;
  var from = opts.from;
  var option = opts.option;
  var title = opts.title;
  var fileName = opts.fileName;

  var safeName = (
    (fileName && String(fileName).replace(/[\/\\:*?"<>|]/g, '').slice(0, 50)) ||
    clean(title, 36).replace(/[\/\\:*?"<>|]/g, '') ||
    'anime'
  ).replace(/\.mp4$/i, '');

  if (!option.direct) {
    await sock.sendMessage(from, {
      text:
        '╭───「 💖 *LINK* 」───╮\n│\n' +
        '│  👑 ' +
        clean(title, 42) +
        '\n' +
        '│  🎥 ' +
        option.label +
        '\n│\n' +
        '│  🔗 ' +
        option.url +
        '\n│\n' +
        '│  ⚠️ This host is not a direct MP4.\n' +
        '│  Open link in browser.\n' +
        '╰──────────────────────╯' +
        foot(),
    });
    return { ok: true, mode: 'link' };
  }

  var sizeHint = await headLen(option.url);
  await sock.sendMessage(from, {
    text:
      '⬆️🌸 *Streaming episode to document...*\n' +
      '👑 ' +
      clean(title, 40) +
      '\n🎥 ' +
      option.label +
      (sizeHint ? '\n📦 ~' + fmtSize(sizeHint) : '') +
      '\n⏳ Please wait (download→upload)' +
      foot(),
  });

  var tmp = null;
  try {
    // 1) disk stream (low RAM during download)
    var dl = await streamToTempFile(option.url);
    tmp = dl.tmp;

    await sock.sendMessage(from, {
      text: '📤💕 Uploading *' + fmtSize(dl.size) + '* document…',
    });

    // 2) Baileys send from file stream (cinesubz-style document)
    await sock.sendMessage(from, {
      document: { stream: fs.createReadStream(tmp) },
      mimetype: 'video/mp4',
      fileName: safeName + '.mp4',
      caption:
        '📁💕 *' +
        option.label +
        '*\n👑 ' +
        clean(title, 40) +
        '\n📦 ' +
        fmtSize(dl.size) +
        '\n> ✦ ' +
        FOOTER +
        ' ✦',
    });

    safeUnlink(tmp);
    tmp = null;
    return { ok: true, mode: 'document', size: dl.size };
  } catch (err) {
    safeUnlink(tmp);
    console.error('[animexin] stream/doc fail:', err.message);

    // Fallback: try direct URL document (Baileys fetches)
    try {
      await sock.sendMessage(from, {
        document: { url: option.url },
        mimetype: 'video/mp4',
        fileName: safeName + '.mp4',
        caption: '📁💕 *' + option.label + '*\n> ✦ ' + FOOTER + ' ✦',
      });
      return { ok: true, mode: 'document-url' };
    } catch (err2) {
      console.error('[animexin] url doc fail:', err2.message);
      await sock.sendMessage(from, {
        text:
          '❌ Document failed (`' +
          (err2.message || err.message) +
          '`)\n\n' +
          '🔗 Backup link:\n' +
          option.url +
          '\n\n' +
          '⚠️ Server RAM may be too small for this file (Heroku R14).' +
          foot(),
      });
      return { ok: false, reason: err2.message || err.message };
    }
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
    var episodes = Array.isArray(data.episodes) ? data.episodes : [];

    await sock.sendMessage(from, { delete: loading.key }).catch(function () {});

    if (!episodes.length) {
      var options0 = buildQualityList(full);
      if (!options0.length) {
        return sock.sendMessage(from, { text: '🥺 No download options' + foot() }, { quoted: msg });
      }
      setPending(from, {
        type: 'quality',
        title: title,
        image: image,
        fileName: full.file_name,
        options: options0,
      });
      return sendQualityList(sock, msg, from, title, image, options0, prefix, '');
    }

    setPending(from, {
      type: 'episodes',
      title: title,
      image: image,
      episodes: episodes,
      seriesUrl: item.url,
    });

    var show = episodes.slice(0, 30);
    var caption =
      '╭───「 💖🌸 *ANIMEXIN* 」───╮\n│\n' +
      '│  👑 *' +
      clean(title, 42) +
      '*\n' +
      '│  💗 ' +
      status +
      ' · ' +
      type +
      '\n' +
      '│  📦 Episodes › ' +
      total +
      '\n│\n' +
      '│  💕 *Pick ONE episode:*\n';

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
      'animexin <number>*\n' +
      '│  🌸 Ep by ep → then quality → document\n' +
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

async function sendQualityList(sock, msg, from, title, image, options, prefix, epTag) {
  var cap =
    '╭───「 💗 *QUALITY' +
    (epTag ? ' · EP ' + epTag : '') +
    '* 」───╮\n│\n' +
    '│  👑 ' +
    clean(title, 42) +
    '\n│\n' +
    '│  📥 *All links from API:*\n';
  options.forEach(function (o, i) {
    cap +=
      '│  *' +
      (i + 1) +
      '.* ' +
      o.label +
      (o.direct ? ' ✅' : ' 🔗') +
      '\n';
  });
  cap +=
    '\n│  ✅ = direct → WhatsApp document\n' +
    '│  🔗 = page link only\n' +
    '│  👇 *' +
    prefix +
    'animexin <number>*\n' +
    '╰──────────────────────╯' +
    foot();

  if (image && /^https?:\/\//i.test(image)) {
    try {
      await sock.sendMessage(from, { image: { url: image }, caption: cap }, { quoted: msg });
      return;
    } catch (e) {}
  }
  await sock.sendMessage(from, { text: cap }, { quoted: msg });
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
    { text: '🌸💗 *Ep ' + (ep.episode || '') + ' qualities...*' },
    { quoted: msg }
  );

  try {
    var full = await infoApi(ep.url);
    var data = full.data || full;
    var title =
      data.title || ep.title || (seriesTitle + ' Episode ' + (ep.episode || '')).trim();
    var image = data.image || data.poster || seriesImage;
    var options = buildQualityList(full);

    await sock.sendMessage(from, { delete: loading.key }).catch(function () {});

    if (!options.length) {
      return sock.sendMessage(
        from,
        { text: '🥺 No qualities for Ep ' + (ep.episode || '') + foot() },
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

    await sendQualityList(
      sock,
      msg,
      from,
      title,
      image,
      options,
      prefix,
      String(ep.episode || '')
    );
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

module.exports = {
  name: 'animexin',
  aliases: ['axin', 'animein', 'animex'],
  description: 'Animexin episode documents (stream to disk then WA)',
  category: 'download',

  async execute(ctx) {
    var sock = ctx.sock;
    var msg = ctx.msg;
    var from = ctx.from;
    var args = ctx.args || [];
    var prefix = config.prefix || '.';
    var state = pending.get(from);

    try {
      if (args.length === 1 && /^all$/i.test(args[0])) {
        return sock.sendMessage(
          from,
          {
            text:
              '⚠️ Use *one episode at a time*\n`' +
              prefix +
              'animexin <ep number>`' +
              foot(),
          },
          { quoted: msg }
        );
      }

      if (args.length === 1 && /^\d+$/.test(args[0])) {
        var n = parseInt(args[0], 10);

        if (state && state.type === 'search') {
          var item = state.results[n - 1];
          if (!item) {
            return sock.sendMessage(
              from,
              { text: '❌ *1*–*' + state.results.length + '*' + foot() },
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
                text: '❌ *1*–*' + Math.min(30, state.episodes.length) + '*' + foot(),
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
              { text: '❌ *1*–*' + state.options.length + '*' + foot() },
              { quoted: msg }
            );
          }
          var result = await sendDocumentStreaming({
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
            await sock
              .sendMessage(from, {
                text:
                  (result && result.ok ? '✅ ' : '⚠️ ') +
                  'Next ep? `' +
                  prefix +
                  'animexin <number>`' +
                  foot(),
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
              'animexin <name>\n' +
              '│  ' +
              prefix +
              'animexin <number>\n│\n' +
              '│  1 search → 2 series → 3 episode\n' +
              '│  4 quality (all API options)\n' +
              '│  5 document stream\n│\n' +
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
          return sock.sendMessage(from, { text: '🥺 No results' + foot() }, { quoted: msg });
        }
        setPending(from, { type: 'search', results: results });
        var list =
          '╭───「 💖🔍 *SEARCH* 」───╮\n│\n' +
          '│  🔎 *' +
          clean(query, 36) +
          '*\n' +
          '│  📦 ' +
          results.length +
          '\n│\n';
        results.forEach(function (r) {
          list += '│  *' + r.index + '.* ' + clean(r.title, 40) + '\n';
          list += '│      💗 ' + r.status + '\n';
        });
        list +=
          '\n│  👇 *' + prefix + 'animexin <number>*\n╰──────────────────────╯' + foot();
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
