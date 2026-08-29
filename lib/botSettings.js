/**
 * Per-session bot settings
 * Each paired bot (sessionId) has its own logo / statusSeen / antiDelete / menuStyle
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'bot-settings.json');

const DEFAULTS = {
  botName: 'Zayra',
  logo: 'https://files.catbox.moe/bp9p86.png',
  statusSeen: false,
  antiDelete: false,
  menuStyle: 'cyber',
};

/** @type {{ sessions: Record<string, object>, phoneMap: Record<string, string> }} */
let data = { sessions: {}, phoneMap: {} };
let loaded = false;

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadFromFile() {
  try {
    ensureDir();
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      // migrate old flat format → under "default"
      if (raw && !raw.sessions && (raw.logo || raw.statusSeen !== undefined)) {
        data = {
          sessions: { default: { ...DEFAULTS, ...raw } },
          phoneMap: {},
        };
        saveToFile();
      } else {
        data = {
          sessions: raw.sessions || {},
          phoneMap: raw.phoneMap || {},
        };
      }
    }
  } catch (e) {
    data = { sessions: {}, phoneMap: {} };
  }

  // migrate old default logo → new brand logo
  try {
    for (const sid of Object.keys(data.sessions || {})) {
      if (data.sessions[sid] && data.sessions[sid].logo === 'https://files.catbox.moe/4dvou4.png') {
        data.sessions[sid].logo = 'https://files.catbox.moe/bp9p86.png';
      }
    }
  } catch (_) {}

  loaded = true;
  return data;
}

function saveToFile() {
  try {
    ensureDir();
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('botSettings save error:', e.message);
  }
}

function normalizePhone(p) {
  return String(p || '').replace(/[^0-9]/g, '');
}

/**
 * Bind a WhatsApp user phone to a sessionId (when bot comes online)
 */
function bindPhoneToSession(phone, sessionId) {
  if (!loaded) loadFromFile();
  const p = normalizePhone(phone);
  if (!p || !sessionId) return;
  data.phoneMap[p] = sessionId;
  // also last-10 digits for loose match
  if (p.length > 10) data.phoneMap[p.slice(-10)] = sessionId;
  saveToFile();
}

function resolveSessionId(sessionIdOrPhone) {
  if (!loaded) loadFromFile();
  if (!sessionIdOrPhone) return null;
  const key = String(sessionIdOrPhone);
  if (data.sessions[key]) return key;
  const p = normalizePhone(key);
  if (p && data.phoneMap[p]) return data.phoneMap[p];
  if (p.length > 10 && data.phoneMap[p.slice(-10)]) return data.phoneMap[p.slice(-10)];
  return key; // treat as sessionId even if no settings yet
}

function getSettings(sessionId) {
  if (!loaded) loadFromFile();
  // always re-read so website saves apply
  loadFromFile();
  const sid = resolveSessionId(sessionId);
  if (!sid || !data.sessions[sid]) {
    return { ...DEFAULTS };
  }
  return { ...DEFAULTS, ...data.sessions[sid] };
}

function updateSettings(sessionId, partial) {
  if (!loaded) loadFromFile();
  const sid = resolveSessionId(sessionId);
  if (!sid) throw new Error('sessionId required for settings');

  const allowed = ['botName', 'logo', 'statusSeen', 'antiDelete', 'menuStyle'];
  const current = { ...DEFAULTS, ...(data.sessions[sid] || {}) };
  for (const k of allowed) {
    if (partial[k] !== undefined) current[k] = partial[k];
  }
  data.sessions[sid] = current;
  saveToFile();
  return { ...current };
}

function getSessionIdByPhone(phone) {
  if (!loaded) loadFromFile();
  const p = normalizePhone(phone);
  return data.phoneMap[p] || data.phoneMap[p.slice(-10)] || null;
}

module.exports = {
  getSettings,
  updateSettings,
  bindPhoneToSession,
  getSessionIdByPhone,
  resolveSessionId,
  DEFAULTS,
};
