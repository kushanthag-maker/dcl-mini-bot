const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/movies/cinesubz/tv/search';
const DL_API     = 'https://api.chamindu.site/api/v1/movies/cinesubz/infodl';
const BOT_LINK   = 'https://dark-queen.vercel.app/';      // footer link
const MAX_SEND_BYTES = 2 * 1024 * 1024 * 1024;            // 2GB WA document limit

const pending = new Map(); // from -> state
const BAR = '━'.repeat(30);

/* ---------------- helpers ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s]+(?:cinesubz\.lk|cinesubz\.net)\/[^\s]+/i);
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}
function clean(str, len = 60) {
  const s = String(str || 'N/A').replace(/\s*\|\s*සිංහල.*/i, '').trim();
  return s.length > len ? s.slice(0, len) + '…' : s;
}
function footer() {
  return `╰${BAR}╯\n🖤 *Dark Queen*  •  Pair/Status: ${BOT_LINK}`;
}

/* ---------------- API calls ---------------- */
async function fetchSearch(query) {
  const res = await axios.get(SEARCH_API, {
    params: { q: query, api_key: API_KEY },
    timeout: 45000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.status !== true) {
    throw new Error((res.data && res.data.message) || `Search HTTP ${res.status}`);
  }
  return Array.isArray(res.data.data) ? res.data.data : [];
}

async function fetchInfo(url) {
  const res = await axios.get(DL_API, {
    params: { q: url, api_key: API_KEY },
    timeout: 60000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.status !== true || !res.data.data) {
    throw new Error((res.data && res.data.message) || `Info HTTP ${res.status}`);
  }
  return res.data.data; // full movie object
}

/* ---------------- pretty builders ---------------- */
function buildPosterCard(info, dlCount) {
  const g = (info.genres || []).filter((x) => !/^#/.test(x)).join(', ') || 'N/A';
  let t = `╭${BAR}╮\n`;
  t += `│  🎬 *${clean(info.title, 38)}*\n`;
  t += `│\n│  ⭐ *Rating:* ${info.rating || 'N/A'}   🎥 *${info.quality || 'N/A'}*\n`;
  t += `│  📅 *${info.year || 'N/A'}*   ⏱️ *${info.duration || 'N/A'}*\n`;
  t += `│  🗣️ *${info.language || 'N/A'}*\n`;
  t += `│  🎬 *Director:* ${clean(info.director, 40)}\n`;
  t += `│  🏷️ *${g}*\n`;
  t += `│\n│  👇 Details + story doc එකක් ලෙස එව්වා 👇\n`;
  return t + footer();
}

function buildMenuText(info) {
  const dls = info.downloads || [];
  let t = `╭${BAR}╮\n`;
  t += `│  ⬇️ *DOWNLOAD LINKS*  (${dls.length})\n`;
  t += `│\n`;
  if (!dls.length) {
    t += `│  ❌ Download links නැහැ\n`;
  } else {
    dls.forEach((d, i) => {
      t += `│  *${i + 1}.* ${clean(d.quality, 34)}\n`;
      t += `│     📦 ${d.size || 'N/A'}  ·  🌐 ${d.language || ''}\n`;
    });
  }
  t += `│\n│  👇 ${config.prefix || '.'}cinesubz <number>  → stream/download\n`;
  return t + footer();
}

function buildInfoDoc(info) {
  const cast = (info.cast || []).map((c) => `• ${c.name} — ${c.role}`).join('\n') || 'N/A';
  const dls  = info.downloads || [];
  const dTxt = dls.length
    ? dls.map((d, i) => `${i + 1}. [${d.quality}] (${d.size || '?'}) ${d.language || ''}\n   ${d.link}`).join('\n\n')
    : 'Download links නැහැ.';

  let t = '';
  t += `🎬 *CINESUBZ MOVIE DETAILS*\n`;
  t += `═${BAR}═\n\n`;
  t += `🖼️ *Poster:* ${info.image}\n\n`;
  t += `🎬 *Title:* ${info.title}\n`;
  t += `⭐ *Rating:* ${info.rating || 'N/A'}   🎥 *Quality:* ${info.quality || 'N/A'}\n`;
  t += `📽️ *IMDb:* ${info.imdb || 'N/A'}\n`;
  t += `🎬 *Director:* ${info.director || 'N/A'}\n`;
  t += `🗣️ *Language:* ${info.language || 'N/A'}\n`;
  t += `📅 *Year:* ${info.year || 'N/A'}   ⏱️ *Duration:* ${info.duration || 'N/A'}\n`;
  t += `🌍 *Country:* ${info.country || 'N/A'}\n`;
  t += `🏷️ *Genres:* ${(info.genres || []).filter((x) => !/^#/.test(x)).join(', ') || 'N/A'}\n`;
  t += `🔗 *Page:* ${info.pageUrl || ''}\n\n`;
  t += `📖 *Story:*\n${(info.story || 'N/A').slice(0, 1500)}\n\n`;
  t += `🎭 *Cast:*\n${cast}\n\n`;
  t += `▶️ *Trailer:* ${info.trailer || 'N/A'}\n\n`;
  t += `⬇️ *DOWNLOAD LINKS:*\n${dTxt}\n\n`;
  t += `🖤 Dark Queen  •  Pair/Status: ${BOT_LINK}\n`;
  return t;
}

/* ---------------- media sending ---------------- */
function safeFileName(title) {
  const base = String(title || 'Cinesubz_Movie')
    .replace(/[^\w\u0d80-\u0dff\- ]+/g, '')
    .replace(/[ ]+/g, '_')
    .slice(0, 70);
  return base + '.txt';
}

async function sendDetailCard(sock, from, msg, info) {
  // 1) Poster image + nice caption card
  if (/^https?:\/\//i.test(info.image || '')) {
    await sock
      .sendMessage(
        from,
        { image: { url: info.image }, caption: buildPosterCard(info, (info.downloads || []).length) },
        { quoted: msg }
      )
      .catch(() => {});
  }

  // 2) Full detail card as a TEXT DOCUMENT (footer link inside)
  const docText = Buffer.from(buildInfoDoc(info), 'utf8');
  await sock
    .sendMessage(
      from,
      {
        document: docText,
        mimetype: 'text/plain',
        fileName: safeFileName(info.title),
        caption: `🎬 *Movie Details*  📄\n${clean(info.title, 60)}\n🖤 ${BOT_LINK}`,
      },
      { quoted: msg }
    )
    .catch(() => {});

  // 3) Download menu (numbered) — as text + optional poster again is skipped
  await sock.sendMessage(from, { text: buildMenuText(info) }, { quoted: msg }).catch(() => {});
}

async function streamQuality(sock, from, msg, info, dl) {
  const fileName = clean(info.title, 60).replace(/[^\w\u0d80-\u0dff\- ]+/g, '').trim() || 'Cinesubz_movie';

  // Stream via URL = ZERO RAM buffer on our side (Baileys fetches directly)
  try {
    const sent = await sock.sendMessage(
      from,
      {
        document: { url: dl.link },
        mimetype: 'video/mp4',
        fileName: `${fileName}_${clean(dl.quality, 30).replace(/[^\w\- ]+/g, '').trim()}.mp4`,
        caption: `🎬 ${info.title}\n🎥 ${dl.quality}  ·  📦 ${dl.size || 'N/A'}\n🖤 ${BOT_LINK}`,
      },
      { quoted: msg }
    );
    if (sent) return;
    throw new Error('stream-empty');
  } catch (e1) {
    console.error('[Cinesubz] URL stream fail:', e1.message);
  }

  // Fallback: buffer download (only for small files → keeps RAM low)
  const statusMsg = await sock
    .sendMessage(from, { text: '🔄 *Buffer download fallback...*' }, { quoted: msg })
    .catch(() => null);

  let buf = null;
  try {
    const b = await axios.get(dl.link, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: MAX_SEND_BYTES,
    });
    buf = b.data;
  } catch (e) {
    console.error('[Cinesubz] buffer fail:', e.message);
  }

  if (statusMsg) await sock.sendMessage(from, { delete: statusMsg.key }).catch(() => {});

  if (!buf || buf.length < 10000) {
    return sock
      .sendMessage(
        from,
        { text: `❌ Download fail.\n💡 ${dl.link}\n\nඔයාටම link එකෙන් download කරන්න පුළුවන්.` },
        { quoted: msg }
      )
      .catch(() => {});
  }

  await sock
    .sendMessage(
      from,
      {
        document: buf,
        mimetype: 'video/mp4',
        fileName: `${fileName}.mp4`,
        caption: `🎬 ${clean(info.title, 60)}\n🎥 ${dl.quality}  ·  📦 ${(buf.length / 1048576).toFixed(1)} MB\n🖤 ${BOT_LINK}`,
      },
      { quoted: msg }
    )
    .catch(() => {});
}

async function showDownloadMenu(sock, from, msg, link, title) {
  const loading = await sock.sendMessage(from, { text: '⏳ *Details ලබාගන්නවා...*' }, { quoted: msg }).catch(() => null);
  try {
    const info = await fetchInfo(link);
    if (loading) await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
    info.pageUrl = link;
    pending.set(from, { type: 'download', info, timeout: setTimeout(() => pending.delete(from), 3 * 60 * 1000) });
    await sendDetailCard(sock, from, msg, info);
  } catch (err) {
    if (loading) {
      await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
    }
  }
}

/* ---------------- command ---------------- */
module.exports = {
  name: 'cinesubz',
  aliases: ['csub', 'sinhalasubz'],
  description: 'Search & download CineSubz (සිංහල සබ්ටයිටල්) movies',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // ---- number selection (search pick OR download pick) ----
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const state = pending.get(from);

      if (state?.type === 'download') {
        const dls = state.info.downloads || [];
        if (idx < 0 || idx >= dls.length) {
          return sock.sendMessage(from, { text: `❌ *1*–*${dls.length}* අතර number එකක් දෙන්න.` }, { quoted: msg });
        }
        const dl = dls[idx];
        return streamQuality(sock, from, msg, state.info, dl);
      }

      if (state?.type === 'search') {
        if (idx < 0 || idx >= state.results.length) {
          return sock.sendMessage(from, { text: `❌ *1*–*${state.results.length}* අතර number එකක් දෙන්න.` }, { quoted: msg });
        }
        const item = state.results[idx];
        if (state.timeout) clearTimeout(state.timeout);
        return showDownloadMenu(sock, from, msg, item.link, item.title);
      }

      return sock.sendMessage(from, { text: `❌ Active search නැහැ.\n💡 \`${prefix}cinesubz <movie>\`` }, { quoted: msg });
    }

    // ---- help ----
    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭${BAR}╮\n│  🎬 *CINESUBZ*  (සිංහල සබ්)\n│\n│  ${prefix}cinesubz <movie name>\n│  ${prefix}cinesubz <number>   ← pick movie\n│  ${prefix}cinesubz <number>   ← pick quality\n│  ${prefix}cinesubz <cinesubz link>\n│\n│  📌 Example:\n│  ${prefix}cinesubz avatar\n│  ${prefix}cinesubz 1\n│  ${prefix}cinesubz 2\n│\n│  ⏳ session 3 min\n${footer()}`,
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();

    // ---- direct link mode ----
    const direct = extractUrl(query);
    if (direct) return showDownloadMenu(sock, from, msg, direct, 'CineSubz');

    const loading = await sock.sendMessage(from, { text: '🔍 *CineSubz search කරමින්...*' }, { quoted: msg }).catch(() => null);

    try {
      const results = await fetchSearch(query);
      if (!results.length) {
        return sock.sendMessage(from, { text: '❌ Results හමු නොවීය.', edit: loading.key }).catch(() => {});
      }

      pending.set(from, { type: 'search', results, timeout: setTimeout(() => pending.delete(from), 3 * 60 * 1000) });

      let list = `╭${BAR}╮\n│  🎬 *CINESUBZ — RESULTS*\n│  🔎 "${query.slice(0, 30)}"  ·  📦 ${results.length}\n│\n`;
      results.forEach((r, i) => {
        list += `│  *${i + 1}.* ${clean(r.title, 40)}\n│     ${r.type === 'tvshows' ? '📺 Series' : '🎥 Movie'} · ⭐ ${r.rating || 'N/A'}\n`;
      });
      list += `│\n│  👇 *${prefix}cinesubz <number>*  තෝරන්න\n${footer()}`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // show first result poster with caption list (pretty)
      if (results[0].image && /^https?:\/\//i.test(results[0].image)) {
        await sock
          .sendMessage(from, { image: { url: results[0].image }, caption: list }, { quoted: msg })
          .catch(() => sock.sendMessage(from, { text: list }, { quoted: msg }).catch(() => {}));
      } else {
        await sock.sendMessage(from, { text: list }, { quoted: msg }).catch(() => {});
      }
    } catch (err) {
      console.error('[Cinesubz] search:', err.message);
      if (loading) {
        await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
      }
    }
  },
};
