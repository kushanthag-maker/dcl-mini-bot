const axios = require('axios');
const config = require('../../config');

const API_KEY = 'dq_live_16fIbsPbP_AaiRebSXuG1OrTeAqAz4vhtXyEFSYX';
const BASE = 'https://helen-bay-consensus-lift.trycloudflare.com';
const LATEST_API = BASE + '/v1/latest';
const ARTICLE_API = BASE + '/v1/article';
const BOT_LINK = 'https://dark-queen.vercel.app/';
const BAR = '━'.repeat(28);

const pending = new Map(); // from -> { results }
const TTL = 5 * 60 * 1000;

/* ---------------- helpers ---------------- */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
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

/* ---------------- API ---------------- */
async function fetchLatest(limit = 10) {
  const res = await axios.get(LATEST_API, { headers: apiHeaders(), params: { limit }, timeout: 30000, validateStatus: () => true });
  if (res.status !== 200 || !res.data || res.data.success === false)
    throw new Error((res.data && res.data.error) || `Latest HTTP ${res.status}`);
  const data = res.data.data || res.data.news || res.data.articles || [];
  return Array.isArray(data) ? data : [];
}

async function fetchArticle(id) {
  const res = await axios.get(`${ARTICLE_API}/${id}`, { headers: apiHeaders(), timeout: 30000, validateStatus: () => true });
  if (res.status !== 200 || !res.data || res.data.success === false)
    throw new Error((res.data && res.data.error) || `Article HTTP ${res.status}`);
  return res.data.data || res.data.article || res.data;
}

/* ---------------- builders ---------------- */
function articleTitle(a) {
  return a.title || a.headline || a.heading || 'Untitled';
}
function articleImage(a) {
  return a.image || a.image_url || a.thumbnail || a.img || '';
}
function articleBody(a) {
  return a.content || a.body || a.description || a.summary || a.text || '';
}
function articleLink(a) {
  return a.url || a.link || (a.id ? `${BASE}/article/${a.id}` : '');
}

function buildList(results) {
  const lines = [
    `│  📰 *ADADERANA — Latest News*`,
    `│  🔥 ${results.length} articles`,
    `│`,
  ];
  results.forEach((a, i) => {
    lines.push(`│  *${i + 1}.* ${clean(articleTitle(a), 48)}`);
  });
  lines.push(`│`, `│  👇 *${config.prefix || '.'}adaderana <number>*  → full article`);
  return `╭${BAR}╮\n${lines.join('\n')}\n${footer()}`;
}

function buildArticleCard(a) {
  const title = clean(articleTitle(a), 45);
  let t = `╭${BAR}╮\n`;
  t += `│  📰 *${title}*\n`;
  t += `│\n`;
  if (a.publishedAt || a.date || a.pubDate) t += `│  🕒 *${clean(a.publishedAt || a.date || a.pubDate, 30)}*\n`;
  if (a.category || a.section || a.source) t += `│  🗂️ ${clean(a.category || a.section || a.source, 35)}\n`;
  t += `│\n│  📄 *Full article doc එකක් ලෙස එව්වා 👇*\n`;
  return t + footer();
}

function buildArticleDoc(a) {
  let t = '';
  t += `📰 *ADADERANA ARTICLE*\n═${BAR}═\n\n`;
  t += `🖼️ *Image:* ${articleImage(a) || 'N/A'}\n\n`;
  t += `📰 *Title:* ${articleTitle(a)}\n`;
  if (a.publishedAt || a.date || a.pubDate) t += `🕒 *Published:* ${a.publishedAt || a.date || a.pubDate}\n`;
  if (a.category || a.section || a.source) t += `🗂️ *Category:* ${a.category || a.section || a.source}\n`;
  if (articleLink(a)) t += `🔗 *Source:* ${articleLink(a)}\n`;
  t += `\n📖 *Article:*\n${(articleBody(a) || 'N/A').slice(0, 5000)}\n\n`;
  t += `🖤 Dark Queen • ${BOT_LINK}\n`;
  return t;
}

function fileName(a) {
  return String(articleTitle(a))
    .replace(/[^\w\u0d80-\u0dff\- ]+/g, '').replace(/ +/g, '_').slice(0, 60) + '.txt';
}

