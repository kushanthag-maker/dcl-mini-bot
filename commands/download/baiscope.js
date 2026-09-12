const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/movies/baiscope/search';
const INFO_API = 'https://api.chamindu.site/api/v1/movies/baiscope/infodl';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const PENDING_TTL_MS = 3 * 60 * 1000;

const pending = new Map();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function foot() {
  return `🌸 Pair me: ${SITE}\n> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`;
}

function setPending(from, state) {
  const old = pending.get(from);
  if (old?.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
  pending.set(from, state);
}

function getButtonId(msg) {
  const m = msg.message || {};
  return (
    m.buttonsResponseMessage?.selectedButtonId ||
    m.templateButtonReplyMessage?.selectedId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    null
  );
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

/** Send search results with LIST (button menu) — no number reply */
async function sendSearchList({ sock, msg, from, query, results }) {
  setPending(from, { type: 'search', results });

  const caption =
    `╭───「 💖 *BAISCOPE* 」───╮\n│\n` +
    `│  🔎 *Search:* ${String(query).slice(0, 40)}\n` +
    `│  📦 *Found:* ${results.length} titles\n│\n` +
    `│  🌸 Tap a button below, babe\n` +
    `│  💗 Pick your favorite show\n│\n` +
    `╰──────────────────────╯\n` +
    foot();

  const rows = results.map((r, i) => ({
    title: `${i + 1}. ${String(r.title).slice(0, 22)}`,
    description: `✨ ${r.type} · ⭐ ${r.rating}`,
    rowId: `baiscope_s_${i}`,
  }));

  // List message (selection UI)
  try {
    await sock.sendMessage(
      from,
      {
        text: caption,
        footer: FOOTER,
        title: '💕 Baiscope Results',
        buttonText: '🌸 Open list',
        sections: [
          {
            title: '💗 Select a title',
            rows,
          },
        ],
      },
      { quoted: msg }
    );
    return;
  } catch (e1) {
    console.error('Baiscope list fail:', e1.message);
  }

  // Fallback: up to 3 quick buttons + image
  const buttons = results.slice(0, 3).map((r, i) => ({
    buttonId: `baiscope_s_${i}`,
    buttonText: { displayText: `💗 ${i + 1}. ${String(r.title).slice(0, 18)}` },
    type: 1,
  }));

  try {
    if (results[0].image) {
      await sock.sendMessage(
        from,
        {
          image: { url: results[0].image },
          caption,
          footer: FOOTER,
          buttons,
          headerType: 4,
        },
        { quoted: msg }
      );
    } else {
      await sock.sendMessage(
        from,
        {
          text: caption,
          footer: FOOTER,
          buttons,
          headerType: 1,
        },
        { quoted: msg }
      );
    }
  } catch (e2) {
    // Ultimate fallback text (still no numbers required if buttons worked elsewhere)
    let text = caption + '\n';
    results.forEach((r, i) => {
      text += `\n*${i + 1}.* ${r.title}\n`;
    });
    text += `\n_Buttons unavailable — reply .baiscope s1 / s2_`;
    await sock.sendMessage(from, { text }, { quoted: msg });
  }
}

async function sendInfoWithButtons({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🌸✨ *Loading details for you...*' },
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
    const story = String(info.story || '').slice(0, 220);
    const downloads = Array.isArray(info.downloads)
      ? info.downloads.filter((d) => d && (d.link || d.url)).slice(0, 10)
      : [];

    setPending(from, {
      type: 'dl',
      title,
      image,
      downloads: downloads.map((d, i) => ({
        index: i,
        name: d.name || `Link ${i + 1}`,
        link: d.link || d.url,
      })),
    });

    const caption =
      `╭───「 💖 *BAISCOPE* 」───╮\n│\n` +
      `│  👑 *Title* › ${String(title).slice(0, 48)}\n` +
      `│  ⭐ *IMDb*  › ${imdb}\n` +
      `│  🎬 *Director* › ${String(director).slice(0, 30)}\n` +
      `│  🗣️ *Language* › ${language}\n` +
      `│  🎀 *Genres* › ${String(genres).slice(0, 40)}\n│\n` +
      (story ? `│  📝 ${story}${story.length >= 220 ? '…' : ''}\n│\n` : '') +
      `│  💗 *${downloads.length}* download link(s)\n` +
      `│  🌸 Tap a button to get your link\n│\n` +
      `╰──────────────────────╯\n` +
      foot();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (!downloads.length) {
      await sock.sendMessage(from, { text: caption + '\n🥺 No download links found' }, { quoted: msg });
      return;
    }

    const rows = downloads.map((d, i) => ({
      title: `💕 Link ${i + 1}`,
      description: String(d.name).replace(/🎥/g, '🎬').slice(0, 40),
      rowId: `baiscope_d_${i}`,
    }));

    try {
      if (image) {
        await sock.sendMessage(
          from,
          { image: { url: image }, caption },
          { quoted: msg }
        );
      }
      await sock.sendMessage(
        from,
        {
          text: `🌸 *Pick a download, sweetheart*\n👑 ${String(title).slice(0, 40)}`,
          footer: FOOTER,
          title: '💗 Download links',
          buttonText: '✨ Open',
          sections: [{ title: '📥 Links', rows }],
        },
        { quoted: msg }
      );
    } catch (e) {
      // 3 buttons fallback
      const buttons = downloads.slice(0, 3).map((d, i) => ({
        buttonId: `baiscope_d_${i}`,
        buttonText: { displayText: `💖 Link ${i + 1}` },
        type: 1,
      }));
      try {
        await sock.sendMessage(
          from,
          {
            text: caption,
            footer: FOOTER,
            buttons,
            headerType: 1,
          },
          { quoted: msg }
        );
      } catch (e2) {
        let t = caption + '\n';
        downloads.forEach((d, i) => {
          t += `\n*${i + 1}.* ${d.name}\n${d.link}\n`;
        });
        await sock.sendMessage(from, { text: t }, { quoted: msg });
      }
    }
  } catch (err) {
    console.error('Baiscope info:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💔 \`${err.message}\`\n` + foot(),
        edit: loading.key,
      })
      .catch(() => {});
  }
}

async function sendDlLink({ sock, msg, from, dl, title }) {
  const text =
    `╭───「 💕 *YOUR LINK* 」───╮\n│\n` +
    `│  👑 *${String(title).slice(0, 42)}*\n` +
    `│  💗 ${String(dl.name).slice(0, 42)}\n│\n` +
    `│  🔗 ${dl.link}\n│\n` +
    `│  🌸 Tap the link to open, babe\n` +
    `╰──────────────────────╯\n` +
    foot();

  await sock.sendMessage(from, { text }, { quoted: msg });
}

module.exports = {
  name: 'baiscope',
  aliases: ['bais', 'baiscopedl', 'bscope'],
  description: 'Search Baiscope movies (button UI)',
  category: 'download',

  async execute({ sock, msg, from, args, body }) {
    const prefix = config.prefix || '.';

    // ----- Button / list replies -----
    const btnId = getButtonId(msg) || (args[0] && String(args[0])) || '';
    const btnStr = typeof btnId === 'string' ? btnId : '';

    // fallback: .baiscope s0 / d0
    let m = btnStr.match(/^baiscope_s_(\d+)$/) || (args[0] && String(args[0]).match(/^s(\d+)$/));
    if (m) {
      const idx = parseInt(m[1], 10);
      const state = pending.get(from);
      if (!state || state.type !== 'search' || !state.results?.[idx]) {
        return sock.sendMessage(
          from,
          { text: `🥺 Session expired\n💡 Try \`${prefix}baiscope <name>\` again\n` + foot() },
          { quoted: msg }
        );
      }
      return sendInfoWithButtons({ sock, msg, from, item: state.results[idx] });
    }

    m = btnStr.match(/^baiscope_d_(\d+)$/) || (args[0] && String(args[0]).match(/^d(\d+)$/));
    if (m) {
      const idx = parseInt(m[1], 10);
      const state = pending.get(from);
      if (!state || state.type !== 'dl' || !state.downloads?.[idx]) {
        return sock.sendMessage(
          from,
          { text: `🥺 Session expired\n💡 Search again, queen\n` + foot() },
          { quoted: msg }
        );
      }
      return sendDlLink({
        sock,
        msg,
        from,
        dl: state.downloads[idx],
        title: state.title,
      });
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 💖 *BAISCOPE* 」───╮\n│\n` +
            `│  🌸 ${prefix}baiscope <movie / show>\n│\n` +
            `│  📌 Example:\n` +
            `│  ${prefix}baiscope Avatar\n` +
            `│  ${prefix}baiscope Spider Man\n│\n` +
            `│  💗 Button select — no typing numbers\n` +
            `│  ✨ Soft & sweet for you\n│\n` +
            `╰──────────────────────╯\n` +
            foot(),
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const loading = await sock.sendMessage(
      from,
      { text: '🔍💕 *Searching Baiscope for you...*' },
      { quoted: msg }
    );

    try {
      const results = await searchApi(query);
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (!results.length) {
        return sock.sendMessage(
          from,
          { text: '🥺 No results, try another name\n' + foot() },
          { quoted: msg }
        );
      }

      await sendSearchList({ sock, msg, from, query, results });
    } catch (err) {
      console.error('Baiscope search:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌💔 \`${err.message}\`\n` + foot(),
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
