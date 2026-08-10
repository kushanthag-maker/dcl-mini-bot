const { connectMongo } = require('../database/mongoAuthState');
const config = require('../config');

const COLLECTION = 'ai_coins';

async function getCollection() {
  const db = await connectMongo(config.mongoUri);
  const col = db.collection(COLLECTION);
  await col.createIndex({ number: 1 }, { unique: true }).catch(() => {});
  return col;
}

async function getCoins(number) {
  const col = await getCollection();
  const doc = await col.findOne({ number: String(number) });
  return doc?.coins || 0;
}

async function setCoins(number, amount) {
  const col = await getCollection();
  const coins = Math.max(0, parseInt(amount) || 0);
  await col.updateOne(
    { number: String(number) },
    {
      $set: {
        number: String(number),
        coins,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  return coins;
}

async function addCoins(number, amount) {
  const col = await getCollection();
  const add = parseInt(amount) || 0;
  const result = await col.findOneAndUpdate(
    { number: String(number) },
    {
      $inc: { coins: add },
      $set: { updatedAt: new Date() },
      $setOnInsert: { number: String(number), createdAt: new Date() },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return result?.coins ?? result?.value?.coins ?? add;
}

async function useCoin(number) {
  const col = await getCollection();
  const result = await col.findOneAndUpdate(
    { number: String(number), coins: { $gt: 0 } },
    {
      $inc: { coins: -1 },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  );
  if (!result && !result?.value) {
    // driver v6 shape differences
    const current = await getCoins(number);
    if (current <= 0) return { ok: false, coins: 0 };
  }
  const doc = result?.value || result;
  if (!doc) {
    const current = await getCoins(number);
    return { ok: false, coins: current };
  }
  return { ok: true, coins: doc.coins };
}

async function getAllUsers() {
  const col = await getCollection();
  return col.find({}).project({ number: 1, coins: 1 }).toArray();
}

module.exports = {
  getCoins,
  setCoins,
  addCoins,
  useCoin,
  getAllUsers,
};
