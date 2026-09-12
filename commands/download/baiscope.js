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

function footLine() {
  return `🌸 Pair: ${SITE} · ${FOOTER}`;
}

function setPending(from, state) {
  const old = pending.get(from);
  if (old?.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
  pending.set(from, state);
}

/** Parse button / list / native-flow reply id */
function getInteractiveId(msg) {
  const m = msg.message || {};

  if (m.buttonsResponseMessage?.selectedButtonId) {
    return m.buttonsResponseMessage.selectedButtonId;
  }
  if (m.templateButtonReplyMessage?.selectedId) {
    return m.templateButtonReplyMessage.selectedId;
  }
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  }

  // Modern native flow
  const nf = m.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nf?.paramsJson) {
    try {
      const p = JSON.parse(nf.paramsJson);
      return p.id || p.selectedRowId || p.button_id || p.rowId || null;
    } catch (_) {
      return null;
    }
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
  if (res.data.status === false) {
    throw new Error(res.data.error || res.data.message || 'Search failed');
  }
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
  if (res.data.status === false) {
    throw new Error(res.data.error || res.data.message || 'Info failed');
  }
  return res.data.data || res.data.result || res.data;
}

/**
 * Modern buttons that work on current WA (interactiveButtons / native flow)
 * Old { buttons: [{buttonId, buttonText}] } often shows "Tap to open" with no buttons.
 */
async function sendInteractiveSelect({ sock, from, msg, text, title, rows, image }) {
  const interactiveButtons = [
    {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: title || 'Select',
        sections: [
          {
            title: '💗 Options',
            rows: rows.map((r) => ({
              header: r.header || '',
              title: String(r.title).slice(0, 24),
              description: String(r.description || '').slice(0, 72),
              id: r.id,
            })),
          },
        ],
      }),
    },
  ];

  // Try image + interactive
  if (image) {
    try {
      await sock.sendMessage(
        from,
        {
          image: { url: image },
          caption: text,
          footer: footLine(),
          title: title || 'Baiscope',
          interactiveButtons,
        },
        { quoted: msg }
      );
      return true;
    } catch (e) {
      console.error('[baiscope] image interactive fail:', e.message);
    }
  }

  try {
    await sock.sendMessage(
      from,
      {
        text,
        footer: footLine(),
        title: title || 'Baiscope',
        subtitle: 'Dark Queen 💕',
        interactiveButtons,
      },
      { quoted: msg }
    );
    return true;
  } catch (e) {
    console.error('[baiscope] interactive fail:', e.message);
  }

  // Fallback: quick_reply buttons (max 3)
  try {
    const qbtns = rows.slice(0, 3).map((r) => ({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: String(r.title).slice(0, 20),
        id: r.id,
      }),
    }));
    await sock.sendMessage(
      from,
      {
        text,
        footer: footLine(),
        interactiveButtons: qbtns,
      },
      { quoted: msg }
    );
    return true;
  } catch (e2) {
    console.error('[baiscope] quick_reply fail:', e2.message);
  }

  // Last fallback: plain text with id hints
  let plain = text + '\n\n';
  rows.forEach((r, i) => {
    plain += `*${i + 1}.* ${r.title}\n`;
  });
  plain += `\n_Reply:_ \`.baiscope ${rows[0]?.id || 'baiscope_s_0'}\``;
  await sock.sendMessage(from, { text: plain }, { quoted: msg });
  return false;
}

async function sendSearchUI({ sock, msg, from, query, results }) {
  setPending(from, { type: 'search', results });

  const text =
    `╭───「 💖 *BAISCOPE* 」───╮\n│\n` +
    `│  🔎 *Search* › ${String(query).slice(0, 36)}\n` +
    `│  📦 *Found*  › ${results.length} titles\n│\n` +
    `│  🌸 Open the menu below, babe\n` +
    `│  💗 Tap your movie / episode\n│\n` +
    `╰──────────────────────╯\n` +
    `_*✰┈ ${BOT_FANCY} ┈✰*_`;

  const rows = results.map((r, i) => ({
    title: `${i + 1}. ${String(r.title).slice(0, 20)}`,
    description: `✨ ${r.type} · ⭐ ${r.rating}`,
    id: `baiscope_s_${i}`,
  }));

  await sendInteractiveSelect({
    sock,
    from,
    msg,
    text,
    title: '💕 Pick a title',
    rows,
    image: results[0]?.image,
  });
}

