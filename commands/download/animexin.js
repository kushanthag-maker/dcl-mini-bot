const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/anime/animexin/search';
const INFO_API = 'https://api.chamindu.site/api/v1/anime/animexin/infodl';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const PENDING_TTL_MS = 4 * 60 * 1000;

const pending = new Map();
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function foot() {
  return (
    `\n🌸💕 *Pair your queen:* ${SITE}\n` +
    `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`
  );
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

function pickDlUrl(d) {
  if (!d) return null;
  // Prefer API-marked direct / mediafire proxy
  if (d.direct && d.url) return d.url;
  if (d.url && String(d.url).includes('api.chamindu.site/api/v1/download/proxy')) return d.url;
  if (d.direct_url) return d.direct_url;
  return null;
}

async function searchApi(query) {
  const res = await axios.get(SEARCH_API, {
    params: { q: query, api_key: API_KEY },
    timeout: 45000,
    validateStatus: () => true,
    headers: { 'User-Agent': UA },
  });
  if (res.status !== 200 || !res.data) throw new Error(`Search HTTP ${res.status}`);
  if (res.data.status === false) throw new Error(res.data.error || res.data.message || 'Search failed');
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
  const res = await axios.get(INFO_API, {
    params: { q: pageUrl, api_key: API_KEY },
    timeout: 90000,
    validateStatus: () => true,
    headers: { 'User-Agent': UA },
  });
  if (res.status !== 200 || !res.data) throw new Error(`Info HTTP ${res.status}`);
  if (res.data.status === false) throw new Error(res.data.error || res.data.message || 'Info failed');
  return res.data;
}

async function showSeries({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🌸✨ *Loading anime for you, babe...*' },
    { quoted: msg }
  );

  try {
    const full = await infoApi(item.url);
    const data = full.data || full;
    const title = data.title || item.title;
    const image = data.image || data.poster || item.image;
    const status = data.status || item.status || 'N/A';
    const studio = data.studio || 'N/A';
    const network = data.network || 'N/A';
    const released = data.released || 'N/A';
    const duration = data.duration || 'N/A';
    const country = data.country || 'N/A';
    const type = data.type || 'N/A';
    const genres = Array.isArray(data.genres)
      ? [...new Set(data.genres.filter((g) => g && g !== 'Genres'))].slice(0, 6).join(', ')
      : 'N/A';
    const story = clean(data.synopsis || data.story || '', 200);
    const episodes = Array.isArray(data.episodes) ? data.episodes : [];
    const total = data.total_episodes || episodes.length || 'N/A';

    if (!episodes.length) {
      // maybe this IS an episode page
      const downloads = Array.isArray(data.downloads) ? data.downloads : [];
      const directTop = full.direct_download || null;
      return showEpisodeDownloads({
        sock,
        msg,
        from,
        title,
        image,
        downloads,
        directTop,
        fileName: full.file_name,
        loading,
      });
    }

    // show latest 20 episodes first
    const listEps = episodes.slice(0, 20);

    setPending(from, {
      type: 'episodes',
      title,
      image,
      episodes: listEps,
      seriesUrl: item.url,
    });

    let caption =
      `╭───「 💖🌸 *ANIMEXIN* 」───╮\n│\n` +
      `│  👑 *Title* › ${clean(title, 42)}\n` +
      `│  💗 *Status* › ${status}\n` +
      `│  🎀 *Type* › ${type} · ${country}\n` +
      `│  📺 *Network* › ${network}\n` +
      `│  🎬 *Studio* › ${clean(studio, 28)}\n` +
      `│  📅 *Released* › ${released}\n` +
      `│  ⏱️ *Duration* › ${duration}\n` +
      `│  ✨ *Genres* › ${clean(genres, 36)}\n` +
      `│  📦 *Episodes* › ${total}\n│\n` +
      (story ? `│  📝 ${story}\n│\n` : '') +
      `│  💕 *Latest episodes:*\n`;

    listEps.forEach((ep, i) => {
      const num = ep.episode || i + 1;
      caption += `│  *${i + 1}.* Ep ${num} · ${ep.date || ''}\n`;
    });

    caption +=
      `\n│  👇 *${config.prefix || '.'}animexin <number>*\n` +
      `│  💗 Pick an episode, sweetheart\n` +
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

async function showEpisodeDownloads({
  sock,
  msg,
  from,
  title,
  image,
  downloads,
  directTop,
  fileName,
  loading,
}) {
  // Build quality list — prefer direct Mediafire proxy
  const options = [];

  for (const d of downloads || []) {
    const url = pickDlUrl(d) || (d.direct ? d.url : null);
    if (!url) continue;
    options.push({
      label: `${d.quality || 'HD'} · ${d.language || ''} · ${d.server || 'File'}`.trim(),
      quality: d.quality || 'HD',
      language: d.language || '',
      server: d.server || 'Direct',
      url,
    });
  }

  // Top-level direct_download as fallback option
  if (directTop && !options.some((o) => o.url === directTop)) {
    options.unshift({
      label: '1080p · Direct · Mediafire',
      quality: '1080p',
      language: '',
      server: 'Mediafire',
      url: directTop,
    });
  }

  if (!options.length) {
    // no direct — show host links as text
    let text =
      `╭───「 💖 *EPISODE* 」───╮\n│\n` +
      `│  👑 ${clean(title, 42)}\n│\n` +
      `│  🥺 No direct file links\n│\n`;
    (downloads || []).slice(0, 6).forEach((d, i) => {
      text += `│  *${i + 1}.* ${d.server} ${d.quality}\n│  ${d.url}\n`;
    });
    text += `╰──────────────────────╯` + foot();
    if (loading) await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
    return sock.sendMessage(from, { text }, { quoted: msg });
  }

  setPending(from, {
    type: 'quality',
    title,
    image,
    fileName: fileName || null,
    options,
  });

  let caption =
    `╭───「 💗🌸 *DOWNLOAD* 」───╮\n│\n` +
    `│  👑 *${clean(title, 42)}*\n│\n` +
    `│  📥 *Choose quality:*\n│\n`;

  options.forEach((o, i) => {
    caption += `│  *${i + 1}.* ${o.label}\n`;
  });

  caption +=
    `\n│  👇 *${config.prefix || '.'}animexin <number>*\n` +
    `│  💕 Document will be sent, babe\n` +
    `╰──────────────────────╯` +
    foot();

  if (loading) await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

  if (image && /^https?:\/\//i.test(image)) {
    try {
      await sock.sendMessage(from, { image: { url: image }, caption }, { quoted: msg });
      return;
    } catch (_) {}
  }
  await sock.sendMessage(from, { text: caption }, { quoted: msg });
}

async function loadEpisodeAndShow({ sock, msg, from, ep, seriesTitle, seriesImage }) {
  const loading = await sock.sendMessage(
    from,
    { text: `🌸💗 *Fetching Ep ${ep.episode || ''}...*` },
    { quoted: msg }
  );

  try {
    const full = await infoApi(ep.url);
    const data = full.data || full;
    const title =
      data.title ||
      ep.title ||
      `${seriesTitle} Episode ${ep.episode || ''}`.trim();
    const image = data.image || data.poster || seriesImage;
    const downloads = Array.isArray(data.downloads) ? data.downloads : [];

    await showEpisodeDownloads({
      sock,
      msg,
      from,
      title,
      image,
      downloads,
      directTop: full.direct_download || null,
      fileName: full.file_name,
      loading,
    });
  } catch (err) {
    console.error('Animexin episode:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💔 \`${err.message}\`` + foot(),
        edit: loading.key,
      })
      .catch(() => {});
  }
}

async function sendDocument({ sock, msg, from, option, title, image, fileName }) {
  const loading = await sock.sendMessage(
    from,
    { text: `⬆️🌸 *Sending document...*\n💗 ${option.label}` },
    { quoted: msg }
  );

  try {
    const safeName =
      (fileName && String(fileName).replace(/[\/\\:*?"<>|]/g, '').slice(0, 60)) ||
      (clean(title, 40).replace(/[\/\\:*?"<>|]/g, '') + '.mp4');

    const caption =
      `╭───「 💖 *ANIMEXIN* 」───╮\n│\n` +
      `│  👑 *${clean(title, 42)}*\n` +
      `│  🎥 *${option.quality}* · ${option.server}\n` +
      (option.language ? `│  🗣️ ${option.language}\n` : '') +
      `│  📁 Document stream\n│\n` +
      `╰──────────────────────╯` +
      foot();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (image && /^https?:\/\//i.test(image)) {
      await sock
        .sendMessage(from, { image: { url: image }, caption }, { quoted: msg })
        .catch(() =>
          sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {})
        );
    } else {
      await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
    }

    await sock.sendMessage(
      from,
      {
        document: { url: option.url },
        mimetype: 'video/mp4',
        fileName: safeName.endsWith('.mp4') ? safeName : safeName + '.mp4',
        caption: `📁💕 *${option.label}*\n> ✦ ${FOOTER} ✦`,
      },
      { quoted: msg }
    );
  } catch (err) {
    console.error('Animexin send:', err.message);
    await sock
      .sendMessage(from, {
        text:
          `❌💔 Upload fail\n\`${err.message}\`\n\n` +
          `🔗 Try link:\n${option.url}` +
          foot(),
        edit: loading.key,
      })
      .catch(() => {});
  }
}

module.exports = {
  name: 'animexin',
  aliases: ['axin', 'animein', 'animex'],
  description: 'Search & download anime from Animexin',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // Number select
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const n = parseInt(args[0], 10);
      const state = pending.get(from);

      if (state?.type === 'search') {
        const item = state.results.find((r) => r.index === n) || state.results[n - 1];
        if (!item) {
          return sock.sendMessage(
            from,
            { text: `❌💕 Pick *1*–*${state.results.length}*` + foot() },
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
            { text: `❌💕 Pick *1*–*${state.episodes.length}*` + foot() },
            { quoted: msg }
          );
        }
        return loadEpisodeAndShow({
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
            { text: `❌💕 Pick *1*–*${state.options.length}*` + foot() },
            { quoted: msg }
          );
        }
        if (state.timeout) clearTimeout(state.timeout);
        pending.delete(from);
        return sendDocument({
          sock,
          msg,
          from,
          option: opt,
          title: state.title,
          image: state.image,
          fileName: state.fileName,
        });
      }

      return sock.sendMessage(
        from,
        {
          text: `🥺 No active search\n💡 \`${prefix}animexin <name>\`` + foot(),
        },
        { quoted: msg }
      );
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 💖🌸 *ANIMEXIN* 」───╮\n│\n` +
            `│  💗 ${prefix}animexin <anime name>\n` +
            `│  🌸 ${prefix}animexin <number>\n│\n` +
            `│  📌 Example:\n` +
            `│  ${prefix}animexin Record Of Mortal\n` +
            `│  ${prefix}animexin 1\n│\n` +
            `│  ✨ Soft · sweet · for you\n` +
            `╰──────────────────────╯` +
            foot(),
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const loading = await sock.sendMessage(
      from,
      { text: '🔍💕 *Searching Animexin for you...*' },
      { quoted: msg }
    );

    try {
      const results = await searchApi(query);
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (!results.length) {
        return sock.sendMessage(
          from,
          { text: '🥺 No results, try another name' + foot() },
          { quoted: msg }
        );
      }

      setPending(from, { type: 'search', results });

      let list =
        `╭───「 💖🔍 *ANIMEXIN* 」───╮\n│\n` +
        `│  🔎 *${clean(query, 36)}*\n` +
        `│  📦 ${results.length} results\n│\n`;

      results.forEach((r) => {
        list += `│  *${r.index}.* ${clean(r.title, 40)}\n`;
        list += `│      💗 ${r.status}${r.sub ? ' · ' + r.sub : ''}\n`;
      });

      list +=
        `\n│  👇 *${prefix}animexin <number>*\n` +
        `│  ⏳ 4 min · 💕\n` +
        `╰──────────────────────╯` +
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
