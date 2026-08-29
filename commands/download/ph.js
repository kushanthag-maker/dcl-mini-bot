const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const config = require('../../config');

const SEARCH_API = 'https://porn-hub-scrap.vercel.app/api/search';
const DL_API = 'https://porn-hub-scrap.vercel.app/api/download';
const PENDING_TTL_MS = 2 * 60 * 1000;
const MAX_WA_BYTES = 95 * 1024 * 1024;
const MAX_DURATION_SEC = 600; // safety for long videos on Heroku

const pending = new Map();

function extractPhUrl(text) {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?pornhub\.com\/view_video\.php\?[^\s]+/i
  );
  return m ? m[0].replace(/[)\]>,.]+$/, '') : null;
}

function resolveIndexM3u8(masterUrl, masterBody) {
  const lines = String(masterBody || '').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      try {
        return new URL(t, masterUrl).href;
      } catch (_) {
        return t;
      }
    }
  }
  return masterUrl;
}

function pickHls(links) {
  const hls = (links || []).filter(
    (l) => l && l.url && String(l.format || '').toLowerCase() === 'hls'
  );
  for (const pref of ['480', '720', '240', '1080']) {
    const hit = hls.find((l) => String(l.quality) === pref);
    if (hit) return hit;
  }
  return hls[0] || null;
}

async function hlsToMp4(hlsUrl) {
  const tmp = os.tmpdir();
  const outFile = path.join(tmp, `ph_${Date.now()}.mp4`);

  // Resolve nested index playlist
  let playUrl = hlsUrl;
  try {
    const masterRes = await axios.get(hlsUrl, {
      timeout: 30000,
      responseType: 'text',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.pornhub.com/',
      },
    });
    playUrl = resolveIndexM3u8(hlsUrl, masterRes.data);
  } catch (e) {
    console.log('[PH] master resolve fail:', e.message);
  }

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-user_agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '-headers',
        'Referer: https://www.pornhub.com/\r\n',
        '-i',
        playUrl,
        '-t',
        String(MAX_DURATION_SEC),
        '-c',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        outFile,
      ],
      { timeout: 300000 }
    );
    const buf = fs.readFileSync(outFile);
    return buf;
  } finally {
    try {
      fs.unlinkSync(outFile);
    } catch (_) {}
  }
}

async function downloadAndSend({ sock, msg, from, item }) {
  const loading = await sock.sendMessage(
    from,
    { text: '📥 *PH download...*\n⏳ HLS convert වෙන්න පුළුවන්' },
    { quoted: msg }
  );

  try {
    const pageUrl = item.page_link || item.url;
    const apiRes = await axios.get(DL_API, {
      params: { url: pageUrl },
      timeout: 90000,
      validateStatus: () => true,
    });

    if (apiRes.status !== 200 || !apiRes.data || apiRes.data.success === false) {
      throw new Error(apiRes.data?.message || apiRes.data?.error || `HTTP ${apiRes.status}`);
    }

    const title = apiRes.data.title || item.title || 'PH Video';
    const links = apiRes.data.download_links || [];
    const picked = pickHls(links);

    if (!picked) {
      throw new Error('Downloadable stream හොයාගන්න බැරි වුණා');
    }

    await sock
      .sendMessage(from, {
        text: `⬇️ *Downloading...*\n🎬 ${picked.quality || ''}p HLS → MP4`,
        edit: loading.key,
      })
      .catch(() => {});

    const buffer = await hlsToMp4(picked.url);
    if (!buffer || buffer.length < 10000) {
      throw new Error('Converted file empty / invalid');
    }

    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    if (buffer.length > MAX_WA_BYTES) {
      return sock.sendMessage(from, {
        text: `❌ File ලොකුයි (*${sizeMB} MB*). හොඳ quality අඩු video එකක් try කරන්න.`,
        edit: loading.key,
      });
    }

    const caption = `
╭───「 🔥 *PORNHUB* 」───╮
│
│  📌 *Title*    ›  ${String(title).slice(0, 60)}
│  ⏱ *Duration* ›  ${item.duration || 'N/A'}
│  👁 *Views*    ›  ${item.views || 'N/A'}
│  🎬 *Quality*  ›  ${picked.quality || 'auto'}p
│  📦 *Size*     ›  ${sizeMB} MB
│
╰──────────────────────╯`.trim();

    await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

    try {
      await sock.sendMessage(
        from,
        {
          video: buffer,
          mimetype: 'video/mp4',
          caption,
          fileName: 'ph.mp4',
        },
        { quoted: msg }
      );
    } catch (e1) {
      await sock.sendMessage(
        from,
        {
          document: buffer,
          mimetype: 'video/mp4',
          fileName: 'ph.mp4',
          caption: caption + '\n\n📁 document',
        },
        { quoted: msg }
      );
    }
  } catch (err) {
    console.error('PH Error:', err.message);
    await sock
      .sendMessage(from, {
        text: `❌ PH download fail.\n\n\`${err.message}\``,
        edit: loading.key,
      })
      .catch(() => {});
  }
}

