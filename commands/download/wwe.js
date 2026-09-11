const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/wrestling/watchwrestling/search';
const INFO_API = 'https://api.chamindu.site/api/v1/wrestling/watchwrestling/info';
const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const PENDING_TTL_MS = 3 * 60 * 1000;

const pending = new Map();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function foot() {
  return (
    `\n🌸💕 *Pair bot:* ${SITE}\n` +
    `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`
  );
}

function extractWatchUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?watchwrestling\.[a-z.]+\/[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

/** Prefer direct file hosts for Baileys document:{url} */
function isDirectable(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const u = url.toLowerCase();
  if (u.includes('.m3u8') || u.includes('type=hls')) return false;
  if (u.includes('multiup.io') || u.includes('1fichier') || u.includes('vikingfile'))
    return false;
  if (u.includes('dramavideo.se/watch')) return false;
  // gofile direct, stream proxy with dl, cdn mp4
  return true;
}

function pickDownloadUrl(d) {
  const candidates = [
    d.direct_link,
    d.url,
    d.link,
    d.download,
    d.raw_url,
  ].filter(Boolean);
  for (const c of candidates) {
    if (isDirectable(c) && !String(c).includes('multiup') && !String(c).includes('1fichier')) {
      // Prefer gofile / actual mp4
      if (
        /gofile\.io|file-.*\.gofile|cdn|mp4|\.mkv/i.test(c) ||
        (c.includes('api.chamindu.site') && c.includes('dl=true'))
      ) {
        return c;
      }
    }
  }
  for (const c of candidates) {
    if (isDirectable(c)) return c;
  }
  return null;
}

function normalizeDownloads(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const d of list) {
    const url = pickDownloadUrl(d);
    if (!url) continue;
    out.push({
      label: d.label || d.name || 'Download',
      quality: d.quality || 'HD',
      hoster: d.hoster || d.type || 'File',
      name: d.name || '',
      url,
    });
  }
  // unique by url
  const seen = new Set();
  return out.filter((x) => {
    if (seen.has(x.url)) return false;
    seen.add(x.url);
    return true;
  });
}

