const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/movies/moviebox/search';
const DL_API     = 'https://api.chamindu.site/api/v1/movies/moviebox/infodl';
const BOT_LINK   = 'https://dark-queen.vercel.app/';
const MAX_SEND_BYTES = 2 * 1024 * 1024 * 1024; // 2GB WA document limit

const pending = new Map();
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
  const s = String(str || 'N/A').trim();
  return s.length > len ? s.slice(0, len) + '…' : s;
}
function genreList(arr) {
  return (Array.isArray(arr) ? arr : []).join(', ') || 'N/A';
}
// split downloads into video links vs subtitle files
function splitDls(downloads) {
  const dls = Array.isArray(downloads) ? downloads : [];
  const video = dls.filter((d) => String(d.quality || '').toUpperCase() !== 'SUB');
  const subs = dls.filter((d) => String(d.quality || '').toUpperCase() === 'SUB');
  return { video, subs };
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
  const d = res.data.data;
  const { video, subs } = splitDls(d.downloads);
  const seasons = Array.isArray(d.seasons) ? d.seasons : [];
  return { d, video, subs, seasons, pageUrl: url };
}

/* ---------------- detail card ---------------- */
function detailCard(info) {
  const d = info.d;
  const cast = (d.cast || []).slice(0, 5).join(', ');
  let t = box('│  🎬 *MOVIEBOX — DETAILS*', [
    `│  ✨ *${clean(d.title, 40)}*`,
    `│`,
    `│  ⭐ *IMDb ${d.imdb || 'N/A'}*  🎥 *${d.quality || 'N/A'}*`,
    `│  📅 *${d.year || 'N/A'}*  ⏱️ *${d.duration || 'N/A'}*`,
    `│  🌍 *${d.country || 'N/A'}*  🗣️ *${d.language || 'N/A'}*`,
    `│  🎬 *${clean(d.director || 'N/A', 40)}*`,
    `│  🏷️ ${clean(genreList(d.genres), 42)}`,
    `│`,
    `│  👥 *${clean(cast, 50)}*`,
    `│`,
    `│  📄 *Full details doc එකක් ලෙස එව්වා 👇*`,
    `│`,
    `│  ⬇️ *VIDEO LINKS:* ${info.video.length}`,
    ...(info.video.slice(0, 10).map((x, i) => `│  *${i + 1}.* ${clean(x.title, 32)} — ${x.size || 'N/A'}`)),
    `│`,
    `│  📝 *Subtitles:* ${info.subs.length}`,
    `│`,
    `│  👇 *${config.prefix || '.'}moviebox <number>*`,
  ]);
  return t;
}

/* ---------------- full details document (.txt) ---------------- */
function buildDoc(info) {
  const d = info.d;
  let t = '';
  t += `🎬 *MOVIEBOX MOVIE DETAILS*\n═${BAR}═\n\n`;
  t += `🖼️ *Poster:* ${d.image || 'N/A'}\n\n`;
  t += `🎬 *Title:* ${d.title || 'N/A'}\n`;
  t += `⭐ *IMDb:* ${d.imdb || 'N/A'}\n`;
  t += `🎥 *Quality:* ${d.quality || 'N/A'}\n`;
  t += `📅 *Year:* ${d.year || 'N/A'}  ⏱️ *Duration:* ${d.duration || 'N/A'}\n`;
  t += `🌍 *Country:* ${d.country || 'N/A'}\n`;
  t += `🎬 *Director:* ${d.director || 'N/A'}\n`;
  t += `🗣️ *Language:* ${d.language || 'N/A'}\n`;
  t += `🏷️ *Genres:* ${genreList(d.genres)}\n`;
  t += `🔗 *Page:* ${info.pageUrl}\n\n`;
  if (d.story) t += `📖 *Story:*\n${String(d.story).slice(0, 2500)}\n\n`;
  if (d.cast && d.cast.length) t += `👥 *Cast:*\n${d.cast.join('\n')}\n\n`;
  if (d.trailer) t += `▶️ *Trailer:* ${d.trailer}\n\n`;

  t += `⬇️ *VIDEO DOWNLOAD LINKS:*\n`;
  if (info.video.length) {
    info.video.forEach((x, i) => {
      t += `${i + 1}. [${x.title}] (${x.size || '?'})\n   ${x.link}\n`;
    });
  } else if (info.seasons.length) {
    t += `(TV Series)\n`;
    info.seasons.forEach((s) => {
      const eps = Array.isArray(s.episodes) ? s.episodes : [];
      t += `Season ${s.season}: episodes ${eps.length}\n`;
      eps.forEach((e, i) => {
        const dl = e.downloads && e.downloads.length ? e.downloads[0] : null;
        t += `  • ${i + 1}. ${e.title || e.name || `EP ${i + 1}`}${dl ? `\n     ${dl.link}` : ''}\n`;
      });
    });
  } else {
    t += `N/A\n`;
  }

  t += `\n📝 *SUBTITLE FILES:*\n`;
  if (info.subs.length) {
    info.subs.forEach((x, i) => { t += `${i + 1}. ${x.title} (${x.size})\n   ${x.link}\n`; });
  } else {
    t += `N/A\n`;
  }

  t += `\n🖤 Dark Queen • ${BOT_LINK}\n`;
  return t;
}