/* ---------------- command ---------------- */
module.exports = {
  name: 'adaderana',
  aliases: ['news', 'adaderana', 'adnews'],
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
      const a = state.results[idx];
      if (state.timeout) clearTimeout(state.timeout);
      pending.delete(from);

      // fetch full article
      const id = a.id || a.articleId || a.slug;
      if (!id) {
        // article has no separate id endpoint → just show what we have
        const img = articleImage(a);
        const caption = buildArticleCard(a);
        if (img && /^https?:\/\//i.test(img)) {
          await sock.sendMessage(from, { image: { url: img }, caption }, { quoted: msg }).catch(() => {});
        } else {
          await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
        }
        const doc = Buffer.from(buildArticleDoc(a), 'utf8');
        return sock.sendMessage(from, { document: doc, mimetype: 'text/plain', fileName: fileName(a), caption: `📰 ${clean(articleTitle(a), 55)}\n🖤 ${BOT_LINK}` }, { quoted: msg }).catch(() => {});
      }

      const loading = await sock.sendMessage(from, { text: `⏳ *Article ${idx + 1} ලබාගන්නවා...*` }, { quoted: msg }).catch(() => null);
      try {
        const full = await fetchArticle(id);
        const merged = { ...a, ...full };
        if (loading) await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

        const img = articleImage(merged);
        const caption = buildArticleCard(merged);
        // image + caption card
        if (img && /^https?:\/\//i.test(img)) {
          await sock.sendMessage(from, { image: { url: img }, caption }, { quoted: msg }).catch(() => {});
        } else {
          await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
        }
        // full article document
        const doc = Buffer.from(buildArticleDoc(merged), 'utf8');
        await sock.sendMessage(from, {
          document: doc, mimetype: 'text/plain', fileName: fileName(merged),
          caption: `📰 ${clean(articleTitle(merged), 55)}\n🖤 ${BOT_LINK}`,
        }, { quoted: msg }).catch(() => {});
      } catch (err) {
        console.error('[Adaderana] article:', err.message);
        if (loading) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
      }
      return;
    }

    // ---- help ----
    if (!args.length && args.length === 0 && !/[^0-9]/.test(args[0] || '')) {
      // handled by number branch above
    }
    if (!args.length) {
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
      return;
    }

    // ---- direct article link/id ----
    const query = args.join(' ').trim();
    const linkMatch = query.match(/https?:\/\/[^\s]+\/(?:article|news)\/([a-zA-Z0-9_-]+)/i);
    const idMatch = query.match(/^[a-zA-Z0-9_-]{8,}$/);
    let articleId = null;
    if (linkMatch) articleId = linkMatch[1];
    else if (idMatch) articleId = query;

    if (articleId) {
      const loading = await sock.sendMessage(from, { text: '⏳ *Article ලබාගන්නවා...*' }, { quoted: msg }).catch(() => null);
      try {
        const full = await fetchArticle(articleId);
        if (loading) await sock.sendMessage(from, { delete: loading.key }).catch(() => {});
        const img = articleImage(full);
        const caption = buildArticleCard(full);
        if (img && /^https?:\/\//i.test(img)) {
          await sock.sendMessage(from, { image: { url: img }, caption }, { quoted: msg }).catch(() => {});
        } else {
          await sock.sendMessage(from, { text: caption }, { quoted: msg }).catch(() => {});
        }
        const doc = Buffer.from(buildArticleDoc(full), 'utf8');
        await sock.sendMessage(from, {
          document: doc, mimetype: 'text/plain', fileName: fileName(full),
          caption: `📰 ${clean(articleTitle(full), 55)}\n🖤 ${BOT_LINK}`,
        }, { quoted: msg }).catch(() => {});
      } catch (err) {
        console.error('[Adaderana] article:', err.message);
        if (loading) await sock.sendMessage(from, { text: `❌ \`${err.message}\``, edit: loading.key }).catch(() => {});
      }
    } else {
      return sock.sendMessage(from, {
        text: `╭${BAR}╮\n│  📰 *ADADERANA*\n│\n│  ${prefix}adaderana        → latest news\n│  ${prefix}adaderana <n>   → full article\n│  ${prefix}adaderana <link/id>\n│\n│  ✨ Example:\n│  ${prefix}adaderana\n│  ${prefix}adaderana 2\n${footer()}`,
      }, { quoted: msg }).catch(() => {});
    }
  },
};