function setPending(from, state) {
  const old = pending.get(from);
  if (old?.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
  pending.set(from, state);
}

function formatShowInfo(info) {
  if (!info || typeof info !== 'object') return '';
  const lines = [];
  const map = {
    Event: '🎪',
    Date: '📅',
    'Start Time': '⏰',
    Location: '📍',
    'Event Type': '🏷️',
    'Broadcast On': '📺',
    'Available In': '✨',
  };
  for (const [k, v] of Object.entries(info)) {
    if (v == null || v === '') continue;
    const em = map[k] || '💗';
    lines.push(`│  ${em} *${k}* › ${String(v).slice(0, 55)}`);
  }
  return lines.join('\n');
}

function formatMatches(matches, limit = 5) {
  if (!Array.isArray(matches) || !matches.length) return '';
  let s = `│\n│  🥊 *Match Card:*\n`;
  matches.slice(0, limit).forEach((m, i) => {
    s += `│  ${i + 1}. ${String(m).slice(0, 70)}\n`;
  });
  if (matches.length > limit) s += `│  … +${matches.length - limit} more\n`;
  return s;
}

async function fetchInfo(pageUrl) {
  const res = await axios.get(INFO_API, {
    params: { q: pageUrl, api_key: API_KEY },
    timeout: 90000,
    validateStatus: () => true,
    headers: { 'User-Agent': UA },
  });
  if (res.status !== 200 || !res.data) throw new Error(`Info HTTP ${res.status}`);
  if (res.data.status === false || res.data.success === false) {
    throw new Error(res.data.error || res.data.message || 'Info failed');
  }
  return res.data.data || res.data.result || res.data;
}

async function showDetails({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🌸✨ *𝐋𝐨𝐚𝐝𝐢𝐧𝐠 𝐬𝐡𝐨𝐰 𝐢𝐧𝐟𝐨...*' },
    { quoted: msg }
  );

  try {
    const info = await fetchInfo(item.url);
    const title = info.title || item.title || 'WWE Show';
    const image = info.image || item.image || null;
    const date = info.date || item.date || 'N/A';
    const showInfo = info.show_info || {};
    const matches = info.match_card || info.matches || [];
    const story = String(info.story || info.description || '').slice(0, 280);
    const downloads = normalizeDownloads(info.downloads || []);

    if (!downloads.length) {
      // still show info + stream links as text
      const streams = Array.isArray(info.streams) ? info.streams : [];
      let streamTxt = streams
        .slice(0, 5)
        .map((s, i) => `│  ${i + 1}. ${s.quality || s.label} — ${(s.url || s.link || '').slice(0, 40)}…`)
        .join('\n');

      return sock.sendMessage(from, {
        text:
          `╭───「 💖 *𝐖𝐖𝐄* 」───╮\n│\n` +
          `│  👑 *${String(title).slice(0, 50)}*\n` +
          `│  📅 ${date}\n` +
          (story ? `│\n│  📝 ${story}\n` : '') +
          formatMatches(matches) +
          (streamTxt ? `│\n│  📺 *Streams:*\n${streamTxt}\n` : '') +
          `│\n│  ❌ Direct document links හමු නොවීය\n` +
          `╰──────────────────────╯` +
          foot(),
        edit: loading.key,
      });
    }

    setPending(from, {
      type: 'quality',
      title,
      image,
      date,
      downloads,
      showInfo,
      matches,
      pageUrl: item.url,
    });

    let list =
      `╭───「 💖🥊 *𝐖𝐖𝐄 𝐒𝐇𝐎𝐖* 」───╮\n│\n` +
      `│  👑 *Title* › ${String(title).slice(0, 48)}\n` +
      `│  📅 *Date*  › ${date}\n`;

    const si = formatShowInfo(showInfo);
    if (si) list += `│\n${si}\n`;
    list += formatMatches(matches, 4);

    if (story) {
      list += `│\n│  📝 *Story:*\n│  ${story.slice(0, 160)}${story.length > 160 ? '…' : ''}\n`;
    }

    list += `│\n│  📥 *Download (document):*\n│\n`;
    downloads.forEach((d, i) => {
      list += `│  *${i + 1}.* ${d.quality} · ${d.hoster}\n`;
      list += `│      💗 ${String(d.label).slice(0, 40)}\n`;
    });

    list +=
      `\n│  👇 *${config.prefix || '.'}wwe <number>*\n` +
      `│  ⏳ 3 min · 📡 QUEEN THMA PATIYO\n` +
      `╰──────────────────────╯` +
      foot();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (image && /^https?:\/\//i.test(image)) {
      try {
        await sock.sendMessage(
          from,
          { image: { url: image }, caption: list },
          { quoted: msg }
        );
        return;
      } catch (_) {}
    }
    await sock.sendMessage(from, { text: list }, { quoted: msg });
  } catch (err) {
    console.error('WWE info:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💔 \`${err.message}\`` + foot(),
        edit: loading.key,
      })
      .catch(() => {});
  }
}

