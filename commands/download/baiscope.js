const axios = require('axios');
const config = require('../../config');

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
      index: i + 1,
      title: r.title || 'Untitled',
      link: r.link || r.url,
      image: r.image || null,
      type: r.type || 'movie',
      quality: r.quality || 'N/A',
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

/** Try simple 3 quick-reply style buttons (waileys / some forks) */
async function trySimpleButtons(sock, from, msg, caption, buttons) {
  // Format A — classic
  try {
    await sock.sendMessage(
      from,
      {
        text: caption,
        footer: FOOTER,
        buttons: buttons.map((b) => ({
          buttonId: b.id,
          buttonText: { displayText: b.text },
          type: 1,
        })),
        headerType: 1,
      },
      { quoted: msg }
    );
    return true;
  } catch (e) {
    console.log('[baiscope] classic buttons fail:', e.message);
  }

  // Format B — interactiveButtons quick_reply
  try {
    await sock.sendMessage(
      from,
      {
        text: caption,
        footer: FOOTER,
        interactiveButtons: buttons.map((b) => ({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({
            display_text: b.text,
            id: b.id,
          }),
        })),
      },
      { quoted: msg }
    );
    return true;
  } catch (e) {
    console.log('[baiscope] interactiveButtons fail:', e.message);
  }
  return false;
}

async function showSearch({ sock, msg, from, query, results }) {
  setPending(from, { type: 'search', results });

  let list =
    `╭───「 💖 *BAISCOPE* 」───╮\n│\n` +
    `│  🔎 *Search* › ${String(query).slice(0, 36)}\n` +
    `│  📦 *Found*  › ${results.length}\n│\n`;

  results.forEach((r) => {
    list += `│  *${r.index}.* ${String(r.title).slice(0, 42)}\n`;
    list += `│      ✨ ${r.type} · ⭐ ${r.rating}\n`;
  });

  list +=
    `\n│  👇 *${config.prefix || '.'}baiscope <number>*\n` +
    `│  💗 Reply with a number, babe\n` +
    `╰──────────────────────╯` +
    foot();

  // Image + caption (always works)
  if (results[0]?.image) {
    try {
      await sock.sendMessage(
        from,
        { image: { url: results[0].image }, caption: list },
        { quoted: msg }
      );
    } catch (_) {
      await sock.sendMessage(from, { text: list }, { quoted: msg });
    }
  } else {
    await sock.sendMessage(from, { text: list }, { quoted: msg });
  }

  // Optional: try 3 buttons for first results (may not show on all WA)
  const btns = results.slice(0, 3).map((r) => ({
    id: `baiscope_s_${r.index - 1}`,
    text: `💗 ${r.index}. ${String(r.title).slice(0, 16)}`,
  }));
  await trySimpleButtons(sock, from, msg, '🌸 Or tap a button (if visible):', btns);
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
    const story = String(info.story || '').slice(0, 200);
    const downloads = Array.isArray(info.downloads)
      ? info.downloads.filter((d) => d && (d.link || d.url)).slice(0, 12)
      : [];

    setPending(from, {
      type: 'dl',
      title,
      image,
      downloads: downloads.map((d, i) => ({
        index: i + 1,
        name: d.name || `Link ${i + 1}`,
        link: d.link || d.url,
      })),
    });

    let caption =
      `╭───「 💖 *BAISCOPE* 」───╮\n│\n` +
      `│  👑 *Title* › ${String(title).slice(0, 46)}\n` +
      `│  ⭐ *IMDb*  › ${imdb}\n` +
      `│  🎬 *Director* › ${String(director).slice(0, 28)}\n` +
      `│  🗣️ *Language* › ${language}\n` +
      `│  🎀 *Genres* › ${String(genres).slice(0, 36)}\n│\n` +
      (story ? `│  📝 ${story}${story.length >= 200 ? '…' : ''}\n│\n` : '') +
      `│  📥 *Download links:*\n`;

    downloads.forEach((d, i) => {
      caption += `│  *${i + 1}.* ${String(d.name).replace(/🎥/g, '🎬').slice(0, 40)}\n`;
    });

    caption +=
      `\n│  👇 *${config.prefix || '.'}baiscope <number>*\n` +
      `│  💕 Get your link\n` +
      `╰──────────────────────╯` +
      foot();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (image) {
      try {
        await sock.sendMessage(from, { image: { url: image }, caption }, { quoted: msg });
      } catch (_) {
        await sock.sendMessage(from, { text: caption }, { quoted: msg });
      }
    } else {
      await sock.sendMessage(from, { text: caption }, { quoted: msg });
    }

    if (downloads.length) {
      const btns = downloads.slice(0, 3).map((d, i) => ({
        id: `baiscope_d_${i}`,
        text: `💖 Link ${i + 1}`,
      }));
      await trySimpleButtons(sock, from, msg, '🌸 Or tap (if buttons show):', btns);
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
    `│  🌸 Open in browser to download\n` +
    `│  💡 Host has no direct MP4 for WA doc\n` +
    `╰──────────────────────╯` +
    foot();
  await sock.sendMessage(from, { text }, { quoted: msg });
}

module.exports = {
  name: 'baiscope',
  aliases: ['bais', 'baiscopedl', 'bscope'],
  description: 'Search Baiscope movies',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // Button / interactive id
    const iid = getInteractiveId(msg) || (args[0] && /^baiscope_[sd]_/.test(args[0]) ? args[0] : null);

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
        return sock.sendMessage(from, { text: `🥺 Session expired 💕` }, { quoted: msg });
      }
      return sendLink({
        sock,
        msg,
        from,
        dl: state.downloads[idx],
        title: state.title,
      });
    }

    // Number select (cinesubz style — always works)
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const n = parseInt(args[0], 10);
      const state = pending.get(from);

      if (state?.type === 'search') {
        const item = state.results.find((r) => r.index === n) || state.results[n - 1];
        if (!item) {
          return sock.sendMessage(
            from,
            { text: `❌ Pick *1*–*${state.results.length}* 💕` },
            { quoted: msg }
          );
        }
        return showInfo({ sock, msg, from, item });
      }

      if (state?.type === 'dl') {
        const dl = state.downloads.find((d) => d.index === n) || state.downloads[n - 1];
        if (!dl) {
          return sock.sendMessage(
            from,
            { text: `❌ Pick *1*–*${state.downloads.length}* 💕` },
            { quoted: msg }
          );
        }
        return sendLink({ sock, msg, from, dl, title: state.title });
      }

      return sock.sendMessage(
        from,
        { text: `🥺 No active search\n💡 \`${prefix}baiscope Avatar\`` },
        { quoted: msg }
      );
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 💖 *BAISCOPE* 」───╮\n│\n` +
            `│  ${prefix}baiscope <movie name>\n` +
            `│  ${prefix}baiscope <number>\n│\n` +
            `│  Example:\n` +
            `│  ${prefix}baiscope Avatar\n` +
            `│  ${prefix}baiscope 1\n│\n` +
            `╰──────────────────────╯` +
            foot(),
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const loading = await sock.sendMessage(
      from,
      { text: '🔍💕 *Searching for you...*' },
      { quoted: msg }
    );

    try {
      const results = await searchApi(query);
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      if (!results.length) {
        return sock.sendMessage(from, { text: '🥺 No results found' }, { quoted: msg });
      }
      await showSearch({ sock, msg, from, query, results });
    } catch (err) {
      console.error('Baiscope search:', err.message);
      await sock
        .sendMessage(from, { text: `❌💔 \`${err.message}\``, edit: loading.key })
        .catch(() => {});
    }
  },
};