function fileName(title) {
  return String(title || 'MovieBox')
    .replace(/[^\w\u0d80-\u0dff\- ]+/g, '').replace(/ +/g, '_').slice(0, 60) + '.txt';
}

/* ---------------- sending helpers ---------------- */
async function sendDetails(sock, from, msg, info) {
  // 1) poster + caption card
  if (/^https?:\/\//i.test(info.d.image || '')) {
    await sock.sendMessage(from, { image: { url: info.d.image }, caption: detailCard(info) }, { quoted: msg }).catch(() => {});
  }
  // 2) full detail document
  const doc = Buffer.from(buildDoc(info), 'utf8');
  await sock.sendMessage(from, {
    document: doc, mimetype: 'text/plain', fileName: fileName(info.d.title),
    caption: `🎬 *Movie Details* 📄\n${clean(info.d.title, 55)}\n🖤 ${BOT_LINK}`,
  }, { quoted: msg }).catch(() => {});
}

async function openMovie(sock, from, msg, link) {
  const loading = await sock.sendMessage(from, { text: '⏳ *MovieBox details ලබාගන්නවා...*' }, { quoted: msg }).catch(() => null);
  try {
    const info = await fetchInfo(link);
    if (loading) await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
    pending.set(from, { mode: 'menu', info, timeout: setTimeout(() => pending.delete(from), TTL) });
    await sendDetails(sock, from, msg, info);
  } catch (err) {
    if (loading) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
  }
}

/* ---------------- stream / send item ---------------- */
async function sendItem(sock, from, msg, title, item, isSub) {
  const base = clean(title, 55).replace(/[^\w\u0d80-\u0dff\- ]+/g, '').trim() || 'MovieBox';
  if (isSub) {
    // subtitle → send as document .srt
    try {
      const buf = await axios.get(item.link, { responseType: 'arraybuffer', timeout: 60000 }).then((r) => r.data);
      await sock.sendMessage(from, {
        document: buf, mimetype: 'application/x-subrip',
        fileName: `${base}_sub_${Date.now()}.srt`,
        caption: `📝 *Subtitle* — ${clean(item.title, 50)}\n🖤 ${BOT_LINK}`,
      }, { quoted: msg });
      return;
    } catch (e) {
      return sock.sendMessage(from, { text: `❌ Subtitle fail.\n💡 ${item.link}` }, { quoted: msg }).catch(() => {});
    }
  }

  // video → stream via URL (zero RAM buffer)
  try {
    const sent = await sock.sendMessage(from, {
      document: { url: item.link }, mimetype: 'video/mp4',
      fileName: `${base}_${clean(item.title, 25).replace(/[^\w\- ]+/g, '').trim()}.mp4`,
      caption: `🎬 ${clean(title, 55)}\n🎥 ${clean(item.title, 30)} · 📦 ${item.size || 'N/A'}\n🖤 ${BOT_LINK}`,
    }, { quoted: msg });
    if (sent) return;
    throw new Error('stream-empty');
  } catch (e1) {
    console.error('[MovieBox] URL stream fail:', e1.message);
  }

  // fallback buffer
  const st = await sock.sendMessage(from, { text: '🔄 *Buffer download fallback...*' }, { quoted: msg }).catch(() => null);
  let buf = null;
  try {
    const b = await axios.get(item.link, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: MAX_SEND_BYTES });
    buf = b.data;
  } catch (e) { console.error('[MovieBox] buffer fail:', e.message); }
  if (st) await sock.sendMessage(from, { delete: st.key }).catch(() => {});
  if (!buf || buf.length < 10000) {
    return sock.sendMessage(from, { text: `❌ Direct send fail.\n💡 *${item.link}*\n\nඔයාටම link එකෙන් download කරන්න ✅` }, { quoted: msg }).catch(() => {});
  }
  await sock.sendMessage(from, {
    document: buf, mimetype: 'video/mp4', fileName: `${base}.mp4`,
    caption: `🎬 ${clean(title, 55)}\n🎥 ${clean(item.title, 30)} · 📦 ${(buf.length / 1048576).toFixed(1)} MB\n🖤 ${BOT_LINK}`,
  }, { quoted: msg }).catch(() => {});
}