async function sendInfoUI({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🌸✨ *Fetching details for you...*' },
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
      pageUrl: item.link,
      downloads: downloads.map((d, i) => ({
        index: i,
        name: d.name || `Download ${i + 1}`,
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
      (story ? `│  📝 ${story}${story.length >= 200 ? '…' : ''}\n│\n` : '') +
      `│  📥 *${downloads.length}* file link(s)\n` +
      `│  💕 Open menu → get your link\n│\n` +
      `╰──────────────────────╯\n` +
      `_*✰┈ ${BOT_FANCY} ┈✰*_`;

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (!downloads.length) {
      if (image) {
        await sock.sendMessage(
          from,
          { image: { url: image }, caption: text + '\n🥺 No download links' },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(from, { text: text + '\n🥺 No download links' }, { quoted: msg });
      }
      return;
    }

    // CTA URL buttons (open host page) + single_select for many
    const ctaButtons = downloads.slice(0, 2).map((d, i) => ({
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: `💗 Open link ${i + 1}`,
        url: d.link,
        merchant_url: d.link,
      }),
    }));

    const selectBtn = {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: '📥 All downloads',
        sections: [
          {
            title: '💕 Choose a file',
            rows: downloads.map((d, i) => ({
              header: '',
              title: `Link ${i + 1}`,
              description: String(d.name).replace(/🎥/g, '🎬').slice(0, 60),
              id: `baiscope_d_${i}`,
            })),
          },
        ],
      }),
    };

    const payload = {
      text,
      footer: footLine(),
      title: '💖 Baiscope',
      subtitle: String(title).slice(0, 40),
      interactiveButtons: [...ctaButtons, selectBtn],
    };

    try {
      if (image) {
        await sock.sendMessage(
          from,
          {
            image: { url: image },
            caption: text,
            footer: footLine(),
            interactiveButtons: [...ctaButtons, selectBtn],
          },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(from, payload, { quoted: msg });
      }
    } catch (e) {
      console.error('[baiscope] info buttons fail:', e.message);
      await sendInteractiveSelect({
        sock,
        from,
        msg,
        text,
        title: '📥 Downloads',
        rows: downloads.map((d, i) => ({
          title: `Link ${i + 1}`,
          description: String(d.name).slice(0, 40),
          id: `baiscope_d_${i}`,
        })),
        image,
      });
    }
  } catch (err) {
    console.error('Baiscope info:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💔 \`${err.message}\``,
        edit: loading.key,
      })
      .catch(() => {});
  }
}

async function sendDl({ sock, msg, from, dl, title }) {
  // UsersDrive / file hosts = HTML pages, NOT direct mp4
  // Cannot cinesubz-style document without real media URL
  const text =
    `╭───「 💕 *YOUR DOWNLOAD* 」───╮\n│\n` +
    `│  👑 *${String(title).slice(0, 42)}*\n` +
    `│  💗 ${String(dl.name).slice(0, 42)}\n│\n` +
    `│  🔗 ${dl.link}\n│\n` +
    `│  🌸 Tap link → browser → download\n` +
    `│  💡 Host blocks direct WhatsApp upload\n│\n` +
    `╰──────────────────────╯\n` +
    `_*✰┈ ${BOT_FANCY} ┈✰*_`;

  // Try open-url button
  try {
    await sock.sendMessage(
      from,
      {
        text,
        footer: footLine(),
        interactiveButtons: [
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: '💗 Open download page',
              url: dl.link,
              merchant_url: dl.link,
            }),
          },
          {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
              display_text: '✨ Copy link',
              copy_code: dl.link,
            }),
          },
        ],
      },
      { quoted: msg }
    );
  } catch (_) {
    await sock.sendMessage(from, { text }, { quoted: msg });
  }
}

module.exports = {
  name: 'baiscope',
  aliases: ['bais', 'baiscopedl', 'bscope'],
  description: 'Search Baiscope movies with interactive buttons',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // Interactive reply
    const id =
      getInteractiveId(msg) ||
      (args[0] && /^baiscope_[sd]_\d+$/.test(args[0]) ? args[0] : null);

    if (id && /^baiscope_s_(\d+)$/.test(id)) {
      const idx = parseInt(id.split('_').pop(), 10);
      const state = pending.get(from);
      if (!state?.results?.[idx]) {
        return sock.sendMessage(
          from,
          {
            text: `🥺 Session expired, babe\n💡 \`${prefix}baiscope <name>\``,
          },
          { quoted: msg }
        );
      }
      return sendInfoUI({ sock, msg, from, item: state.results[idx] });
    }

    if (id && /^baiscope_d_(\d+)$/.test(id)) {
      const idx = parseInt(id.split('_').pop(), 10);
      const state = pending.get(from);
      if (!state?.downloads?.[idx]) {
        return sock.sendMessage(
          from,
          { text: `🥺 Session expired\n💡 Search again 💕` },
          { quoted: msg }
        );
      }
      return sendDl({
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
            `│  🌸 ${prefix}baiscope <movie name>\n│\n` +
            `│  Example:\n` +
            `│  ${prefix}baiscope Avatar\n│\n` +
            `│  💗 Interactive menu — no numbers\n│\n` +
            `╰──────────────────────╯\n` +
            `_*✰┈ ${BOT_FANCY} ┈✰*_`,
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
        return sock.sendMessage(
          from,
          { text: '🥺 No results found' },
          { quoted: msg }
        );
      }
      await sendSearchUI({ sock, msg, from, query, results });
    } catch (err) {
      console.error('Baiscope search:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌💔 \`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
