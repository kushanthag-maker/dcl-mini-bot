const axios = require('axios');
const config = require('../../config');

// ─────────────────────────────────────────────
//  🌹 AnimeHeaven — Anime Search & Episode DL
//  API: api.chamindu.site (animeheaven.me)
//  Style: Rose / Girls UI  •  Zero RAM stream
// ─────────────────────────────────────────────

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const API = 'https://api.chamindu.site/api/v1/anime/animeheaven';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const PENDING_TTL_MS = 5 * 60 * 1000;
const pending = new Map();

const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MORE = ['1️⃣1️⃣', '1️⃣2️⃣', '1️⃣3️⃣', '1️⃣4️⃣', '1️⃣5️⃣'];

function numEmoji(i) {
  if (i < 10) return NUM[i];
  if (i < 15) return MORE[i - 10];
  return `*${i + 1}.*`;
}

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

function clean(s, n = 60) {
  return String(s || '—').replace(/\s+/g, ' ').trim().slice(0, n);
}

function safeFileName(s) {
  return String(s || 'episode')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) + '.mp4';
}

async function apiGet(endpoint, params) {
  const res = await axios.get(`${API}/${endpoint}`, {
    params: { ...params, api_key: API_KEY },
    timeout: 60000,
    validateStatus: () => true,
    headers: { 'User-Agent': UA },
  });
  return res;
}

/* ─────────── ROSE UI BUILDERS ─────────── */

function roseSearch(query, results) {
  let t = `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  🎀 sᴇᴀʀᴄʜ ʀᴇsᴜʟᴛs
┃  🔎 *${clean(query, 38)}*
┃  📊 ${results.length} results 💮
┃
`;
  results.slice(0, 12).forEach((r, i) => {
    const icon = numEmoji(i);
    t += `┃  ${icon} ${clean(r.title, 42)}
`;
    t += `┃     🌸 ${r.type || 'anime'}
`;
  });
  if (results.length > 12) t += `┃  ...+${results.length - 12} more 🌸
`;
  t += `┃
┃  ✨ *.animehaven <number>*
┃  ⏳ 5 min
╰━━━━━━━━━━━━━━━╯
🌹 ~ᴅᴄʟ ᴍɪɴɪ ʀᴏsᴇ~`;
  return t;
}

function roseInfo(d, eps) {
  let t = `╭━━「 🌹ᴀɴɪᴍᴇ ɪɴғᴏ 」━━╮
┃
┃  🌸 *${clean(d.title, 46)}*
┃  ⭐ ɪᴍᴅʙ : ${clean(d.imdb, 12)}
┃  📅 ʏᴇᴀʀ : ${clean(d.year, 10)}
┃  ⏱️ ${clean(d.duration, 22)}
┃  🎭 ${clean(d.genres, 60)}
┃
┃  📖 sᴛᴏʀʏ
┃  ${clean(d.story, 130)}
┃
┃  📺 ᴇᴘɪsᴏᴅᴇs (${eps.length})
`;
  eps.slice(0, 15).forEach((e, i) => {
    t += `┃  ${numEmoji(i)} ${clean(e.name || e.title, 40)}
`;
  });
  if (eps.length > 15) t += `┃  ...+${eps.length - 15} more 🌸
`;
  t += `┃
┃  ⬇️ *.animehaven dl <number>*
┃  ⏳ 5 min
╰━━━━━━━━━━━━━━━╯
🌹 ~ᴅᴄʟ ᴍɪɴɪ ʀᴏsᴇ~`;
  return t;
}

function roseHelp(prefix) {
  return `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  🎀 ᴀɴɪᴍᴇ sᴇᴀʀᴄʜ & ᴇᴘɪsᴏᴅᴇ ᴅʟ
┃  💮 ᴅɪʀᴇᴄᴛ ʟɪɴᴋ • ᴢᴇʀᴏ ʀᴀᴍ
┃
┃  🔍 sᴇᴀʀᴄʜ
┃  → ${prefix}animehaven <name>
┃
┃  📌 sᴇʟᴇᴄᴛ
┃  → ${prefix}animehaven <number>
┃
┃  ⬇️ ᴇᴘɪsᴏᴅᴇ ᴀs ᴅᴏᴄᴜᴍᴇɴᴛ
┃  → ${prefix}animehaven dl <number>
┃
┃  ✨ ᴇxᴀᴍᴘʟᴇs
┃  → ${prefix}animehaven solo leveling
┃  → ${prefix}animehaven 1
┃  → ${prefix}animehaven dl 3
┃
╰━━━━━━━━━━━━━━━╯
🌹 ~ᴅᴄʟ ᴍɪɴɪ ʀᴏsᴇ~`;
}

