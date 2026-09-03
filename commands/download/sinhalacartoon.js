const axios = require('axios');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../../config');

// ─────────────────────────────────────────────
//  🎬 Sinhalacartoon — සිංහල Cartoons & Movies
//  API: sinhala-cartoons-api (Vercel)
//  Sources: sinhalacartoons.com + cartoons.lk
//  Download: Document (2GB WhatsApp limit)
// ─────────────────────────────────────────────

const API = 'https://sinhala-cartoons-api.vercel.app/api';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const MAX_DL_BYTES = 2 * 1024 * 1024 * 1024;
const PROGRESS_EVERY = 150 * 1024 * 1024;
const PENDING_TTL_MS = 5 * 60 * 1000;
const SITES = ['sinhalacartoons', 'cartoonslk'];

const pending = new Map();

function clearPending(from) {
  const p = pending.get(from);
  if (p?.timeout) clearTimeout(p.timeout);
  pending.delete(from);
}

function armPending(from, state) {
  clearPending(from);
  const timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
  pending.set(from, { ...state, timeout });
}

function formatBytes(b) {
  const n = Number(b) || 0;
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + ' GB';
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return '?'; }
}

function fileNameOf(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    return name.replace(/[✳️️]/gu, '').trim().slice(0, 48) || 'video.mp4';
  } catch { return 'video.mp4'; }
}

function shortDate(d) {
  return d ? String(d).slice(0, 10) : '—';
}

/** Stream download → disk (RAM safe, 2GB) */
function downloadToFile(url, filePath, onProgress) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const go = (u) => {
      if (redirects > 8) return reject(new Error('Too many redirects'));
      const lib = u.startsWith('https') ? https : http;
      const req = lib.get(
        u,
        {
          timeout: 600000,
          headers: {
            'User-Agent': UA,
            Accept: '*/*',
            'Accept-Encoding': 'identity',
            Referer: new URL(u).origin,
          },
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            redirects++;
            const next = res.headers.location.startsWith('http')
              ? res.headers.location
              : new URL(res.headers.location, u).href;
            return go(next);
          }
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          const cl = parseInt(res.headers['content-length'] || '0', 10);
          if (cl && cl > MAX_DL_BYTES) {
            res.resume();
            return reject(new Error(`File විශාලයි (${formatBytes(cl)} > 2GB)`));
          }
          const total = cl || 0;
          let received = 0;
          let lastReport = 0;
          const file = fs.createWriteStream(filePath);
          res.on('data', (c) => {
            received += c.length;
            if (received > MAX_DL_BYTES) {
              req.destroy();
              file.destroy();
              fs.unlink(filePath, () => {});
              reject(new Error('File 2GB limit ඉක්මවා ගියා'));
              return;
            }
            if (onProgress && received - lastReport >= PROGRESS_EVERY) {
              lastReport = received;
              onProgress(received, total);
            }
          });
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve({ bytes: received })));
          file.on('error', (e) => {
            fs.unlink(filePath, () => {});
            reject(e);
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        fs.unlink(filePath, () => {});
        reject(new Error('Download timeout'));
      });
      req.on('error', (e) => {
        fs.unlink(filePath, () => {});
        reject(e);
      });
    };
    go(url);
  });
}

async function apiGet(path_, params) {
  const res = await axios.get(`${API}${path_}`, {
    params,
    timeout: 60000,
    validateStatus: () => true,
    headers: { 'User-Agent': UA },
  });
  return res;
}

function flattenLinks(d) {
  const out = [];
  for (const block of d.downloadLinks || []) {
    if (block.links && Array.isArray(block.links)) {
      const isTg = block.type === 'telegram-bundle' || /telegram/i.test(block.type);
      block.links.forEach((l) => {
        out.push({
          url: l.url,
          kind: isTg ? 'telegram' : 'direct',
          host: l.host || hostOf(l.url),
          name: fileNameOf(l.url),
        });
      });
    } else if (block.url) {
      out.push({
        url: block.url,
        kind: block.type === 'direct' ? 'direct' : 'page',
        host: hostOf(block.url),
        name: (block.label || '').split('\n')[0].trim().slice(0, 48) || 'link',
      });
    }
  }
  return out;
}

