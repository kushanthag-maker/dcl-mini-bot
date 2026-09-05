const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/movies/cinesubz/search';
const DL_API     = 'https://api.chamindu.site/api/v1/movies/cinesubz/infodl';
const BOT_LINK   = 'https://dark-queen.vercel.app/';
const MAX_SEND_BYTES = 2 * 1024 * 1024 * 1024; // 2GB WA document limit

const pending = new Map(); // from -> state {mode, results/info/episodes, ...}
const BAR = '━'.repeat(28);
const TTL = 3 * 60 * 1000;

/* ---------------- helpers ---------------- */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function footer() {
  return `│\n╰${BAR}╯\n🖤 *Dark Queen*  •  ${BOT_LINK}`;
}
function box(title, lines) {
  return `╭${BAR}╮\n${title}\n│\n${lines.join('\n')}\n${footer()}`;
}
function clean(str, len = 55) {
  const s = String(str || 'N/A')
    .replace(/\s*[│|]\s*සිංහල.*$/i, '')
    .replace(/\s*[│|].*$/, '')   // cut " | සිංහල උපසිරැසි සමඟ"
    .trim();
  return s.length > len ? s.slice(0, len) + '…' : s;
}
function genreList(arr) {
  return (arr || []).filter((x) => !/^[.#]/.test(x)).join(', ') || 'N/A';
}

/* ---------------- API ---------------- */
async function fetchSearch(query) {
  const res = await axios.get(SEARCH_API, { params: { q: query, api_key: API_KEY }, timeout: 45000, validateStatus: () => true });
  if (res.status !== 200 || !res.data || res.data.status !== true)
    throw new Error((res.data && res.data.message) || `Search HTTP ${res.status}`);
  return Array.isArray(res.data.data) ? res.data.data : [];
}

async function fetchInfo(url) {
  const res = await axios.get(DL_API, { params: { q: url, api_key: API_KEY }, timeout: 60000, validateStatus: () => true });
  if (res.status !== 200 || !res.data || res.data.status !== true || !res.data.data)
    throw new Error((res.data && res.data.message) || `Info HTTP ${res.status}`);
  const data = res.data.data;
  const isTv = !!res.data.is_tv;
  const isEp = !!res.data.is_episode;
  const dl = Array.isArray(data.downloads) ? data.downloads : [];
  const ep = Array.isArray(data.episodes) ? data.episodes : [];
  return { data, isTv, isEp, dl, ep, pageUrl: url };
}

/* ---------------- detail card (movie info) ---------------- */
function detailCardInfo(info) {
  const d = info.data;
  const cast = (d.cast || []).slice(0, 6).map((c) => `│  👤 *${c.name}* — ${c.role}`).join('\n');
  const dlTxt = info.dl.length
    ? info.dl.map((x, i) => `│  *${i + 1}.* ${clean(x.quality, 30)}\n│     📦 ${x.size || 'N/A'} · 🌐 ${x.language || ''}`).join('\n')
    : '│  ❌ Download links නැහැ';
  return box('│  🎬 *CINESUBZ — MOVIE*', [
    `│  ✨ *${clean(d.title, 40)}*`,
    `│`,
    `│  ⭐ *${d.rating || 'N/A'}*  🎥 *${d.quality || 'N/A'}*  🗣️ *${d.language || 'N/A'}*`,
    `│  📅 *${d.year || 'N/A'}*  ⏱️ *${d.duration || 'N/A'}*`,
    `│  🏷️ ${genreList(d.genres)}`,
    `│`,
    `│  📄 *Full details doc එකක් ලෙස එව්වා 👇*`,
    `│`,
    `│  ⬇️ *DOWNLOAD LINKS*`,
    dlTxt,
    `│`,
    `│  👇 *${config.prefix || '.'}cinesubz <number>* → stream/download`,
  ]);
}

function detailCardEpisodes(info) {
  const eps = info.ep;
  const show = clean(info.data.title, 45);
  const lines = [
    `│  📺 *${show}*`,
    `│`,
    `│  🔢 *Episodes:* ${eps.length}`,
    `│`,
  ];
  eps.slice(0, 40).forEach((e, i) => {
    const nm = String(e.episode_name || `Episode ${i + 1}`).slice(0, 38);
    lines.push(`│  *${i + 1}.* ${nm}`);
  });
  lines.push(`│`, `│  👇 *${config.prefix || '.'}cinesubz <number>* → episode DL links`);
  return box('│  🎬 *CINESUBZ — TV SERIES*', lines);
}

function detailCardEpQuality(info, epIdx) {
  const ep = info.ep[epIdx];
  const d = info.data;
  const dlTxt = info.dl.length
    ? info.dl.map((x, i) => `│  *${i + 1}.* ${clean(x.quality, 30)}\n│     📦 ${x.size || 'N/A'} · 🌐 ${x.language || ''}`).join('\n')
    : '│  ❌ Download links නැහැ';
  return box('│  🎬 *EPISODE DOWNLOAD*', [
    `│  ✨ *${clean(ep.episode_name || d.title, 42)}*`,
    `│`,
    `│  ⬇️ *DOWNLOAD LINKS*`,
    dlTxt,
    `│`,
    `│  👇 *${config.prefix || '.'}cinesubz <number>*`,
  ]);
}

/* ---------------- info document (story + all links) ---------------- */
function buildInfoDoc(info) {
  const d = info.data;
  const cast = (d.cast || []).map((c) => `• ${c.name} — ${c.role}`).join('\n') || 'N/A';
  const dls = info.dl;
  let t = '';
  t += `🎬 *CINESUBZ MOVIE DETAILS*\n═${BAR}═\n\n`;
  t += `🖼️ *Poster:* ${d.image || 'N/A'}\n\n`;
  t += `🎬 *Title:* ${d.title || 'N/A'}\n`;
  t += `⭐ *Rating:* ${d.rating || 'N/A'}\n`;
  t += `🎥 *Quality:* ${d.quality || 'N/A'}\n`;
  t += `📽️ *IMDb:* ${d.imdb || 'N/A'}\n`;
  t += `🎬 *Director:* ${d.director || d.directors || 'N/A'}\n`;
  t += `🗣️ *Language:* ${d.language || 'N/A'}\n`;
  t += `📅 *Year:* ${d.year || 'N/A'}  ⏱️ *Duration:* ${d.duration || 'N/A'}\n`;
  t += `🌍 *Country:* ${d.country || 'N/A'}\n`;
  t += `🏷️ *Genres:* ${genreList(d.genres)}\n`;
  t += `🔗 *Page:* ${info.pageUrl}\n\n`;
  if (d.story) t += `📖 *Story:*\n${String(d.story).slice(0, 2000)}\n\n`;
  if (cast !== 'N/A') t += `🎭 *Cast:*\n${cast}\n\n`;
  if (d.trailer) t += `▶️ *Trailer:* ${d.trailer}\n\n`;
  t += `⬇️ *DOWNLOAD LINKS:*\n`;
  if (dls.length) {
    dls.forEach((x, i) => { t += `${i + 1}. [${x.quality}] (${x.size || '?'}) ${x.language || ''}\n   ${x.link}\n`; });
  } else if (info.ep.length) {
    t += `(TV Series — පළමුව කථාංගයක් තෝරන්න)\n`;
    info.ep.slice(0, 30).forEach((e, i) => { t += `${i + 1}. ${e.episode_name}\n   ${e.episode_url}\n`; });
  } else {
    t += `N/A\n`;
  }
  t += `\n🖤 Dark Queen • ${BOT_LINK}\n`;
  return t;
}

/* ---------------- sending ---------------- */
function fileName(title) {
  return String(title || 'Cinesubz')
    .replace(/[^\w\u0d80-\u0dff\- ]+/g, '')
    .replace(/ +/g, '_').slice(0, 60) + '.txt';
}

async function sendMovieDetails(sock, from, msg, info) {
  // poster image + caption card
  if (/^https?:\/\//i.test(info.data.image || '')) {
    await sock.sendMessage(from, { image: { url: info.data.image }, caption: detailCardInfo(info) }, { quoted: msg }).catch(() => {});
  }
  // full detail document
  const doc = Buffer.from(buildInfoDoc(info), 'utf8');
  await sock.sendMessage(from, {
    document: doc,
    mimetype: 'text/plain',
    fileName: fileName(info.data.title),
    caption: `🎬 *Movie Details* 📄\n${clean(info.data.title, 55)}\n🖤 ${BOT_LINK}`,
  }, { quoted: msg }).catch(() => {});
}

async function sendEpisodesList(sock, from, msg, info) {
  await sock.sendMessage(from, { text: detailCardEpisodes(info) }, { quoted: msg }).catch(() => {});
}

async function sendEpQuality(sock, from, msg, info, epIdx) {
  // show poster if series has one, with quality caption
  if (/^https?:\/\//i.test(info.data.image || '')) {
    await sock.sendMessage(from, { image: { url: info.data.image }, caption: detailCardEpQuality(info, epIdx) }, { quoted: msg }).catch(() => {});
  } else {
    await sock.sendMessage(from, { text: detailCardEpQuality(info, epIdx) }, { quoted: msg }).catch(() => {});
  }
}

/* ---------------- stream / buffer upload ---------------- */
async function streamQuality(sock, from, msg, title, dl) {
  const base = clean(title, 55).replace(/[^\w\u0d80-\u0dff\- ]+/g, '').trim() || 'Cinesubz_movie';

  // Stream via URL (ZERO RAM buffer)
  try {
    const sent = await sock.sendMessage(from, {
      document: { url: dl.link },
      mimetype: 'video/mp4',
      fileName: `${base}_${clean(dl.quality, 25).replace(/[^\w\- ]+/g, '').trim()}.mp4`,
      caption: `🎬 ${clean(title, 55)}\n🎥 ${dl.quality} · 📦 ${dl.size || 'N/A'}\n🖤 ${BOT_LINK}`,
    }, { quoted: msg });
    if (sent) return;
    throw new Error('stream-empty');
  } catch (e1) {
    console.error('[Cinesubz] URL stream fail:', e1.message);
  }

  // Fallback buffer (small files only)
  const st = await sock.sendMessage(from, { text: '🔄 *Buffer download fallback...*' }, { quoted: msg }).catch(() => null);
  let buf = null;
  try {
    const b = await axios.get(dl.link, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: MAX_SEND_BYTES });
    buf = b.data;
  } catch (e) { console.error('[Cinesubz] buffer fail:', e.message); }
  if (st) await sock.sendMessage(from, { delete: st.key }).catch(() => {});
  if (!buf || buf.length < 10000) {
    return sock.sendMessage(from, { text: `❌ Direct send fail.\n💡 *${dl.link}*\n\nඔයාටම link එකෙන් download කරන්න පුළුවන් ✅` }, { quoted: msg }).catch(() => {});
  }
  await sock.sendMessage(from, {
    document: buf, mimetype: 'video/mp4', fileName: `${base}.mp4`,
    caption: `🎬 ${clean(title, 55)}\n🎥 ${dl.quality} · 📦 ${(buf.length / 1048576).toFixed(1)} MB\n🖤 ${BOT_LINK}`,
  }, { quoted: msg }).catch(() => {});
}

/* ---------------- main detail fetch (auto TV/movie) ---------------- */
async function openMovie(sock, from, msg, link, mode) {
  const loading = await sock.sendMessage(from, { text: '⏳ *Details ලබාගන්නවා...*' }, { quoted: msg }).catch(() => null);
  try {
    const info = await fetchInfo(link);
    if (loading) await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (info.isTv && info.ep.length && !info.isEp) {
      // TV series main page → show episodes, wait for episode pick
      pending.set(from, { mode: 'episodes', info, timeout: setTimeout(() => pending.delete(from), TTL) });
      return sendEpisodesList(sock, from, msg, info);
    }
    // Movie / episode page → download menu
    pending.set(from, { mode: 'quality', info, timeout: setTimeout(() => pending.delete(from), TTL) });
    return sendMovieDetails(sock, from, msg, info);
  } catch (err) {
    if (loading) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
  }
}

/* ---------------- command ---------------- */
module.exports = {
  name: 'cinesubz',
  aliases: ['csub', 'sinhalasubz'],
  description: 'Search & download CineSubz (සිංහල සබ්ටයිටල්) movies & TV series',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // ===== number selection =====
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const state = pending.get(from);

      // movie/episode download quality pick
      if (state?.mode === 'quality') {
        if (idx < 0 || idx >= state.info.dl.length)
          return sock.sendMessage(from, { text: `❌ *1*–*${state.info.dl.length}* අතර number එකක් දෙන්න.` }, { quoted: msg });
        if (state.timeout) clearTimeout(state.timeout);
        pending.delete(from);
        const dl = state.info.dl[idx];
        return streamQuality(sock, from, msg, state.info.data.title, dl);
      }

      // tv series: episodes main list pick
      if (state?.mode === 'episodes') {
        if (idx < 0 || idx >= state.info.ep.length)
          return sock.sendMessage(from, { text: `❌ *1*–*${state.info.ep.length}* අතර episode number එකක් දෙන්න.` }, { quoted: msg });
        const ep = state.info.ep[idx];
        // fetch that episode's downloads
        const load = await sock.sendMessage(from, { text: `⏳ *Episode ${idx + 1} details...*` }, { quoted: msg }).catch(() => null);
        try {
          const epInfo = await fetchInfo(ep.episode_url);
          if (load) await sock.sendMessage(from, { delete: load.key }).catch(() => {});
          if (state.timeout) clearTimeout(state.timeout);
          pending.set(from, { mode: 'quality', info: epInfo, timeout: setTimeout(() => pending.delete(from), TTL) });
          return sendEpQuality(sock, from, msg, epInfo, 0);
        } catch (err) {
          if (load) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: load.key }).catch(() => {});
        }
        return;
      }

      // search result pick
      if (state?.mode === 'search') {
        if (idx < 0 || idx >= state.results.length)
          return sock.sendMessage(from, { text: `❌ *1*–*${state.results.length}* අතර number එකක් දෙන්න.` }, { quoted: msg });
        if (state.timeout) clearTimeout(state.timeout);
        const item = state.results[idx];
        return openMovie(sock, from, msg, item.link, item.type);
      }

      return sock.sendMessage(from, { text: `❌ Active session නැහැ.\n💡 \`${prefix}cinesubz <movie name>\`` }, { quoted: msg });
    }

    // ===== help =====
    if (!args.length) {
      return sock.sendMessage(from, {
        text: box('│  🎬 *CINESUBZ*  ·  සිංහල සබ්', [
          `│  ${prefix}cinesubz <movie name>`,
          `│  ${prefix}cinesubz <cinesubz link>`,
          `│  ${prefix}cinesubz <number>   ← pick result`,
          `│`,
          `│  ✨ Example:`,
          `│  ${prefix}cinesubz avatar`,
          `│  ${prefix}cinesubz 1`,
          `│  ${prefix}cinesubz 2`,
          `│`,
          `│  📺 TV series → episode pick`,
          `│  ⏳ session 3 min`,
        ]),
      }, { quoted: msg });
    }

    const query = args.join(' ').trim();

    // direct link
    const m = query.match(/https?:\/\/[^\s]+/i);
    if (m) return openMovie(sock, from, msg, m[0].replace(/[)\]>,.]+$/, ''), 'direct');

    const loading = await sock.sendMessage(from, { text: '🔍 *CineSubz search කරමින්...*' }, { quoted: msg }).catch(() => null);
    try {
      const results = await fetchSearch(query);
      if (!results.length) {
        return sock.sendMessage(from, { text: '❌ Results හමු නොවීය.', edit: loading.key }).catch(() => {});
      }

      pending.set(from, { mode: 'search', results, timeout: setTimeout(() => pending.delete(from), TTL) });

      let lines = [`│  🔎 *"${query.slice(0, 28)}"*  ·  📦 ${results.length}`, `│`];
      results.slice(0, 15).forEach((r, i) => {
        const isSeries = r.type === 'tvshows';
        const tag = isSeries ? '📺 Series' : '🎥 Movie';
        const q = r.quality && r.quality !== 'N/A' ? ` · ${r.quality}` : '';
        lines.push(`│  *${i + 1}.* ${clean(r.title, 42)}`);
        lines.push(`│     ${tag}${q}`);
      });
      lines.push(`│`, `│  👇 *${prefix}cinesubz <number>*  තෝරන්න`);
      const list = box('│  🎬 *CINESUBZ — RESULTS*', lines);

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // show poster of first result with caption
      if (results[0].image && /^https?:\/\//i.test(results[0].image)) {
        await sock.sendMessage(from, { image: { url: results[0].image }, caption: list }, { quoted: msg })
          .catch(() => sock.sendMessage(from, { text: list }, { quoted: msg }).catch(() => {}));
      } else {
        await sock.sendMessage(from, { text: list }, { quoted: msg }).catch(() => {});
      }
    } catch (err) {
      console.error('[Cinesubz] search:', err.message);
      if (loading) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
    }
  },
};
