const axios = require('axios');
const config = require('../../config'); // ඔයාගේ config file path එක හරියටම තියන්න

const API_KEY = 'dq_live_16fIbsPbP_AaiRebSXuG1OrTeAqAz4vhtXyEFSYX';

// ⚠️ අනිවාර්යයෙන්ම පහත URL එක ඔබගේ දැනට වැඩ කරන අලුත්ම API URL එකට මාරු කරන්න ⚠️
const BASE = 'https://helen-bay-consensus-lift.trycloudflare.com'; 

const LATEST_API = BASE + '/v1/latest';
const ARTICLE_API = BASE + '/v1/article';
const BOT_LINK = 'https://dark-queen.vercel.app/';
const BAR = '━'.repeat(28);

const pending = new Map();
const TTL = 5 * 60 * 1000; // විනාඩි 5යි

/* ---------------- helpers ---------------- */
function footer() {
  return `│\n╰${BAR}╯\n🖤 *Dark Queen*  •  ${BOT_LINK}`;
}

function clean(str, len = 55) {
  const s = String(str || 'N/A').trim();
  return s.length > len ? s.slice(0, len) + '…' : s;
}

function apiHeaders() {
  return { 'X-API-Key': API_KEY };
}

/* ---------------- API Requests ---------------- */
async function fetchLatest(limit = 10) {
  try {
    const res = await axios.get(LATEST_API, {
      headers: apiHeaders(),
      params: { limit },
      timeout: 15000 // තත්පර 15කට වඩා ගියොත් cancel වෙනවා
    });
    
    if (res.data && res.data.success === true) {
      return Array.isArray(res.data.data) ? res.data.data : [];
    }
    throw new Error('Invalid API Response');
  } catch (error) {
    console.error('[API Error - Latest]:', error.message);
    throw new Error('API එකට සම්බන්ධ වීමට නොහැක. URL එක පරීක්ෂා කරන්න.');
  }
}

async function fetchArticle(id) {
  try {
    const res = await axios.get(`${ARTICLE_API}/${id}`, {
      headers: apiHeaders(),
      timeout: 15000
    });
    
    if (res.data && res.data.success === true) {
      return res.data.data;
    }
    throw new Error('Invalid API Response');
  } catch (error) {
    console.error('[API Error - Article]:', error.message);
    throw new Error('Article එක ලබාගැනීමට නොහැක. URL එක හෝ ID එක පරීක්ෂා කරන්න.');
  }
}

/* ---------------- builders ---------------- */
function buildList(results, prefix) {
  const lines = [
    `│  📰 *ADADERANA — Latest News*`,
    `│  🔥 ${results.length} articles`,
    `│`,
  ];
  results.forEach((a, i) => {
    lines.push(`│  *${i + 1}.* ${clean(a.title, 48)}`);
  });
  lines.push(`│`, `│  👇 *${prefix}adaderana <number>*  → full article`);
  return `╭${BAR}╮\n${lines.join('\n')}\n${footer()}`;
}

function buildArticleCard(a) {
  let t = `╭${BAR}╮\n`;
  t += `│  📰 *${clean(a.title, 45)}*\n│\n`;
  if (a.published_at) t += `│  🕒 *${clean(String(a.published_at).slice(0, 10), 20)}*\n`;
  if (a.author) t += `│  ✍️ *${clean(a.author, 30)}*\n`;
  if (a.source) t += `│  🗂️ ${clean(a.source, 30)}\n`;
  t += `│\n│  📄 *Full article doc එකක් ලෙස එව්වා 👇*\n`;
  return t + footer();
}

function buildArticleDoc(a) {
  let t = '';
  t += `📰 *ADADERANA ARTICLE*\n═${BAR}═\n\n`;
  if (a.image) t += `🖼️ *Image:* ${a.image}\n\n`;
  t += `📰 *Title:* ${a.title || 'N/A'}\n`;
  if (a.published_at) t += `🕒 *Published:* ${a.published_at}\n`;
  if (a.author) t += `✍️ *Author:* ${a.author}\n`;
  if (a.source) t += `🗂️ *Source:* ${a.source}\n`;
  if (a.url) t += `🔗 *Link:* ${a.url}\n`;
  t += `\n📖 *Article:*\n${(a.content || 'N/A').slice(0, 5000)}\n\n`;
  t += `🖤 Dark Queen • ${BOT_LINK}\n`;
  return t;
}

