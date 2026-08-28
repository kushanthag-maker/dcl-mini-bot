/**
 * In-memory message store for anti-delete (text, image, video, audio, sticker, document)
 */
const MAX_PER_CHAT = 80;
const MAX_TOTAL = 2000;

// key: `${jid}|${id}` -> { type, content, mediaBuffer, mimetype, fileName, caption, pushName, ts }
const store = new Map();
const order = []; // FIFO keys for eviction

function storeKey(jid, id) {
  return jid + '|' + id;
}

function put(jid, id, entry) {
  if (!jid || !id || !entry) return;
  const k = storeKey(jid, id);
  if (!store.has(k)) {
    order.push(k);
  }
  store.set(k, { ...entry, savedAt: Date.now() });

  while (order.length > MAX_TOTAL) {
    const old = order.shift();
    store.delete(old);
  }

  // soft limit per chat
  let count = 0;
  for (let i = order.length - 1; i >= 0; i--) {
    if (order[i].startsWith(jid + '|')) {
      count++;
      if (count > MAX_PER_CHAT) {
        store.delete(order[i]);
        order.splice(i, 1);
      }
    }
  }
}

function get(jid, id) {
  return store.get(storeKey(jid, id)) || null;
}

function remove(jid, id) {
  const k = storeKey(jid, id);
  store.delete(k);
}

module.exports = { put, get, remove, store };