/* ---------------- command ---------------- */
module.exports = {
  name: 'moviebox',
  aliases: ['mbox', 'mvb'],
  description: 'Search & download MovieBox movies / TV series with subtitles',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // ---- number selection ----
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const state = pending.get(from);

      if (state?.mode === 'menu') {
        const { video, subs } = state.info;
        const max = video.length + subs.length;
        if (idx < 0 || idx >= max)
          return sock.sendMessage(from, { text: `❌ *1*–*${max}* අතර number එකක් දෙන්න.` }, { quoted: msg });
        if (state.timeout) clearTimeout(state.timeout);
        pending.delete(from);
        if (idx < video.length) {
          return sendItem(sock, from, msg, state.info.d.title, video[idx], false);
        }
        return sendItem(sock, from, msg, state.info.d.title, subs[idx - video.length], true);
      }

      if (state?.mode === 'search') {
        if (idx < 0 || idx >= state.results.length)
          return sock.sendMessage(from, { text: `❌ *1*–*${state.results.length}* අතර number එකක් දෙන්න.` }, { quoted: msg });
        if (state.timeout) clearTimeout(state.timeout);
        return openMovie(sock, from, msg, state.results[idx].link);
      }

      return sock.sendMessage(from, { text: `❌ Active session නැහැ.\n💡 \`${prefix}moviebox <movie>\`` }, { quoted: msg });
    }

    // ---- help ----
    if (!args.length) {
      return sock.sendMessage(from, {
        text: box('│  🎬 *MOVIEBOX*', [
          `│  ${prefix}moviebox <movie name>`,
          `│  ${prefix}moviebox <link>`,
          `│  ${prefix}moviebox <number>   ← pick`,
          `│`,
          `│  ✨ Example:`,
          `│  ${prefix}moviebox avatar`,
          `│  ${prefix}moviebox 1`,
          `│`,
          `│  ⏳ session 3 min`,
        ]),
      }, { quoted: msg });
    }

    const query = args.join(' ').trim();
    const urlMatch = query.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) return openMovie(sock, from, msg, urlMatch[0].replace(/[)\]>,.]+$/, ''));

    const loading = await sock.sendMessage(from, { text: '🔍 *MovieBox search කරමින්...*' }, { quoted: msg }).catch(() => null);
    try {
      const results = await fetchSearch(query);
      if (!results.length) {
        return sock.sendMessage(from, { text: '❌ Results හමු නොවීය.', edit: loading.key }).catch(() => {});
      }

      pending.set(from, { mode: 'search', results, timeout: setTimeout(() => pending.delete(from), TTL) });

      const lines = [
        `│  🔎 *"${query.slice(0, 28)}"*  ·  📦 ${results.length}`,
        `│`,
      ];
      results.slice(0, 15).forEach((r, i) => {
        const tag = r.type === 'tvshows' ? '📺 Series' : '🎥 Movie';
        const y = r.year ? ` · ${r.year}` : '';
        lines.push(`│  *${i + 1}.* ${clean(r.title, 42)}`);
        lines.push(`│     ${tag}${y}${r.quality && r.quality !== 'N/A' ? ` · ${r.quality}` : ''}`);
      });
      lines.push(`│`, `│  👇 *${prefix}moviebox <number>*  තෝරන්න`);
      const list = box('│  🎬 *MOVIEBOX — RESULTS*', lines);

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      if (results[0].image && /^https?:\/\//i.test(results[0].image)) {
        await sock.sendMessage(from, { image: { url: results[0].image }, caption: list }, { quoted: msg })
          .catch(() => sock.sendMessage(from, { text: list }, { quoted: msg }).catch(() => {}));
      } else {
        await sock.sendMessage(from, { text: list }, { quoted: msg }).catch(() => {});
      }
    } catch (err) {
      console.error('[MovieBox] search:', err.message);
      if (loading) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
    }
  },
};