function fileName(a) {
  return String(a.title || 'Adaderana_Article')
    .replace(/[^\w\u0d80-\u0dff\- ]+/g, '').replace(/ +/g, '_').slice(0, 50) + '.txt';
}

/* ---------------- send article ---------------- */
async function sendArticle(sock, from, msg, a) {
  const img = a.image || '';
  const caption = buildArticleCard(a);
  
  // 1) Image + Caption
  if (img && /^https?:\/\//i.test(img)) {
    await sock.sendMessage(from, { image: { url: img }, caption }, { quoted: msg }).catch(() => {});
  } else {
    await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
  }
  
  // 2) Text Document
  const doc = Buffer.from(buildArticleDoc(a), 'utf8');
  await sock.sendMessage(from, {
    document: doc,
    mimetype: 'text/plain',
    fileName: fileName(a),
    caption: `📰 ${clean(a.title, 55)}\n🖤 ${BOT_LINK}`
  }, { quoted: msg }).catch(() => {});
}

/* ---------------- command ---------------- */
module.exports = {
  name: 'adaderana',
  aliases: ['news', 'adnews'],
  description: 'Get latest Adaderana news + full articles',
  category: 'utility',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // ---- 1. Number එකක් ලබා දුන් විට (Article by Number) ----
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const state = pending.get(from);
      
      if (!state || !state.results) {
        return sock.sendMessage(from, { text: `❌ Active news list එකක් නැහැ. මුලින් \`${prefix}adaderana\` ලෙස type කරන්න.` }, { quoted: msg });
      }
      if (idx < 0 || idx >= state.results.length) {
        return sock.sendMessage(from, { text: `❌ කරුණාකර *1* සිට *${state.results.length}* අතර අංකයක් ලබා දෙන්න.` }, { quoted: msg });
      }
      
      const item = state.results[idx];
      if (state.timeout) clearTimeout(state.timeout);
      pending.delete(from);

      const loadingMsg = await sock.sendMessage(from, { text: `⏳ *Article ${idx + 1} ලබාගන්නවා...*` }, { quoted: msg });
      try {
        const full = await fetchArticle(item.id);
        if (loadingMsg) await sock.sendMessage(from, { delete: loadingMsg.key }).catch(() => {});
        await sendArticle(sock, from, msg, full);
      } catch (err) {
        if (loadingMsg) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loadingMsg.key }).catch(() => {});
      }
      return;
    }

    // ---- 2. Article ID එකක් ලබා දුන් විට ----
    const query = args.join(' ').trim();
    const idMatch = query.match(/^[a-zA-Z0-9]{8,}$/);
    
    if (idMatch && args.length === 1) {
      const loadingMsg = await sock.sendMessage(from, { text: '⏳ *Article ලබාගන්නවා...*' }, { quoted: msg });
      try {
        const full = await fetchArticle(idMatch[0]);
        if (loadingMsg) await sock.sendMessage(from, { delete: loadingMsg.key }).catch(() => {});
        await sendArticle(sock, from, msg, full);
      } catch (err) {
        if (loadingMsg) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loadingMsg.key }).catch(() => {});
      }
      return;
    }

    // ---- 3. Help Menu එක පෙන්වීම ----
    if (args.length && args[0].toLowerCase() !== 'latest') {
      return sock.sendMessage(from, {
        text: `╭${BAR}╮\n│  📰 *ADADERANA NEWS*\n│\n│  ${prefix}adaderana        → නවතම පුවත්\n│  ${prefix}adaderana <අංකය>   → සම්පූර්ණ පුවත\n│\n│  ✨ උදාහරණ:\n│  ${prefix}adaderana\n│  ${prefix}adaderana 2\n${footer()}`,
      }, { quoted: msg });
    }

    // ---- 4. Latest News ලබා ගැනීම (Default) ----
    const loadingMsg = await sock.sendMessage(from, { text: '📰 *නවතම පුවත් ලබාගන්නවා...*' }, { quoted: msg });
    try {
      const results = await fetchLatest(10);
      
      if (!results.length) {
        return sock.sendMessage(from, { text: '❌ පුවත් හමු නොවීය.', edit: loadingMsg.key });
      }
      
      pending.set(from, { results, timeout: setTimeout(() => pending.delete(from), TTL) });
      
      if (loadingMsg) await sock.sendMessage(from, { delete: loadingMsg.key }).catch(() => {});
      await sock.sendMessage(from, { text: buildList(results, prefix) }, { quoted: msg });
      
    } catch (err) {
      if (loadingMsg) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loadingMsg.key }).catch(() => {});
    }
  },
};
