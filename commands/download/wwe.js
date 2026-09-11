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
    `\n🌸✨ *Pair your queen:* ${SITE}\n` +
    `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`
  );
}

function extractWatchUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?watchwrestling\.[a-z.]+\/[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function setPending(from, state) {
  const old = pending.get(from);
  if (old?.timeout) clearTimeout(old.timeout);
  state.timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
  pending.set(from, state);
}

function formatShowInfo(info) {
  if (!info || typeof info !== 'object') return '';
  const map = {
    Event: '🎪',
    Date: '📅',
    'Start Time': '⏰',
    Location: '📍',
    'Event Type': '🏷️',
    'Broadcast On': '📺',
    'Available In': '✨',
  };
  const lines = [];
  for (const [k, v] of Object.entries(info)) {
    if (v == null || v === '') continue;
    lines.push(`│  ${map[k] || '💗'} *${k}* › ${String(v).slice(0, 55)}`);
  }
  return lines.length ? lines.join('\n') + '\n' : '';
}

function formatMatches(matches, limit = 5) {
  if (!Array.isArray(matches) || !matches.length) return '';
  let s = `│\n│  🥊💕 *Match highlights:*\n`;
  matches.slice(0, limit).forEach((m, i) => {
    s += `│  ${['🌸', '💗', '💖', '✨', '🎀'][i % 5]} ${String(m).slice(0, 68)}\n`;
  });
  if (matches.length > limit) s += `│  … +${matches.length - limit} more\n`;
  return s;
}

/** Build download options — keep page + direct for user */
function normalizeDownloads(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const d of list) {
    const page =
      d.page_url ||
      (d.hoster && String(d.hoster).toLowerCase() === 'gofile' && d.url && d.url.includes('gofile.io/d/')
        ? d.url
        : null);
    const direct = d.direct_link || d.url || d.link || null;
    // skip pure m3u8-only as "file" option if no page
    const isM3u8 =
      (d.type && String(d.type).toLowerCase().includes('m3u8')) ||
      (direct && String(direct).includes('.m3u8'));

    if (!direct && !page) continue;
    if (isM3u8 && !page) continue;

    out.push({
      label: d.label || d.name || 'Download',
      quality: d.quality || 'HD',
      hoster: d.hoster || d.type || 'Link',
      name: d.name || '',
      url: direct,
      page: page || (direct && /gofile\.io\/d\//i.test(direct) ? direct : null),
    });
  }
  const seen = new Set();
  return out.filter((x) => {
    const key = (x.page || '') + '|' + (x.url || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

/**
 * Check if URL is real media (not HTML login page)
 * Gofile direct links often return HTML ~3KB → WhatsApp shows "KB"
 */
async function probeMedia(url) {
  try {
    const res = await axios.get(url, {
      timeout: 25000,
      maxRedirects: 5,
      responseType: 'arraybuffer',
      maxContentLength: 64 * 1024,
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        Range: 'bytes=0-2048',
        Referer: 'https://gofile.io/',
      },
      validateStatus: () => true,
    });
    const buf = Buffer.from(res.data || []);
    const ct = String(res.headers['content-type'] || '').toLowerCase();
    const cl = parseInt(res.headers['content-length'] || '0', 10);

    if (ct.includes('text/html') || ct.includes('text/plain')) {
      return { ok: false, reason: 'html', ct, cl };
    }
    // mp4/webm magic
    const isMp4 =
      (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) ||
      ct.includes('video') ||
      ct.includes('octet-stream') ||
      ct.includes('mp4');
    if (!isMp4 && cl > 0 && cl < 50000) {
      return { ok: false, reason: 'too_small', ct, cl };
    }
    return { ok: true, ct, cl };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function showDetails({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '🌸✨ *හුරතල් queen info ගන්නවා...*' },
    { quoted: msg }
  );

  try {
    const info = await fetchInfo(item.url);
    const title = info.title || item.title || 'WWE Show';
    const image = info.image || item.image || null;
    const date = info.date || item.date || 'N/A';
    const showInfo = info.show_info || {};
    const matches = info.match_card || info.matches || [];
    const story = String(info.story || info.description || '').slice(0, 260);
    const downloads = normalizeDownloads(info.downloads || []);

    if (!downloads.length) {
      return sock.sendMessage(from, {
        text:
          `╭───「 💖 *𝐖𝐖𝐄* 」───╮\n│\n` +
          `│  👑 *${String(title).slice(0, 48)}*\n` +
          `│  📅 ${date}\n│\n` +
          `│  🥺 Download links හමු නොවීය\n` +
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
      pageUrl: item.url,
    });

    let list =
      `╭───「 💖🥊 *𝐖𝐖𝐄 𝐒𝐇𝐎𝐖* 」───╮\n│\n` +
      `│  👑 *Title* › ${String(title).slice(0, 48)}\n` +
      `│  📅 *Date*  › ${date}\n`;

    list += formatShowInfo(showInfo);
    list += formatMatches(matches, 4);

    if (story) {
      list += `│\n│  📝 *Story*\n│  ${story.slice(0, 150)}${story.length > 150 ? '…' : ''}\n`;
    }

    list += `│\n│  📥💕 *Quality තෝරන්න:*\n│\n`;
    downloads.forEach((d, i) => {
      list += `│  *${i + 1}.* ${d.quality} · ${d.hoster}\n`;
      list += `│      💗 ${String(d.label).slice(0, 42)}\n`;
    });

    list +=
      `\n│  👇 *${config.prefix || '.'}wwe <number>*\n` +
      `│  ⏳ 3 minutes sweetheart\n` +
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

async function sendDownload({ sock, msg, from, quality, title, image }) {
  const loading = await sock.sendMessage(
    from,
    { text: `🌸💗 *${quality.quality}* හොයලා බලනවා...` },
    { quoted: msg }
  );

  try {
    const pretty =
      `╭───「 💖 *𝐖𝐖𝐄 𝐅𝐎𝐑 𝐘𝐎𝐔* 」───╮\n│\n` +
      `│  👑 *Title*   › ${String(title).slice(0, 48)}\n` +
      `│  🎥 *Quality* › ${quality.quality}\n` +
      `│  🏷️ *Host*    › ${quality.hoster}\n│\n` +
      `╰──────────────────────╯`;

    // Probe direct URL — avoid sending 3KB HTML as "video"
    let canDoc = false;
    if (quality.url && /^https?:\/\//i.test(quality.url)) {
      const probe = await probeMedia(quality.url);
      console.log('[WWE] probe', probe);
      canDoc = !!probe.ok;
    }

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    if (image && /^https?:\/\//i.test(image)) {
      await sock
        .sendMessage(from, { image: { url: image }, caption: pretty + foot() }, { quoted: msg })
        .catch(() =>
          sock.sendMessage(from, { text: pretty + foot() }, { quoted: msg }).catch(() => {})
        );
    } else {
      await sock.sendMessage(from, { text: pretty + foot() }, { quoted: msg }).catch(() => {});
    }

    if (canDoc) {
      const fileName =
        (String(title).replace(/[\/\\:*?"<>|]/g, '').slice(0, 40).trim() || 'wwe') +
        '.mp4';
      await sock.sendMessage(
        from,
        {
          document: { url: quality.url },
          mimetype: 'video/mp4',
          fileName,
          caption: `📁💖 *${quality.quality}* · ${quality.hoster}\n> ✦ ${FOOTER} ✦`,
        },
        { quoted: msg }
      );
      return;
    }

    // Gofile / hosts block hotlink → send openable links (real forward to user)
    let links = `╭───「 💗 *𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐋𝐈𝐍𝐊𝐒* 」───╮\n│\n`;
    links += `│  👑 ${String(title).slice(0, 42)}\n`;
    links += `│  ✨ ${quality.quality} · ${quality.hoster}\n│\n`;

    if (quality.page) {
      links += `│  🌸 *Open page:*\n│  ${quality.page}\n│\n`;
    }
    if (quality.url && quality.url !== quality.page) {
      links += `│  💖 *Direct / mirror:*\n│  ${quality.url}\n│\n`;
    }

    links +=
      `│  💡 Link එක touch කරලා browser එකෙන්\n` +
      `│     download කරන්න (queen tip 💕)\n` +
      `│\n│  ⚠️ Hosts hotlink block කරන නිසා\n` +
      `│     WhatsApp document auto-send බැරි වුණා\n` +
      `╰──────────────────────╯` +
      foot();

    await sock.sendMessage(from, { text: links }, { quoted: msg });
  } catch (err) {
    console.error('WWE send:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌💔 \`${err.message}\`` + foot(),
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
            { text: `❌ *1*–*${state.downloads.length}* තෝරන්න 💕` + foot() },
            { quoted: msg }
          );
        }
        const q = state.downloads[idx];
        if (state.timeout) clearTimeout(state.timeout);
        pending.delete(from);
        return sendDownload({
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
            { text: `❌ *1*–*${state.results.length}* තෝරන්න 💕` + foot() },
            { quoted: msg }
          );
        }
        return showDetails({ sock, msg, from, item: state.results[idx] });
      }

      return sock.sendMessage(
        from,
        { text: `❌ Search එකක් නැහැ 🥺\n💡 \`${prefix}wwe Raw\`` + foot() },
        { quoted: msg }
      );
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 💖🥊 *𝐖𝐖𝐄* 」───╮\n│\n` +
            `│  🌸 ${prefix}wwe <show name>\n` +
            `│  💗 ${prefix}wwe <number>\n` +
            `│  ✨ ${prefix}wwe <url>\n│\n` +
            `│  📌 Example:\n` +
            `│  ${prefix}wwe Raw\n` +
            `│  ${prefix}wwe SmackDown\n│\n` +
            `│  👑 Made with love for you\n` +
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
      { text: '🔍💕 *Queen search පටන් ගත්තා...*' },
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
