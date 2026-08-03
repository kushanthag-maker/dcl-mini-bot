/**
 * MongoDB Auth State for Baileys
 * Saves session credentials & keys to MongoDB instead of local files.
 * Supports multi-session via unique sessionId.
 */

const { MongoClient } = require('mongodb');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const chalk = require('chalk');

let client = null;
let db = null;

/**
 * Connect to MongoDB (singleton)
 */
async function connectMongo(uri) {
  if (client && client.topology && client.topology.isConnected()) {
    return db;
  }
  try {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
    await client.connect();
    db = client.db('dcl_mini_bot');
    console.log(chalk.green('[MongoDB] Connected successfully'));
    return db;
  } catch (err) {
    console.error(chalk.red('[MongoDB] Connection failed:'), err.message);
    throw err;
  }
}

/**
 * useMongoAuthState - Baileys compatible auth state stored in MongoDB
 * @param {string} mongoUri 
 * @param {string} sessionId Unique session identifier
 */
async function useMongoAuthState(mongoUri, sessionId = 'default') {
  const database = await connectMongo(mongoUri);
  const collection = database.collection('sessions');

  // Ensure index for fast lookup
  await collection.createIndex({ sessionId: 1, key: 1 }, { unique: true }).catch(() => {});

  const writeData = async (key, data) => {
    await collection.updateOne(
      { sessionId, key },
      {
        $set: {
          sessionId,
          key,
          data: JSON.stringify(data, BufferJSON.replacer),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  };

  const readData = async (key) => {
    const doc = await collection.findOne({ sessionId, key });
    if (!doc || !doc.data) return null;
    try {
      return JSON.parse(doc.data, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const removeData = async (key) => {
    await collection.deleteOne({ sessionId, key });
  };

  // Load or init credentials
  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              const value = await readData(`${type}-${id}`);
              if (value) data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
    clearSession: async () => {
      await collection.deleteMany({ sessionId });
      console.log(chalk.yellow(`[MongoDB] Session ${sessionId} cleared`));
    },
  };
}

/**
 * Graceful close
 */
async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log(chalk.yellow('[MongoDB] Connection closed'));
  }
}

module.exports = {
  useMongoAuthState,
  connectMongo,
  closeMongo,
};
