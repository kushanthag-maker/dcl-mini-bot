const axios = require('axios');
const config = require('../../config');

const API_KEY = 'dq_live_16fIbsPbP_AaiRebSXuG1OrTeAqAz4vhtXyEFSYX';
const BASE = 'https://helen-bay-consensus-lift.trycloudflare.com';
const LATEST_API = BASE + '/v1/latest';
const ARTICLE_API = BASE + '/v1/article';
const BOT_LINK = 'https://dark-queen.vercel.app/';
const BAR = '━'.repeat(28);

const pending = new Map();
const TTL = 5 * 60 * 1000;

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

/* ---------------- API (exact field mapping) ---------------- */
async function fetchLatest(limit = 10) {
  const res = await axios.get(LATEST_API, {
    headers: apiHeaders(),
    params: { limit },
    timeout: 30000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.success !== true)
    throw new Error((res.data && res.data.error) || `Latest HTTP ${res.status}`);
  const data = res.data.data;
  return Array.isArray(data) ? data : [];
}

async function fetchArticle(id) {
  const res = await axios.get(`${ARTICLE_API}/${id}`, {
    headers: apiHeaders(),
    timeout: 30000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.success !== true)
    throw new Error((res.data && res.data.error) || `Article HTTP ${res.status}`);
  return res.data.data; // object
}

/* ---------------- builders ---------------- */
function buildList(results) {
  const lines = [
    `│  📰 *ADADERANA — Latest News*`,
    `│  🔥 ${results.length} articles`,
    `│`,
  ];
  results.forEach((a, i) => {
    lines.push(`│  *${i + 1}.* ${clean(a.title, 48)}`);
  });
  lines.push(`│`, `│  👇 *${config.prefix || '.'}adaderana <number>*  → full article`);
  return `╭${BAR}╮\n${lines.join('\n')}\n${footer()}`;
}

function buildArticleCard(a) {
  let t = `╭${BAR}╮\n`;
  t += `│  📰 *${clean(a.title, 45)}*\n`;
  t += `│\n`;
  if (a.published_at) t += `│  🕒 *${clean(String(a.published_at).slice(0, 10), 20)}*\n`;
  if (a.author) t += `│  ✍️ *${clean(a.author, 30)}*\n`;
  if (a.source) t += `│  🗂️ ${clean(a.source, 30)}\n`;
  t += `│\n│  📄 *Full article doc එකක් ලෙස එව්වා 👇*\n`;
  return t + footer();
}

function buildArticleDoc(a) {
  let t = '';
  t += `📰 *ADADERANA ARTICLE*\n═${BAR}═\n\n`;
  t += `🖼️ *Image:* ${a.image || 'N/A'}\n\n`;
  t += `📰 *Title:* ${a.title || 'N/A'}\n`;
  if (a.published_at) t += `🕒 *Published:* ${a.published_at}\n`;
  if (a.modified_at) t += `🔄 *Modified:* ${a.modified_at}\n`;
  if (a.author) t += `✍️ *Author:* ${a.author}\n`;
  if (a.publisher) t += `🏢 *Publisher:* ${a.publisher}\n`;
  if (a.source) t += `🗂️ *Source:* ${a.source}\n`;
  if (a.url) t += `🔗 *Link:* ${a.url}\n`;
  t += `\n📖 *Article:*\n${(a.content || 'N/A').slice(0, 5000)}\n\n`;
  t += `🖤 Dark Queen • ${BOT_LINK}\n`;
  return t;
}

function fileName(a) {
  return String(a.title || 'Adaderana_Article')
    .replace(/[^\w\u0d80-\u0dff\- ]+/g, '').replace(/ +/g, '_').slice(0, 60) + '.txt';
}

/* ---------------- send article ---------------- */
async function sendArticle(sock, from, msg, a) {
  const img = a.image || '';
  const caption = buildArticleCard(a);
  // 1) image + caption card
  if (img && /^https?:\/\//i.test(img)) {
    await sock.sendMessage(from, { image: { url: img }, caption }, { quoted: msg }).catch(() => {});
  } else {
    await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
  }
  // 2) full article document
  const doc = Buffer.from(buildArticleDoc(a), 'utf8');
  await sock.sendMessage(from, {
    document: doc,
    mimetype: 'text/plain',
    fileName: fileName(a),
    caption: `📰 ${clean(a.title, 55)}\n🖤 ${BOT_LINK}`,
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

    // ---- pick article by number ----
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const state = pending.get(from);
      if (!state || !state.results) {
        return sock.sendMessage(from, { text: `❌ Active news list නැහැ.\n💡 \`${prefix}adaderana\`` }, { quoted: msg });
      }
      if (idx < 0 || idx >= state.results.length) {
        return sock.sendMessage(from, { text: `❌ *1*–*${state.results.length}* අතර number එකක් දෙන්න.` }, { quoted: msg });
      }
      const item = state.results[idx];
      if (state.timeout) clearTimeout(state.timeout);
      pending.delete(from);

      const loading = await sock.sendMessage(from, { text: `⏳ *Article ${idx + 1} ලබාගන්නවා...*` }, { quoted: msg }).catch(() => null);
      try {
        const full = await fetchArticle(item.id);
        if (loading) await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
        await sendArticle(sock, from, msg, full);
      } catch (err) {
        console.error('[Adaderana] article:', err.message);
        if (loading) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
      }
      return;
    }

    // ---- direct article id ----
    const query = args.join(' ').trim();
    const idMatch = query.match(/^[a-zA-Z0-9]{8,}$/);
    if (idMatch) {
      const loading = await sock.sendMessage(from, { text: '⏳ *Article ලබාගන්නවා...*' }, { quoted: msg }).catch(() => null);
      try {
        const full = await fetchArticle(idMatch[0]);
        if (loading) await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
        await sendArticle(sock, from, msg, full);
      } catch (err) {
        console.error('[Adaderana] article:', err.message);
        if (loading) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
      }
      return;
    }

    // ---- help / latest ----
    if (args.length && args.join(' ').trim() !== 'latest') {
      return sock.sendMessage(from, {
        text: `╭${BAR}╮\n│  📰 *ADADERANA*\n│\n│  ${prefix}adaderana        → latest news\n│  ${prefix}adaderana <n>   → full article\n│  ${prefix}adaderana <id>  → full article\n│\n│  ✨ Example:\n│  ${prefix}adaderana\n│  ${prefix}adaderana 2\n${footer()}`,
      }, { quoted: msg }).catch(() => {});
    }

    // fetch latest
    const loading = await sock.sendMessage(from, { text: '📰 *Latest news ලබාගන්නවා...*' }, { quoted: msg }).catch(() => null);
    try {
      const results = await fetchLatest(10);
      if (!results.length) {
        return sock.sendMessage(from, { text: '❌ News හමු නොවීය.', edit: loading.key }).catch(() => {});
      }
      pending.set(from, { results, timeout: setTimeout(() => pending.delete(from), TTL) });
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
      await sock.sendMessage(from, { text: buildList(results) }, { quoted: msg }).catch(() => {});
    } catch (err) {
      console.error('[Adaderana] latest:', err.message);
      if (loading) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
    }
  },
};
