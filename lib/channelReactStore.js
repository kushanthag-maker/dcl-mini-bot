/**
 * Channel react store + helpers
 * data/channel-react.json
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'channel-react.json');
const FOOTER = 'DARK QUEEN OFC';

const DEFAULT = {
  /** channelJid -> { emojis: string[], enabled: true, addedBy, addedAt } */
  autoChannels: {},
  stats: {
    totalReacts: 0,
    totalPosts: 0,
    byChannel: {},
  },
};

function ensure() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify(DEFAULT, null, 2));
  }
}

function load() {
  try {
    ensure();
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      autoChannels: raw.autoChannels || {},
      stats: {
        totalReacts: raw.stats?.totalReacts || 0,
        totalPosts: raw.stats?.totalPosts || 0,
        byChannel: raw.stats?.byChannel || {},
      },
    };
  } catch (_) {
    return JSON.parse(JSON.stringify(DEFAULT));
  }
}

function save(data) {
  try {
    ensure();
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[channelReact] save:', e.message);
  }
}

function bumpStats(channelJid, reactCount) {
  const data = load();
  data.stats.totalReacts += reactCount;
  data.stats.totalPosts += 1;
  if (!data.stats.byChannel[channelJid]) {
    data.stats.byChannel[channelJid] = { reacts: 0, posts: 0 };
  }
  data.stats.byChannel[channelJid].reacts += reactCount;
  data.stats.byChannel[channelJid].posts += 1;
  save(data);
  return data.stats;
}

/**
 * Parse WhatsApp channel post link
 * https://whatsapp.com/channel/0029Va.../123
 * https://www.whatsapp.com/channel/ID/MSG
 */
function parseChannelLink(text) {
  const s = String(text || '').trim();
  const m = s.match(
    /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)(?:\/(\d+))?/i
  );
  if (!m) return null;
  return {
    inviteOrId: m[1],
    serverId: m[2] || null,
    raw: s,
  };
}

/** 120363...@newsletter */
function normalizeNewsletterJid(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (s.endsWith('@newsletter')) return s;
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length >= 15) return digits + '@newsletter';
  return null;
}

module.exports = {
  load,
  save,
  bumpStats,
  parseChannelLink,
  normalizeNewsletterJid,
  FOOTER,
  FILE,
};
