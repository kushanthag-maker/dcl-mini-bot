const axios = require('axios');
const config = require('../../config');
const {
  sendSelectList,
  sendQuickReplies,
  sendUrlButtons,
} = require('../../lib/sendButtons');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/movies/baiscope/search';
const INFO_API = 'https://api.chamindu.site/api/v1/movies/baiscope/infodl';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const PENDING_TTL_MS = 4 * 60 * 1000;

const pending = new Map();
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function foot() {
  return `\n🌸 *Pair:* ${SITE}\n> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`;
}

function setPending(from, state) {
  const old = pending.get(from);
  if (old?.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
  pending.set(from, state);
}

function getInteractiveId(msg) {
  const m = msg.message || {};
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
  if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId)
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  const nf = m.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nf?.paramsJson) {
    try {
      const p = JSON.parse(nf.paramsJson);
      return p.id || p.selectedRowId || p.button_id || null;
    } catch (_) {}
  }
  // viewOnce unwrap
  const vo =
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2?.message ||
    m.ephemeralMessage?.message;
  if (vo) return getInteractiveId({ message: vo });
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
    .filter((r) => r && (r.link || r.url))
    .slice(0, 10)
    .map((r, i) => ({
      index: i,
      title: r.title || 'Untitled',
      link: r.link || r.url,
      image: r.image || null,
      type: r.type || 'movie',
      rating: r.rating || 'N/A',
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
  return res.data.data || res.data.result || res.data;
}

async function showSearch({ sock, msg, from, query, results }) {
  setPending(from, { type: 'search', results });

  const text =
    `╭───「 💖 *BAISCOPE* 」───╮\n│\n` +
    `│  🔎 *Search* › ${String(query).slice(0, 36)}\n` +
    `│  📦 *Found*  › ${results.length}\n│\n` +
    `│  🌸 Tap *Open menu* below\n` +
    `│  💗 Pick your title, babe\n│\n` +
    `╰──────────────────────╯` +
    foot();

  const rows = results.map((r, i) => ({
    id: `baiscope_s_${i}`,
    title: `${i + 1}. ${String(r.title).slice(0, 20)}`,
    description: `✨ ${r.type} · ⭐ ${r.rating}`,
  }));

  try {
    await sendSelectList(sock, from, {
      text,
      footer: FOOTER,
      title: '💕 Baiscope',
      buttonText: '🌸 Open menu',
      rows,
      quoted: msg,
      imageUrl: results[0]?.image || null,
    });
    return;
  } catch (e) {
    console.error('[baiscope] select list fail:', e.message);
  }

  // Fallback quick replies (3)
  try {
    await sendQuickReplies(sock, from, {
      text: text + '\n\n' + results.map((r, i) => `*${i + 1}.* ${r.title}`).join('\n'),
      footer: FOOTER,
      buttons: results.slice(0, 3).map((r, i) => ({
        id: `baiscope_s_${i}`,
        text: `💗 ${i + 1}`,
      })),
      quoted: msg,
      imageUrl: results[0]?.image,
    });
    return;
  } catch (e2) {
    console.error('[baiscope] quick reply fail:', e2.message);
  }

  // Last fallback — number
  let plain = text + '\n';
  results.forEach((r, i) => {
    plain += `\n*${i + 1}.* ${r.title}`;
  });
  plain += `\n\n👇 \`${config.prefix || '.'}baiscope <number>\``;
  await sock.sendMessage(from, { text: plain }, { quoted: msg });
}

async function showInfo({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🌸✨ *Loading details...*' },
    { quoted: msg }
  );

  try {
    const info = await infoApi(item.link);
    const title = info.title || item.title || 'Baiscope';
    const image = info.image || item.image || null;
    const imdb = info.imdb || item.rating || 'N/A';
    const director = info.director || 'N/A';
    const language = info.language || 'N/A';
    const genres = Array.isArray(info.genres) ? info.genres.join(', ') : info.genres || 'N/A';
    const story = String(info.story || '').slice(0, 180);
    const downloads = Array.isArray(info.downloads)
      ? info.downloads.filter((d) => d && (d.link || d.url)).slice(0, 10)
      : [];

    setPending(from, {
      type: 'dl',
      title,
      downloads: downloads.map((d, i) => ({
        index: i,
        name: d.name || `Link ${i + 1}`,
        link: d.link || d.url,
      })),
    });

    const text =
      `╭───「 💖 *BAISCOPE* 」───╮\n│\n` +
      `│  👑 *Title* › ${String(title).slice(0, 46)}\n` +
      `│  ⭐ *IMDb*  › ${imdb}\n` +
      `│  🎬 *Director* › ${String(director).slice(0, 28)}\n` +
      `│  🗣️ *Language* › ${language}\n` +
      `│  🎀 *Genres* › ${String(genres).slice(0, 36)}\n│\n` +
      (story ? `│  📝 ${story}…\n│\n` : '') +
      `│  📥 *${downloads.length}* download(s)\n` +
      `│  💕 Open menu or tap a link\n│\n` +
      `╰──────────────────────╯` +
      foot();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (!downloads.length) {
      await sock.sendMessage(from, { text: text + '\n🥺 No links' }, { quoted: msg });
      return;
    }

    // URL buttons for first 2 + select for all
    try {
      await sendSelectList(sock, from, {
        text,
        footer: FOOTER,
        title: '📥 Downloads',
        buttonText: '💗 Pick link',
        rows: downloads.map((d, i) => ({
          id: `baiscope_d_${i}`,
          title: `Link ${i + 1}`,
          description: String(d.name).replace(/🎥/g, '🎬').slice(0, 40),
        })),
        quoted: msg,
        imageUrl: image,
      });
    } catch (e) {
      console.error('[baiscope] dl select fail:', e.message);
      try {
        await sendUrlButtons(sock, from, {
          text,
          footer: FOOTER,
          buttons: downloads.slice(0, 3).map((d, i) => ({
            text: `💗 Link ${i + 1}`,
            url: d.link,
          })),
          quoted: msg,
        });
      } catch (e2) {
        let plain = text + '\n';
        downloads.forEach((d, i) => {
          plain += `\n*${i + 1}.* ${d.name}\n${d.link}`;
        });
        await sock.sendMessage(from, { text: plain }, { quoted: msg });
      }
    }
  } catch (err) {
    console.error('Baiscope info:', err.message);
    await sock
      .sendMessage(from, { text: `❌💔 \`${err.message}\``, edit: loading.key })
      .catch(() => {});
  }
}

async function sendLink({ sock, msg, from, dl, title }) {
  const text =
    `╭───「 💕 *YOUR LINK* 」───╮\n│\n` +
    `│  👑 *${String(title).slice(0, 42)}*\n` +
    `│  💗 ${String(dl.name).slice(0, 42)}\n│\n` +
    `│  🔗 ${dl.link}\n│\n` +
    `╰──────────────────────╯` +
    foot();

  try {
    await sendUrlButtons(sock, from, {
      text,
      footer: FOOTER,
      buttons: [{ text: '💗 Open download', url: dl.link }],
      quoted: msg,
    });
  } catch (_) {
    await sock.sendMessage(from, { text }, { quoted: msg });
  }
}

module.exports = {
  name: 'baiscope',
  aliases: ['bais', 'baiscopedl', 'bscope'],
  description: 'Search Baiscope movies with buttons',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';
    const iid =
      getInteractiveId(msg) ||
      (args[0] && /^baiscope_[sd]_\d+$/.test(args[0]) ? args[0] : null);

    if (iid && /^baiscope_s_(\d+)$/.test(iid)) {
      const idx = parseInt(iid.split('_').pop(), 10);
      const state = pending.get(from);
      if (!state?.results?.[idx]) {
        return sock.sendMessage(
          from,
          { text: `🥺 Session expired\n💡 \`${prefix}baiscope <name>\`` },
          { quoted: msg }
        );
      }
      return showInfo({ sock, msg, from, item: state.results[idx] });
    }

    if (iid && /^baiscope_d_(\d+)$/.test(iid)) {
      const idx = parseInt(iid.split('_').pop(), 10);
      const state = pending.get(from);
      if (!state?.downloads?.[idx]) {
        return sock.sendMessage(from, { text: '🥺 Session expired 💕' }, { quoted: msg });
      }
      return sendLink({
        sock,
        msg,
        from,
        dl: state.downloads[idx],
        title: state.title,
      });
    }

    // Number fallback
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const n = parseInt(args[0], 10);
      const state = pending.get(from);
      if (state?.type === 'search') {
        const item = state.results[n - 1];
        if (!item) {
          return sock.sendMessage(
            from,
            { text: `❌ Pick 1–${state.results.length}` },
            { quoted: msg }
          );
        }
        return showInfo({ sock, msg, from, item });
      }
      if (state?.type === 'dl') {
        const dl = state.downloads[n - 1];
        if (!dl) {
          return sock.sendMessage(
            from,
            { text: `❌ Pick 1–${state.downloads.length}` },
            { quoted: msg }
          );
        }
        return sendLink({ sock, msg, from, dl, title: state.title });
      }
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 💖 *BAISCOPE* 」───╮\n│\n` +
            `│  ${prefix}baiscope <movie name>\n│\n` +
            `│  Example: ${prefix}baiscope Avatar\n│\n` +
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
        return sock.sendMessage(from, { text: '🥺 No results' }, { quoted: msg });
      }
      await showSearch({ sock, msg, from, query, results });
    } catch (err) {
      console.error('Baiscope:', err.message);
      await sock
        .sendMessage(from, { text: `❌💔 \`${err.message}\``, edit: loading.key })
        .catch(() => {});
    }
  },
};