module.exports = {
  name: 'sinhalacartoon',
  aliases: ['scartoon', 'sinhalac', 'sc'],
  description: 'Search & download sinhala dubbed movies/cartoons',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    /* ─────────── HELP ─────────── */
    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🎬 *සිංහල Cartoon* 」───╮
│
│  🎠 සිංහල හඬකැවූ Cartoon & Movies
│  📦 Document ලෙස ⬇️ (2GB දක්වා)
│  🏷 sinhalacartoons.com + cartoons.lk
│
│  🔍 *Search*
│  ›  ${prefix}sinhalacartoon <name>
│
│  📌 *Select Result*
│  ›  ${prefix}sinhalacartoon <number>
│
│  ⬇️ *Download*
│  ›  ${prefix}sinhalacartoon dl <number>
│
│  ✨ *Examples*
│  ›  ${prefix}sinhalacartoon hotel transylvania
│  ›  ${prefix}sinhalacartoon 1
│  ›  ${prefix}sinhalacartoon dl 1
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    /* ─────────── DOWNLOAD ─────────── */
    if (/^dl$/i.test(args[0]) && /^\d+$/.test(args[1] || '')) {
      const idx = parseInt(args[1], 10) - 1;
      const p = pending.get(from);
      if (!p || p.type !== 'links' || !p.links?.length) {
        return sock.sendMessage(
          from,
          { text: `❌ Active link list එකක් නැහැ.\n💡 \`${prefix}sinhalacartoon <name>\` වලින් පටන් ගන්න.` },
          { quoted: msg }
        );
      }
      if (idx < 0 || idx >= p.links.length) {
        return sock.sendMessage(
          from,
          { text: `❌ *1*–*${p.links.length}* තුළින් තෝරන්න.` },
          { quoted: msg }
        );
      }
      const target = p.links[idx];

      if (target.kind === 'telegram') {
        return sock.sendMessage(
          from,
          { text: `🔵 Telegram link එකක් — මෙතනින් open කරන්න:\n\n${target.url}` },
          { quoted: msg }
        );
      }
      if (target.kind === 'page') {
        return sock.sendMessage(
          from,
          { text: `🔗 මේක intermediate page එකක්:\n\n${target.url}\n\n💡 Browser එකෙන් open කරලා direct link එක ගන්න.` },
          { quoted: msg }
        );
      }

      const fname = target.name;
      const tmpPath = path.join(os.tmpdir(), `sc_${Date.now()}_${fname.replace(/[^\w.\-]/g, '_')}`);

      const loading = await sock.sendMessage(
        from,
        { text: `⬇️ *Download වෙමින්...*\n📁 ${fname}\n\n⏳ 2GB දක්වා support — ටිකක් ඉන්න...` },
        { quoted: msg }
      );

      try {
        const progressEdit = async (received, total) => {
          const pct = total ? ` (${Math.round((received / total) * 100)}%)` : '';
          await sock.sendMessage(
            from,
            { text: `⬇️ *Download වෙමින්...*\n📁 ${fname}\n📦 ${formatBytes(received)}${pct}`, edit: loading.key }
          ).catch(() => {});
        };

        const dl = await downloadToFile(target.url, tmpPath, progressEdit);
        if (dl.bytes < 5000) throw new Error('File එක පොඩි වැරදියි');

        // HTML/JSON check
        const fd = fs.openSync(tmpPath, 'r');
        const head = Buffer.alloc(40);
        fs.readSync(fd, head, 0, 40, 0);
        fs.closeSync(fd);
        if (head.toString('utf8').includes('<html') || head.toString('utf8').trim().startsWith('{')) {
          fs.unlinkSync(tmpPath);
          throw new Error('Server HTML/JSON response — link expire වෙලාද?');
        }

        await sock.sendMessage(
          from,
          { text: `📤 *WhatsApp එකට Upload වෙමින්...*\n📦 ${formatBytes(dl.bytes)}\n⏳ ටිකක් වෙලා යයි...`, edit: loading.key }
        ).catch(() => {});

        const cap = `╭───「 🎬 *SINHALA CARTOON* 」───╮
│
│  📌 ${fname}
│  📦 ${formatBytes(dl.bytes)}
│  🌐 ${target.host}
│  📄 *Document*
│
╰──────────────────────╯`;

        await sock.sendMessage(
          from,
          {
            document: { url: tmpPath },
            mimetype: 'video/mp4',
            fileName: fname,
            caption: cap,
          },
          { quoted: msg }
        );

        await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      } catch (e) {
        console.error('[SINHALACARTOON] download fail:', e.message);
        await sock.sendMessage(
          from,
          {
            text: `❌ Download fail — \`${e.message}\`\n\n🔗 ${target.url}\n\n💡 Browser/IDM එකෙන් download කරන්න.`,
            edit: loading.key,
          }
        ).catch(() => {});
      } finally {
        fs.unlink(tmpPath, () => {});
      }
      return;
    }

    /* ─────────── SELECT ─────────── */
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const p = pending.get(from);
      if (!p || p.type !== 'search' || !p.results?.length) {
        return sock.sendMessage(
          from,
          { text: `❌ Active search එකක් නැහැ.\n💡 \`${prefix}sinhalacartoon <name>\`` },
          { quoted: msg }
        );
      }
      if (idx < 0 || idx >= p.results.length) {
        return sock.sendMessage(from, { text: `❌ *1*–*${p.results.length}* තෝරන්න.` }, { quoted: msg });
      }

      const item = p.results[idx];
      const loading = await sock.sendMessage(from, { text: `🎬 *${String(item.title).slice(0, 40)}*\n\n📖 Details ගන්නවා...` }, { quoted: msg });

      try {
        const res = await apiGet('/details', { url: item.url });
        if (res.status !== 200 || !res.data || res.data.success === false) {
          throw new Error(res.data?.error || `HTTP ${res.status}`);
        }
        const d = res.data;
        const links = flattenLinks(d);
        clearPending(from);
        armPending(from, { type: 'links', links, item });

        let body = `╭───「 🎬 *DETAILS* 」───╮
│
│  📌 *${String(d.title || item.title).slice(0, 50)}
│  🏷 ${hostOf(item.url)}
│  📅 ${shortDate(item.date)}
│`;
        if (d.description) {
          body += `│  📖 ${String(d.description).replace(/\s+/g, ' ').slice(0, 130)}...\n│\n`;
        }
        body += `│  ⬇️ *Links (${links.length})*
│\n`;
        links.slice(0, 10).forEach((l, i) => {
          const icon = l.kind === 'direct' ? '🎬' : l.kind === 'telegram' ? '🔵' : '🔗';
          body += `│  *${i + 1}.* ${icon} ${l.name}\n`;
          if (i < 3) body += `│     🌐 ${l.host}\n`;
        });
        if (links.length > 10) body += `│  ...+${links.length - 10} more\n`;
        body += `│
│  💡 *${prefix}sinhalacartoon dl <n>*  →  ⬇️
│  ⏳ 5 min
╰──────────────────────╯`;

        await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
        const thumb = d.image || item.image;
        if (thumb && /^https?:\/\//i.test(thumb)) {
          try { await sock.sendMessage(from, { image: { url: thumb }, caption: body }, { quoted: msg }); return; } catch (_) {}
        }
        await sock.sendMessage(from, { text: body }, { quoted: msg });
      } catch (e) {
        console.error('[SINHALACARTOON] details fail:', e.message);
        await sock.sendMessage(from, { text: `❌ Details fail.\n\`${e.message}\``, edit: loading.key }).catch(() => {});
      }
      return;
    }

    /* ─────────── SEARCH ─────────── */
    const query = args.join(' ').trim();
    const loading = await sock.sendMessage(from, { text: `🔍 *"${query.slice(0, 40)}"* හොයමින්... 🎬` }, { quoted: msg });

    try {
      const settled = await Promise.allSettled(SITES.map((s) => apiGet('/search', { site: s, q: query })));
      let results = [];
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value.status === 200 && s.value.data?.results) {
          results.push(...s.value.data.results);
        }
      }
      results = results.slice(0, 12);

      if (!results.length) {
        return sock.sendMessage(from, {
          text: `😢 *"${query.slice(0, 40)}"* හමු නොවීය.\n\n💡 English name එකකින් try කරන්න.\n📌 \`${prefix}sinhalacartoon ben 10\``,
          edit: loading.key,
        });
      }

      clearPending(from);
      armPending(from, { type: 'search', results });

      let list = `╭───「 🎬 *SEARCH* 」───╮
│
│  🔎 *${query.slice(0, 40)}*
│  📊 ${results.length} results ✨
│\n`;
      results.forEach((r, i) => {
        list += `│  *${i + 1}.* ${String(r.title).slice(0, 44)}\n`;
        list += `│     🏷 ${hostOf(r.url)}\n`;
      });
      list += `│
│  👇 *${prefix}sinhalacartoon <number>*
│  ⏳ 5 min
╰──────────────────────╯`;

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      const thumb = results.find((r) => r.image)?.image;
      if (thumb && /^https?:\/\//i.test(thumb)) {
        try { await sock.sendMessage(from, { image: { url: thumb }, caption: list }, { quoted: msg }); return; } catch (_) {}
      }
      await sock.sendMessage(from, { text: list }, { quoted: msg });
    } catch (e) {
      console.error('[SINHALACARTOON] search fail:', e.message);
      await sock.sendMessage(from, { text: `❌ Search fail.\n\`${e.message}\``, edit: loading.key }).catch(() => {});
    }
  },
};
