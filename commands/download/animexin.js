const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/anime/animexin/search';
const INFO_API = 'https://api.chamindu.site/api/v1/anime/animexin/infodl';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const PENDING_TTL_MS = 5 * 60 * 1000;
const MAX_ALL_EPS = 25; // safety cap per .animexin all
const EP_DELAY_MS = 2500;

const pending = new Map();
const infoCache = new Map(); // url -> { at, data }
const CACHE_TTL = 3 * 60 * 1000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 55000,
  headers: { 'User-Agent': UA },
  validateStatus: () => true,
});

function foot() {
  return (
    `\n🌸💕 *Pair:* ${SITE}\n` +
    `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setPending(from, state) {
  const old = pending.get(from);
  if (old?.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
  pending.set(from, state);
}

function clean(s, n = 48) {
  const t = String(s || '')
    .replace(/\u2019/g, "'")
    .replace(/â€™/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function pickDirectOptions(full) {
  const data = full?.data || full || {};
  const downloads = Array.isArray(data.downloads) ? data.downloads : [];
  const options = [];

  for (const d of downloads) {
    const url =
      (d.direct && d.url) ||
      (d.url && String(d.url).includes('/api/v1/download/proxy') ? d.url : null) ||
      d.direct_url ||
      null;
    if (!url) continue;
    options.push({
      label: `${d.quality || 'HD'} · ${d.language || ''} · ${d.server || 'File'}`.replace(
        /\s+/g,
        ' '
      ).trim(),
      quality: d.quality || 'HD',
      language: d.language || '',
      server: d.server || 'Direct',
      url,
    });
  }

  if (full?.direct_download && !options.some((o) => o.url === full.direct_download)) {
    options.unshift({
      label: '1080p · Direct · Mediafire',
      quality: '1080p',
      language: '',
      server: 'Mediafire',
      url: full.direct_download,
    });
  }

  // unique by url
  const seen = new Set();
  return options.filter((o) => {
    if (seen.has(o.url)) return false;
    seen.add(o.url);
    return true;
  });
}

function bestOption(options) {
  if (!options?.length) return null;
  // prefer mediafire / eng / 1080
  const scored = options.map((o, i) => {
    let s = 0;
    if (/mediafire/i.test(o.server) || /mediafire/i.test(o.url)) s += 5;
    if (/1080/i.test(o.quality)) s += 3;
    if (/eng/i.test(o.language) || /eng/i.test(o.label)) s += 2;
    if (/indo/i.test(o.language)) s += 1;
    return { o, s, i };
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored[0].o;
}

async function searchApi(query) {
  const res = await http.get(SEARCH_API, {
    params: { q: query, api_key: API_KEY },
  });
  if (res.status !== 200 || !res.data) throw new Error(`Search HTTP ${res.status}`);
  if (res.data.status === false) {
    throw new Error(res.data.error || res.data.message || 'Search failed');
  }
  const data = Array.isArray(res.data.data) ? res.data.data : [];
  return data
    .filter((r) => r && (r.url || r.link))
    .slice(0, 12)
    .map((r, i) => ({
      index: i + 1,
      title: r.title || 'Untitled',
      url: r.url || r.link,
      image: r.image || r.poster || null,
      status: r.status || r.type || 'N/A',
      sub: r.sub || '',
    }));
}

async function infoApi(pageUrl) {
  const cached = infoCache.get(pageUrl);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return cached.data;
  }
  const res = await http.get(INFO_API, {
    params: { q: pageUrl, api_key: API_KEY },
  });
  if (res.status !== 200 || !res.data) throw new Error(`Info HTTP ${res.status}`);
  if (res.data.status === false) {
    throw new Error(res.data.error || res.data.message || 'Info failed');
  }
  infoCache.set(pageUrl, { at: Date.now(), data: res.data });
  return res.data;
}

async function sendOneDoc({ sock, msg, from, option, title, image, fileName }) {
  const safeName = (
    (fileName && String(fileName).replace(/[\/\\:*?"<>|]/g, '').slice(0, 55)) ||
    clean(title, 40).replace(/[\/\\:*?"<>|]/g, '') ||
    'anime'
  ).replace(/\.mp4$/i, '');

  const caption =
    `╭───「 💖 *ANIMEXIN* 」───╮\n│\n` +
    `│  👑 *${clean(title, 42)}*\n` +
    `│  🎥 *${option.quality}* · ${option.server}\n` +
    (option.language ? `│  🗣️ ${option.language}\n` : '') +
    `│  📁 Document\n│\n` +
    `╰──────────────────────╯` +
    foot();

  if (image && /^https?:\/\//i.test(image)) {
    await sock
      .sendMessage(from, { image: { url: image }, caption }, { quoted: msg })
      .catch(() => sock.sendMessage(from, { text: caption }, { quoted: msg }));
  } else {
    await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
  }

  await sock.sendMessage(
    from,
    {
      document: { url: option.url },
      mimetype: 'video/mp4',
      fileName: safeName + '.mp4',
      caption: `📁💕 *${option.label}*\n> ✦ ${FOOTER} ✦`,
    },
    { quoted: msg }
  );
}

async function showSeries({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🌸✨ *Loading series...*' },
    { quoted: msg }
  );

  try {
    const full = await infoApi(item.url);
    const data = full.data || full;
    const title = data.title || item.title;
    const image = data.image || data.poster || item.image;
    const status = data.status || item.status || 'N/A';
    const type = data.type || 'N/A';
    const total = data.total_episodes || (data.episodes || []).length || 'N/A';
    const genres = Array.isArray(data.genres)
      ? [...new Set(data.genres.filter((g) => g && g !== 'Genres'))].slice(0, 5).join(', ')
      : 'N/A';
    const story = clean(data.synopsis || data.story || '', 160);
    const episodes = Array.isArray(data.episodes) ? data.episodes : [];

    // Episode page opened directly
    if (!episodes.length) {
      const options = pickDirectOptions(full);
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      if (!options.length) {
        return sock.sendMessage(
          from,
          { text: `🥺 No direct links for this page` + foot() },
          { quoted: msg }
        );
      }
      setPending(from, {
        type: 'quality',
        title,
        image,
        fileName: full.file_name,
        options,
      });
      let cap =
        `╭───「 💗 *DOWNLOAD* 」───╮\n│\n│  👑 ${clean(title, 42)}\n│\n`;
      options.forEach((o, i) => {
        cap += `│  *${i + 1}.* ${o.label}\n`;
      });
      cap +=
        `\n│  👇 *${config.prefix || '.'}animexin <number>*\n╰──────────────────────╯` +
        foot();
      if (image) {
        try {
          return await sock.sendMessage(
            from,
            { image: { url: image }, caption: cap },
            { quoted: msg }
          );
        } catch (_) {}
      }
      return sock.sendMessage(from, { text: cap }, { quoted: msg });
    }

    setPending(from, {
      type: 'episodes',
      title,
      image,
      episodes,
      seriesUrl: item.url,
    });

    const show = episodes.slice(0, 25);
    let caption =
      `╭───「 💖🌸 *ANIMEXIN* 」───╮\n│\n` +
      `│  👑 *${clean(title, 42)}*\n` +
      `│  💗 Status › ${status}\n` +
      `│  🎀 Type › ${type}\n` +
      `│  ✨ Genres › ${clean(genres, 36)}\n` +
      `│  📦 Episodes › ${total}\n│\n` +
      (story ? `│  📝 ${story}\n│\n` : '') +
      `│  💕 *Episodes (latest first):*\n`;

    show.forEach((ep, i) => {
      caption += `│  *${i + 1}.* Ep ${ep.episode || i + 1}`;
      if (ep.date) caption += ` · ${ep.date}`;
      caption += `\n`;
    });

    if (episodes.length > show.length) {
      caption += `│  … +${episodes.length - show.length} more in list\n`;
    }

    caption +=
      `\n│  👇 *${config.prefix || '.'}animexin <number>* → one ep\n` +
      `│  🌸 *${config.prefix || '.'}animexin all* → batch docs\n` +
      `│     (max ${MAX_ALL_EPS} eps / run)\n` +
      `╰──────────────────────╯` +
      foot();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (image && /^https?:\/\//i.test(image)) {
      try {
        await sock.sendMessage(
          from,
          { image: { url: image }, caption },
          { quoted: msg }
        );
        return;
      } catch (_) {}
    }
    await sock.sendMessage(from, { text: caption }, { quoted: msg });
  } catch (err) {
    console.error('Animexin series:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💔 \`${err.message}\`` + foot(),
        edit: loading.key,
      })
      .catch(() => {});
  }
}