module.exports = {
  name: 'ph',
  aliases: ['pornhub', 'phdl'],
  description: 'Search & download Pornhub videos',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const p = pending.get(from);
      if (!p || !p.results?.length) {
        return sock.sendMessage(
          from,
          { text: `❌ Active search නැහැ.\n💡 \`${prefix}ph <query>\`` },
          { quoted: msg }
        );
      }
      if (idx < 0 || idx >= p.results.length) {
        return sock.sendMessage(
          from,
          { text: `❌ *1*–*${p.results.length}* තෝරන්න.` },
          { quoted: msg }
        );
      }
      clearTimeout(p.timeout);
      pending.delete(from);
      return downloadAndSend({ sock, msg, from, item: p.results[idx] });
    }

    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🔥 *PORNHUB* 」───╮
│
│  ${prefix}ph <query>
│  ${prefix}ph <number>
│  ${prefix}ph <pornhub url>
│
│  Example:
│  ${prefix}ph funny
│  ${prefix}ph 1
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    const query = args.join(' ').trim();
    const direct = extractPhUrl(query);
    if (direct) {
      return downloadAndSend({
        sock,
        msg,
        from,
        item: {
          title: 'PH Video',
          page_link: direct,
          duration: 'N/A',
          views: 'N/A',
        },
      });
    }

    const loading = await sock.sendMessage(
      from,
      { text: '🔍 *PH search...*' },
      { quoted: msg }
    );

    try {
      const res = await axios.get(SEARCH_API, {
        params: { q: query },
        timeout: 45000,
        validateStatus: () => true,
      });

      if (res.status !== 200 || !res.data || res.data.success === false) {
        return sock.sendMessage(from, {
          text: `❌ Search fail.\n\`${res.data?.message || 'error'}\``,
          edit: loading.key,
        });
      }

      const data = Array.isArray(res.data.data) ? res.data.data : [];
      const cleaned = data
        .filter((r) => r && (r.page_link || r.url || r.viewkey))
        .slice(0, 12)
        .map((r, i) => ({
          index: i + 1,
          title: r.title || 'Untitled',
          page_link:
            r.page_link ||
            r.url ||
            (r.viewkey
              ? `https://www.pornhub.com/view_video.php?viewkey=${r.viewkey}`
              : null),
          duration: r.duration || 'N/A',
          views: r.views || 'N/A',
          // API has no thumbnail field
          thumbnail: r.thumbnail || r.thumb || r.image || null,
        }));

      if (!cleaned.length) {
        return sock.sendMessage(from, {
          text: '❌ Results හමු නොවීය.',
          edit: loading.key,
        });
      }

      const existing = pending.get(from);
      if (existing?.timeout) clearTimeout(existing.timeout);
      const timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
      pending.set(from, { results: cleaned, timeout });

      let list = `╭───「 🔥 *PH SEARCH* 」───╮\n│\n│  🔎 *${query.slice(0, 40)}*\n│  📦 ${cleaned.length} results\n│\n`;
      cleaned.forEach((item) => {
        list +=
          `│  *${item.index}.* ${String(item.title).slice(0, 42)}\n` +
          `│      ⏱ ${item.duration} · 👁 ${item.views}\n`;
      });
      list += `\n│  👇 *${prefix}ph <number>*\n│  ⏳ 2 min\n╰──────────────────────╯`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // Image if API ever provides thumb
      if (cleaned[0].thumbnail && /^https?:\/\//i.test(cleaned[0].thumbnail)) {
        try {
          await sock.sendMessage(
            from,
            { image: { url: cleaned[0].thumbnail }, caption: list },
            { quoted: msg }
          );
          return;
        } catch (_) {}
      }

      await sock.sendMessage(from, { text: list }, { quoted: msg });
    } catch (err) {
      console.error('PH Search:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ \`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