async function sendDoc({ sock, msg, from, quality, title, image }) {
  const loading = await sock.sendMessage(
    from,
    {
      text: `⬆️🌸 *𝐃𝐨𝐜𝐮𝐦𝐞𝐧𝐭 𝐬𝐭𝐫𝐞𝐚𝐦...*\n💗 ${quality.quality}\n✨ ${quality.hoster}`,
    },
    { quoted: msg }
  );

  try {
    const caption =
      `╭───「 💖 *𝐖𝐖𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃* 」───╮\n│\n` +
      `│  👑 *Title*   › ${String(title).slice(0, 48)}\n` +
      `│  🎥 *Quality* › ${quality.quality}\n` +
      `│  🏷️ *Host*    › ${quality.hoster}\n` +
      `│  📁 *Type*    › Document\n│\n` +
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

    const fileName =
      (String(title).replace(/[\/\\:*?"<>|]/g, '').slice(0, 40).trim() || 'wwe') +
      '.mp4';

    await sock.sendMessage(
      from,
      {
        document: { url: quality.url },
        mimetype: 'video/mp4',
        fileName,
        caption: `📁💖 *${quality.quality}*\n> ✦ ${FOOTER} ✦`,
      },
      { quoted: msg }
    );
  } catch (err) {
    console.error('WWE send:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💔 Upload fail\n\`${err.message}\`` + foot(),
        edit: loading.key,
      })
      .catch(() => {});
  }
}

module.exports = {
  name: 'wwe',
  aliases: ['wrestling', 'raw', 'smackdown', 'wwedownload'],
  description: 'Search & download WWE / wrestling shows',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const state = pending.get(from);

      if (state?.type === 'quality') {
        if (idx < 0 || idx >= state.downloads.length) {
          return sock.sendMessage(
            from,
            { text: `❌ *1*–*${state.downloads.length}* select 💕` + foot() },
            { quoted: msg }
          );
        }
        const q = state.downloads[idx];
        if (state.timeout) clearTimeout(state.timeout);
        pending.delete(from);
        return sendDoc({
          sock,
          msg,
          from,
          quality: q,
          title: state.title,
          image: state.image,
        });
      }

      if (state?.type === 'search') {
        if (idx < 0 || idx >= state.results.length) {
          return sock.sendMessage(
            from,
            { text: `❌ *1*–*${state.results.length}* select 💕` + foot() },
            { quoted: msg }
          );
        }
        return showDetails({ sock, msg, from, item: state.results[idx] });
      }

      return sock.sendMessage(
        from,
        {
          text: `❌ Active search නැහැ 🥺\n💡 \`${prefix}wwe Raw\`` + foot(),
        },
        { quoted: msg }
      );
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 💖🥊 *𝐖𝐖𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃* 」───╮\n│\n` +
            `│  ${prefix}wwe <query>\n` +
            `│  ${prefix}wwe <number>\n` +
            `│  ${prefix}wwe <watchwrestling url>\n│\n` +
            `│  📌 Example:\n` +
            `│  ${prefix}wwe Raw\n` +
            `│  ${prefix}wwe SmackDown\n` +
            `│  ${prefix}wwe 1\n│\n` +
            `│  🌸 Queen style · I LOVE YOU\n` +
            `╰──────────────────────╯` +
            foot(),
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const direct = extractWatchUrl(query);
    if (direct) {
      return showDetails({
        sock,
        msg,
        from,
        item: { title: 'WWE Show', url: direct, image: null, date: 'N/A' },
      });
    }

    const loading = await sock.sendMessage(
      from,
      { text: '🔍💗 *𝐖𝐖𝐄 𝐬𝐞𝐚𝐫𝐜𝐡...*' },
      { quoted: msg }
    );

    try {
      const res = await axios.get(SEARCH_API, {
        params: { q: query, api_key: API_KEY },
        timeout: 45000,
        validateStatus: () => true,
        headers: { 'User-Agent': UA },
      });

      if (res.status !== 200 || !res.data) {
        return sock.sendMessage(from, {
          text: `❌ Search HTTP ${res.status}` + foot(),
          edit: loading.key,
        });
      }
      if (res.data.status === false || res.data.success === false) {
        return sock.sendMessage(from, {
          text: `❌ \`${res.data.error || res.data.message || 'fail'}\`` + foot(),
          edit: loading.key,
        });
      }

      const results = Array.isArray(res.data.data)
        ? res.data.data
        : Array.isArray(res.data.results)
          ? res.data.results
          : [];

      const cleaned = results
        .filter((r) => r && (r.url || r.link))
        .slice(0, 12)
        .map((r, i) => ({
          index: i + 1,
          title: r.title || 'Untitled',
          url: r.url || r.link,
          image: r.image || r.poster || r.thumbnail || null,
          date: r.date || 'N/A',
        }));

      if (!cleaned.length) {
        return sock.sendMessage(from, {
          text: '❌🥺 Results හමු නොවීය' + foot(),
          edit: loading.key,
        });
      }

      setPending(from, { type: 'search', results: cleaned });

      let list =
        `╭───「 💖🔍 *𝐖𝐖𝐄 𝐒𝐄𝐀𝐑𝐂𝐇* 」───╮\n│\n` +
        `│  🔎 *${query.slice(0, 40)}*\n` +
        `│  📦 ${cleaned.length} results\n│\n`;

      cleaned.forEach((item) => {
        list += `│  *${item.index}.* ${String(item.title).slice(0, 42)}\n`;
        list += `│      📅 ${item.date}\n`;
      });

      list +=
        `\n│  👇 *${prefix}wwe <number>*\n│  ⏳ 3 min\n╰──────────────────────╯` +
        foot();

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      if (cleaned[0].image && /^https?:\/\//i.test(cleaned[0].image)) {
        try {
          await sock.sendMessage(
            from,
            { image: { url: cleaned[0].image }, caption: list },
            { quoted: msg }
          );
          return;
        } catch (_) {}
      }
      await sock.sendMessage(from, { text: list }, { quoted: msg });
    } catch (err) {
      console.error('WWE search:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌💔 \`${err.message}\`` + foot(),
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