async function showQualityForEpisode({ sock, msg, from, ep, seriesTitle, seriesImage }) {
  const loading = await sock.sendMessage(
    from,
    { text: `🌸💗 *Ep ${ep.episode || ''} loading...*` },
    { quoted: msg }
  );

  try {
    const full = await infoApi(ep.url);
    const data = full.data || full;
    const title =
      data.title || ep.title || `${seriesTitle} Episode ${ep.episode || ''}`.trim();
    const image = data.image || data.poster || seriesImage;
    const options = pickDirectOptions(full);

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (!options.length) {
      return sock.sendMessage(
        from,
        {
          text:
            `🥺 No direct file for Ep ${ep.episode || ''}\n` +
            `Only host pages (Terabox/Mirror)` +
            foot(),
        },
        { quoted: msg }
      );
    }

    const prev = pending.get(from);
    setPending(from, {
      type: 'quality',
      title,
      image,
      fileName: full.file_name,
      options,
      episodes: prev?.episodes || null,
      seriesTitle: seriesTitle || prev?.title,
      seriesImage: seriesImage || prev?.image,
      seriesUrl: prev?.seriesUrl,
    });

    let cap =
      `╭───「 💗 *EP ${ep.episode || ''}* 」───╮\n│\n` +
      `│  👑 ${clean(title, 42)}\n│\n` +
      `│  📥 *Quality:*\n`;
    options.forEach((o, i) => {
      cap += `│  *${i + 1}.* ${o.label}\n`;
    });
    cap +=
      `\n│  👇 *${config.prefix || '.'}animexin <number>*\n` +
      `│  📁 Document stream\n` +
      `╰──────────────────────╯` +
      foot();

    if (image) {
      try {
        await sock.sendMessage(from, { image: { url: image }, caption: cap }, { quoted: msg });
        return;
      } catch (_) {}
    }
    await sock.sendMessage(from, { text: cap }, { quoted: msg });
  } catch (err) {
    console.error('Animexin ep:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💔 \`${err.message}\`` + foot(),
        edit: loading.key,
      })
      .catch(() => {});
  }
}

