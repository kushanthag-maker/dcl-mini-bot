/**
 * MongoDB Auth State for Baileys
 * Compatible with mongodb driver v6
 */

const { MongoClient } = require('mongodb');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const chalk = require('chalk');

let client = null;
let db = null;
let connecting = null;

async function connectMongo(uri) {
  if (db && client) {
    try {
      // ping to verify connection is alive (works on driver 6)
      await client.db('admin').command({ ping: 1 });
      return db;
    } catch (e) {
      // connection dead — reconnect
      try { await client.close(); } catch (e2) {}
      client = null;
      db = null;
    }
  }

  if (connecting) return connecting;

  connecting = (async function () {
    try {
      client = new MongoClient(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
      });
      await client.connect();
      db = client.db('dcl_mini_bot');
      console.log(chalk.green('[MongoDB] Connected successfully'));
      connecting = null;
      return db;
    } catch (err) {
      connecting = null;
      client = null;
      db = null;
      console.error(chalk.red('[MongoDB] Connection failed:'), err.message);
      throw err;
    }
  })();

  return connecting;
}

async function useMongoAuthState(mongoUri, sessionId) {
  sessionId = sessionId || 'default';
  var database = await connectMongo(mongoUri);
  var collection = database.collection('sessions');

  await collection.createIndex({ sessionId: 1, key: 1 }, { unique: true }).catch(function () {});

  var writeData = async function (key, data) {
    await collection.updateOne(
      { sessionId: sessionId, key: key },
      {
        $set: {
          sessionId: sessionId,
          key: key,
          data: JSON.stringify(data, BufferJSON.replacer),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  };

  var readData = async function (key) {
    var doc = await collection.findOne({ sessionId: sessionId, key: key });
    if (!doc || !doc.data) return null;
    try {
      return JSON.parse(doc.data, BufferJSON.reviver);
    } catch (e) {
      return null;
    }
  };

  var removeData = async function (key) {
    await collection.deleteOne({ sessionId: sessionId, key: key });
  };

  var creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds: creds,
      keys: {
        get: async function (type, ids) {
          var data = {};
          await Promise.all(
            ids.map(async function (id) {
              var value = await readData(type + '-' + id);
              if (value) data[id] = value;
            })
          );
          return data;
        },
        set: async function (data) {
          var tasks = [];
          var categories = Object.keys(data);
          for (var i = 0; i < categories.length; i++) {
            var category = categories[i];
            var ids = Object.keys(data[category]);
            for (var j = 0; j < ids.length; j++) {
              var id = ids[j];
              var value = data[category][id];
              var key = category + '-' + id;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async function () {
      await writeData('creds', creds);
    },
    clearSession: async function () {
      await collection.deleteMany({ sessionId: sessionId });
      console.log(chalk.yellow('[MongoDB] Session ' + sessionId + ' cleared'));
    },
  };
}

async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log(chalk.yellow('[MongoDB] Connection closed'));
  }
}

module.exports = {
  useMongoAuthState: useMongoAuthState,
  connectMongo: connectMongo,
  closeMongo: closeMongo,
};