/* ─────────── COMMAND ─────────── */

module.exports = {
  name: 'animehaven',
  aliases: ['animeh', 'ahaven', 'ah'],
  description: '🌹 Search anime & download episodes (zero RAM)',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    /* ═══════════ HELP ═══════════ */
    if (!args.length) {
      return sock.sendMessage(from, { text: roseHelp(prefix) }, { quoted: msg });
    }

    /* ═══════════ EPISODE DOWNLOAD (zero RAM — URL stream, no buffer) ═══════════ */
    if (/^dl$/i.test(args[0]) && /^\d+$/.test(args[1] || '')) {
      const idx = parseInt(args[1], 10) - 1;
      const p = pending.get(from);

      if (!p || p.type !== 'episodes' || !p.episodes?.length) {
        return sock.sendMessage(
          from,
          {
            text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  ❌ ᴀᴄᴛɪᴠᴇ ᴀɴɪᴍᴇ ᴇᴋᴀᴋ ɴᴀʜ
┃  💡 *.animehaven <name>* වලින්
┃     පටන් ගන්න 🌸
┃
╰━━━━━━━━━━━━━━━╯`,
          },
          { quoted: msg }
        );
      }
      if (idx < 0 || idx >= p.episodes.length) {
        return sock.sendMessage(
          from,
          {
            text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  ❌ *1*–*${p.episodes.length}* තුළින් තෝරන්න 🌸
┃
╰━━━━━━━━━━━━━━━╯`,
          },
          { quoted: msg }
        );
      }

      const ep = p.episodes[idx];
      // proxy_link — referer handle කරලා, zero RAM (Baileys disk stream)
      const dlUrl = ep.proxy_link || ep.direct_link || ep.download_link || ep.link;
      const fileName = safeFileName(`${p.title} - ${ep.name || ep.title}`);

      const loading = await sock.sendMessage(
        from,
        {
          text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  🎀 ${clean(ep.name || ep.title, 30)}
┃  📤 ᴜᴘʟᴏᴀᴅ වෙමින්... 💮
┃  ⏳ ටිකක් ඉන්න 🌸
┃
╰━━━━━━━━━━━━━━━╯`,
        },
        { quoted: msg }
      );

      try {
        const caption = `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  🌸 *${clean(p.title, 44)}*
┃  🎀 ${clean(ep.name || ep.title, 40)}
┃  🎭 ${clean(p.genres, 50)}
┃  ⭐ ${clean(p.imdb, 12)} • 📅 ${clean(p.year, 10)}
┃  📄 Document (zero RAM stream)
┃
╰━━━━━━━━━━━━━━━╯
🌹 ~ᴅᴄʟ ᴍɪɴɪ ʀᴏsᴇ~`;

        // ⚡ ZERO RAM — Baileys URL stream (disk temp file, RAM buffer නැහැ)
        await sock.sendMessage(
          from,
          {
            document: { url: dlUrl },
            mimetype: 'video/mp4',
            fileName,
            caption,
          },
          { quoted: msg }
        );

        await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      } catch (e) {
        console.error('[ANIMEHAVEN] dl fail:', e.message);
        await sock.sendMessage(
          from,
          {
            text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  ❌ ᴜᴘʟᴏᴀᴅ ғᴀɪʟ වුණා 🥀
┃  \`${clean(e.message, 40)}\`
┃
┃  💡 episode link එක expire වෙලා
┃     තියෙන්න පුළුවන් — ආයෙ
┃     *.animehaven <num>* උත්සාහ කරන්න
┃
╰━━━━━━━━━━━━━━━╯`,
            edit: loading.key,
          }
        ).catch(() => {});
      }
      return;
    }

    /* ═══════════ SELECT ANIME (INFO) ═══════════ */
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const p = pending.get(from);

      if (!p || p.type !== 'search' || !p.results?.length) {
        return sock.sendMessage(
          from,
          {
            text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  ❌ ᴀᴄᴛɪᴠᴇ sᴇᴀʀᴄʜ එකක් නෑ 🥀
┃  💡 *.animehaven <name>* වලින්
┃     පටන් ගන්න 🌸
┃
╰━━━━━━━━━━━━━━━╯`,
          },
          { quoted: msg }
        );
      }
      if (idx < 0 || idx >= p.results.length) {
        return sock.sendMessage(
          from,
          {
            text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  ❌ *1*–*${p.results.length}* තුළින් තෝරන්න 🌸
┃
╰━━━━━━━━━━━━━━━╯`,
          },
          { quoted: msg }
        );
      }

      const item = p.results[idx];
      const loading = await sock.sendMessage(
        from,
        {
          text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  🌸 *${clean(item.title, 38)}*
┃  📖 ɪɴғᴏ ගන්නවා... 💮
┃  ⏳ ටිකක් ඉන්න 🌸
┃
╰━━━━━━━━━━━━━━━╯`,
        },
        { quoted: msg }
      );

      try {
        const res = await apiGet('info', { q: item.link });
        const body = res.data;

        if (res.status !== 200 || !body?.status || !body.data) {
          throw new Error(clean(body?.message || `HTTP ${res.status}`, 60));
        }

        const d = body.data;
        const eps = Array.isArray(d.downloads) ? d.downloads : [];
        if (!eps.length) throw new Error('episodes හමු නොවීය 🥀');

        clearPending(from);
        armPending(from, {
          type: 'episodes',
          episodes: eps,
          title: d.title || item.title,
          genres: d.genres || '—',
          imdb: d.imdb || '—',
          year: d.year || '—',
        });

        const card = roseInfo(d, eps);
        await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

        // poster — referer issue නිසා fail නම් text only
        if (d.image && /^https?:\/\//i.test(d.image)) {
          try {
            await sock.sendMessage(from, { image: { url: d.image }, caption: card }, { quoted: msg });
            return;
          } catch (_) { /* fall through */ }
        }
        await sock.sendMessage(from, { text: card }, { quoted: msg });
      } catch (e) {
        console.error('[ANIMEHAVEN] info fail:', e.message);
        await sock.sendMessage(
          from,
          {
            text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  ❌ ɪɴғᴏ ғᴀɪʟ වුණා 🥀
┃  \`${clean(e.message, 42)}\`
┃
╰━━━━━━━━━━━━━━━╯`,
            edit: loading.key,
          }
        ).catch(() => {});
      }
      return;
    }

    /* ═══════════ SEARCH ═══════════ */
    const query = args.join(' ').trim();
    const loading = await sock.sendMessage(
      from,
      {
        text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  🔎 *${clean(query, 38)}*
┃  🔍 හොයමින්... 💮
┃  ⏳ ටිකක් ඉන්න 🌸
┃
╰━━━━━━━━━━━━━━━╯`,
      },
      { quoted: msg }
    );

    try {
      const res = await apiGet('search', { q: query });
      const body = res.data;

      if (res.status !== 200 || !body?.status || !Array.isArray(body.data) || !body.data.length) {
        return sock.sendMessage(
          from,
          {
            text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  🥀 *"${clean(query, 36)}"* හමු නොවීය
┃
┃  💡 English නමින් try කරන්න
┃  📌 *.animehaven solo leveling*
┃
╰━━━━━━━━━━━━━━━╯`,
            edit: loading.key,
          }
        );
      }

      const results = body.data.slice(0, 15);
      clearPending(from);
      armPending(from, { type: 'search', results });

      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      await sock.sendMessage(from, { text: roseSearch(query, results) }, { quoted: msg });
    } catch (e) {
      console.error('[ANIMEHAVEN] search fail:', e.message);
      await sock.sendMessage(
        from,
        {
          text: `╭━━「 🌹ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ 」━━╮
┃
┃  ❌ sᴇᴀʀᴄʜ ғᴀɪʟ වුණා 🥀
┃  \`${clean(e.message, 42)}\`
┃
╰━━━━━━━━━━━━━━━╯`,
          edit: loading.key,
        }
      ).catch(() => {});
    }
  },
};