async function downloadAllEpisodes({ sock, msg, from, state }) {
  const episodes = (state.episodes || []).slice(0, MAX_ALL_EPS);
  if (!episodes.length) {
    return sock.sendMessage(
      from,
      { text: '🥺 No episodes in session' + foot() },
      { quoted: msg }
    );
  }

  await sock.sendMessage(
    from,
    {
      text:
        `🌸💕 *Batch download started*\n` +
        `📦 ${episodes.length} episode(s) (max ${MAX_ALL_EPS})\n` +
        `⏳ One document per episode — please wait` +
        foot(),
    },
    { quoted: msg }
  );

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    try {
      await sock.sendMessage(from, {
        text: `💗 *${i + 1}/${episodes.length}* · Ep ${ep.episode || i + 1}…`,
      });

      const full = await infoApi(ep.url);
      const data = full.data || full;
      const title =
        data.title ||
        ep.title ||
        `${state.title} Episode ${ep.episode || i + 1}`.trim();
      const options = pickDirectOptions(full);
      const option = bestOption(options);

      if (!option) {
        fail++;
        await sock.sendMessage(from, {
          text: `⚠️ Ep ${ep.episode || i + 1} — no direct link, skipped`,
        });
        continue;
      }

      await sendOneDoc({
        sock,
        msg,
        from,
        option,
        title,
        image: state.image,
        fileName: full.file_name,
      });
      ok++;

      if (i < episodes.length - 1) await sleep(EP_DELAY_MS);
    } catch (err) {
      fail++;
      console.error('Animexin all ep fail:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ Ep ${ep.episode || i + 1}: ${err.message}`,
        })
        .catch(() => {});
      await sleep(1000);
    }
  }

  await sock.sendMessage(
    from,
    {
      text:
        `╭───「 💖 *DONE* 」───╮\n│\n` +
        `│  ✅ Sent: *${ok}*\n` +
        `│  ⚠️ Skip/fail: *${fail}*\n│\n` +
        `╰──────────────────────╯` +
        foot(),
    },
    { quoted: msg }
  );
}

