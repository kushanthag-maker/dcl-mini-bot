/**
 * Group ban store — JSON file based
 * Structure: { "<groupJid>": ["userJid", ...] }
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'groupbans.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function save() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(load(), null, 2));
  } catch (e) {
    console.error('[GROUPBAN] save failed:', e.message);
  }
}

function addBan(groupJid, userJid) {
  const db = load();
  if (!db[groupJid]) db[groupJid] = [];
  if (!db[groupJid].includes(userJid)) db[groupJid].push(userJid);
  save();
}

function removeBan(groupJid, userJid) {
  const db = load();
  if (!db[groupJid]) return false;
  const before = db[groupJid].length;
  db[groupJid] = db[groupJid].filter((j) => j !== userJid);
  save();
  return db[groupJid].length !== before;
}

function isBanned(groupJid, userJid) {
  return (load()[groupJid] || []).includes(userJid);
}

module.exports = { addBan, removeBan, isBanned };
