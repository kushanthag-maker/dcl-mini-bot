/**
 * Persistent bot settings (MongoDB if available, else memory + optional file)
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILE = path.join(__dirname, '..', 'data', 'bot-settings.json');

const DEFAULTS = {
  botName: 'Zayra',
  logo: 'https://files.catbox.moe/4dvou4.png',
  statusSeen: false,
  antiDelete: false,
  menuStyle: 'cyber', // cyber | minimal | boxed | neon
};

let cache = { ...DEFAULTS };
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
      cache = { ...DEFAULTS, ...raw };
    }
  } catch (e) {
    cache = { ...DEFAULTS };
  }
  loaded = true;
  return cache;
}

function saveToFile() {
  try {
    ensureDir();
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.error('botSettings save error:', e.message);
  }
}

function getSettings() {
  if (!loaded) loadFromFile();
  return { ...cache };
}

function updateSettings(partial) {
  if (!loaded) loadFromFile();
  const allowed = ['botName', 'logo', 'statusSeen', 'antiDelete', 'menuStyle'];
  for (const k of allowed) {
    if (partial[k] !== undefined) cache[k] = partial[k];
  }
  saveToFile();
  return { ...cache };
}

module.exports = {
  getSettings,
  updateSettings,
  DEFAULTS,
};