module.exports = {
  name: 'animexin',
  aliases: ['axin', 'animein', 'animex'],
  description: 'Search & download Animexin anime (per-episode documents)',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    const state = pending.get(from);

    // .animexin all
    if (args.length === 1 && /^all$/i.test(args[0])) {
      if (!state || state.type !== 'episodes' || !state.episodes?.length) {
        return sock.sendMessage(
          from,
          {
            text:
              `🥺 First select a series\n` +
              `💡 \`${prefix}animexin <name>\` → \`${prefix}animexin <number>\` → \`${prefix}animexin all\`` +
              foot(),
          },
          { quoted: msg }
        );
      }
      return downloadAllEpisodes({ sock, msg, from, state });
    }

    // number select
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const n = parseInt(args[0], 10);

      if (state?.type === 'search') {
        const item = state.results.find((r) => r.index === n) || state.results[n - 1];
        if (!item) {
          return sock.sendMessage(
            from,
            { text: `❌💕 *1*–*${state.results.length}*` + foot() },
            { quoted: msg }
          );
        }
        return showSeries({ sock, msg, from, item });
      }

      if (state?.type === 'episodes') {
        const ep = state.episodes[n - 1];
        if (!ep) {
          return sock.sendMessage(
            from,
            { text: `❌💕 *1*–*${Math.min(25, state.episodes.length)}*` + foot() },
            { quoted: msg }
          );
        }
        // keep episodes pending for further picks / all
        const keep = {
          type: 'episodes',
          title: state.title,
          image: state.image,
          episodes: state.episodes,
          seriesUrl: state.seriesUrl,
        };
        setPending(from, keep);
        return showQualityForEpisode({
          sock,
          msg,
          from,
          ep,
          seriesTitle: state.title,
          seriesImage: state.image,
        });
      }

      if (state?.type === 'quality') {
        const opt = state.options[n - 1];
        if (!opt) {
          return sock.sendMessage(
            from,
            { text: `❌💕 *1*–*${state.options.length}*` + foot() },
            { quoted: msg }
          );
        }
        const loading = await sock.sendMessage(
          from,
          { text: '⬆️🌸 *Sending document...*' },
          { quoted: msg }
        );
        try {
          await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
          await sendOneDoc({
            sock,
            msg,
            from,
            option: opt,
            title: state.title,
            image: state.image,
            fileName: state.fileName,
          });
          // restore episodes list so user can pick another ep
          if (state.seriesUrl || state.episodes) {
            const prevEps = state.episodes;
            if (prevEps) {
              setPending(from, {
                type: 'episodes',
                title: state.seriesTitle || state.title,
                image: state.seriesImage || state.image,
                episodes: prevEps,
                seriesUrl: state.seriesUrl,
              });
            }
          }
        } catch (err) {
          await sock
            .sendMessage(from, {
              text: `❌💔 \`${err.message}\`\n🔗 ${opt.url}` + foot(),
              edit: loading.key,
            })
            .catch(() => {});
        }
        return;
      }

      return sock.sendMessage(
        from,
        { text: `🥺 No session\n💡 \`${prefix}animexin <name>\`` + foot() },
        { quoted: msg }
      );
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 💖🌸 *ANIMEXIN* 」───╮\n│\n` +
            `│  ${prefix}animexin <anime name>\n` +
            `│  ${prefix}animexin <number>  → series / ep / quality\n` +
            `│  ${prefix}animexin all       → batch documents\n│\n` +
            `│  📌 Example:\n` +
            `│  ${prefix}animexin Record Of Mortal\n` +
            `│  ${prefix}animexin 1\n` +
            `│  ${prefix}animexin 1\n` +
            `│  ${prefix}animexin 1\n` +
            `│  ${prefix}animexin all\n│\n` +
            `│  💕 Each episode = separate document\n` +
            `╰──────────────────────╯` +
            foot(),
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const loading = await sock.sendMessage(
      from,
      { text: '🔍💕 *Searching...*' },
      { quoted: msg }
    );

    try {
      const results = await searchApi(query);
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (!results.length) {
        return sock.sendMessage(
          from,
          { text: '🥺 No results' + foot() },
          { quoted: msg }
        );
      }

      setPending(from, { type: 'search', results });

      let list =
        `╭───「 💖🔍 *SEARCH* 」───╮\n│\n` +
        `│  🔎 *${clean(query, 36)}*\n` +
        `│  📦 ${results.length} results\n│\n`;

      results.forEach((r) => {
        list += `│  *${r.index}.* ${clean(r.title, 40)}\n`;
        list += `│      💗 ${r.status}\n`;
      });

      list +=
        `\n│  👇 *${prefix}animexin <number>*\n╰──────────────────────╯` +
        foot();

      if (results[0].image) {
        try {
          await sock.sendMessage(
            from,
            { image: { url: results[0].image }, caption: list },
            { quoted: msg }
          );
          return;
        } catch (_) {}
      }
      await sock.sendMessage(from, { text: list }, { quoted: msg });
    } catch (err) {
      console.error('Animexin search:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌💔 \`${err.message}\`` + foot(),
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
