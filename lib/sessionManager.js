/**
 * Multi-Session Manager
 * Fixed: pairing connection close is normal — keep reconnecting until registered
 */

const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const { useMongoAuthState } = require('../database/mongoAuthState');
const config = require('../config');
const logger = require('./logger');
const { loadCommands } = require('./commandHandler');
const { handleMessage } = require('../events/message');

const sessions = new Map();
let commandsLoaded = false;
let baileysVersion = null;
let versionPromise = null;

async function getVersion() {
  if (baileysVersion) return baileysVersion;
  if (versionPromise) return versionPromise;
  versionPromise = fetchLatestBaileysVersion()
    .then(function (result) {
      baileysVersion = result.version;
      versionPromise = null;
      return baileysVersion;
    })
    .catch(function () {
      versionPromise = null;
      baileysVersion = [2, 3000, 1023223821];
      return baileysVersion;
    });
  return versionPromise;
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function waitForSocketReady(sessionId, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  var start = Date.now();
  while (Date.now() - start < timeoutMs) {
    var s = sessions.get(sessionId);
    if (s && s.sock && s.sock.authState) {
      return s.sock;
    }
    await sleep(200);
  }
  throw new Error('Session took too long to start. Try again.');
}

async function startSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId is required');
  }

  var existing = sessions.get(sessionId);
  if (existing && existing.status === 'online' && existing.sock) {
    return existing;
  }
  // Allow restart if connecting got stuck
  if (existing && existing.status === 'connecting' && existing.sock) {
    return existing;
  }

  if (!config.mongoUri) {
    throw new Error('MONGODB_URI is missing! Set it in Heroku Config Vars');
  }

  if (existing && existing.sock) {
    try { existing.sock.end(undefined); } catch (e) {}
  }

  sessions.set(sessionId, {
    sock: null,
    status: 'connecting',
    user: null,
    qr: null,
    pairingCode: null,
    error: null,
    startedAt: new Date(),
    reconnectAttempts: (existing && existing.reconnectAttempts) || 0,
  });

  try {
    var auth = await useMongoAuthState(config.mongoUri, sessionId);
    var state = auth.state;
    var saveCreds = auth.saveCreds;
    var clearSession = auth.clearSession;

    var version = await getVersion();
    logger.info('[' + sessionId + '] Baileys ' + version.join('.'));

    var sock = makeWASocket({
      version: version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 250,
      getMessage: async function () { return undefined; },
    });

    var session = sessions.get(sessionId);
    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async function (update) {
      var connection = update.connection;
      var lastDisconnect = update.lastDisconnect;
      var qr = update.qr;
      var s = sessions.get(sessionId);
      if (!s) return;

      if (qr) {
        try {
          s.qr = await qrcode.toDataURL(qr);
        } catch (e) {
          s.qr = null;
        }
        if (s.status !== 'waiting_pair') s.status = 'waiting_qr';
        logger.connection('[' + sessionId + '] QR received');
      }

      if (connection === 'open') {
        s.status = 'online';
        s.user = sock.user || null;
        s.qr = null;
        s.pairingCode = null;
        s.error = null;
        s.reconnectAttempts = 0;
        logger.success('[' + sessionId + '] ONLINE as ' + (sock.user && sock.user.id ? sock.user.id : 'unknown'));
        try {
          await sock.sendPresenceUpdate('available');
        } catch (e) {}
      }

      if (connection === 'close') {
        var statusCode = 0;
        if (lastDisconnect && lastDisconnect.error instanceof Boom) {
          statusCode = lastDisconnect.error.output && lastDisconnect.error.output.statusCode
            ? lastDisconnect.error.output.statusCode
            : 0;
        }

        var reason = (lastDisconnect && lastDisconnect.error && lastDisconnect.error.message)
          ? lastDisconnect.error.message
          : 'unknown';
        logger.warn('[' + sessionId + '] Closed code=' + statusCode + ' reason=' + reason);

        var isLoggedOut =
          statusCode === DisconnectReason.loggedOut ||
          statusCode === DisconnectReason.badSession ||
          statusCode === 401 ||
          statusCode === 403;

        // Only permanent stop on real logout AFTER being registered
        if (isLoggedOut && sock.authState && sock.authState.creds && sock.authState.creds.registered) {
          s.status = 'offline';
          s.user = null;
          s.error = 'Logged out. Pair again with a new session ID.';
          try { await clearSession(); } catch (e) {}
          return;
        }

        // IMPORTANT FIX:
        // During pairing, WA closes the socket several times — this is NORMAL.
        // Always try to reconnect unless it was a permanent logout of a registered session.
        s.status = 'reconnecting';
        s.user = null;
        s.reconnectAttempts = (s.reconnectAttempts || 0) + 1;

        // Cap reconnect attempts during pairing to avoid infinite loop on bad number
        if (s.reconnectAttempts > 15) {
          s.status = 'error';
          s.error = 'Too many reconnects. Generate a new pairing code.';
          return;
        }

        var delay = Math.min(2000 * s.reconnectAttempts, 15000);
        logger.connection('[' + sessionId + '] Reconnecting in ' + delay + 'ms (attempt ' + s.reconnectAttempts + ')');

        setTimeout(function () {
          startSession(sessionId).catch(function (err) {
            logger.error('[' + sessionId + '] Reconnect failed', err);
          });
        }, delay);
      }
    });

    sock.ev.on('messages.upsert', async function (upsert) {
      var messages = upsert.messages;
      var type = upsert.type;
      if (type !== 'notify' && type !== 'append') return;

      for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        try {
          if (!msg.message) continue;
          if (msg.key.remoteJid === 'status@broadcast') continue;

          if (msg.key.fromMe) {
            var mt = Object.keys(msg.message)[0];
            var text = '';
            if (mt === 'conversation') text = msg.message.conversation || '';
            else if (mt === 'extendedTextMessage') text = (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '';
            else if (mt === 'imageMessage') text = (msg.message.imageMessage && msg.message.imageMessage.caption) || '';
            else if (mt === 'videoMessage') text = (msg.message.videoMessage && msg.message.videoMessage.caption) || '';
            if (!text.trim().startsWith(config.prefix)) continue;
          }

          await handleMessage(sock, msg);
        } catch (err) {
          logger.error('[' + sessionId + '] msg handler error', err);
        }
      }
    });

    if (!commandsLoaded) {
      await loadCommands();
      commandsLoaded = true;
    }

    return sessions.get(sessionId);
  } catch (err) {
    var s = sessions.get(sessionId);
    if (s) {
      s.status = 'error';
      s.error = err.message || String(err);
    }
    logger.error('[' + sessionId + '] Failed to start', err);
    throw err;
  }
}

async function requestPairingCode(sessionId, phoneNumber) {
  var clean = String(phoneNumber).replace(/[^0-9]/g, '');
  if (clean.length < 10 || clean.length > 15) {
    throw new Error('Invalid phone number. Use country code without +');
  }

  var session = sessions.get(sessionId);

  if (!session || !session.sock) {
    await startSession(sessionId);
  }

  var sock = await waitForSocketReady(sessionId, 15000);
  session = sessions.get(sessionId);

  if (sock.authState && sock.authState.creds && sock.authState.creds.registered) {
    throw new Error('This session is already paired. Use a different Session ID.');
  }

  // Brief settle so socket is on the network
  await sleep(1000);

  var lastErr = null;
  for (var attempt = 1; attempt <= 4; attempt++) {
    try {
      var code = await sock.requestPairingCode(clean);
      session.pairingCode = code;
      session.status = 'waiting_pair';
      session.error = null;
      session.reconnectAttempts = 0;
      logger.success('[' + sessionId + '] Pairing code: ' + code);
      return code;
    } catch (err) {
      lastErr = err;
      logger.warn('[' + sessionId + '] Pairing attempt ' + attempt + ' failed: ' + err.message);
      if (attempt < 4) {
        // If socket died, restart session then retry
        if (!sock.authState) {
          await startSession(sessionId);
          sock = await waitForSocketReady(sessionId, 10000);
          session = sessions.get(sessionId);
        }
        await sleep(1200 * attempt);
      }
    }
  }

  throw new Error((lastErr && lastErr.message) || 'Could not generate pairing code. Try again.');
}

function getAllSessions() {
  var list = [];
  sessions.forEach(function (s, id) {
    list.push({
      sessionId: id,
      status: s.status,
      user: s.user ? { id: s.user.id, name: s.user.name } : null,
      hasQr: !!s.qr,
      pairingCode: s.pairingCode,
      error: s.error,
      startedAt: s.startedAt,
    });
  });
  return list;
}

function getSessionStatus(sessionId) {
  var s = sessions.get(sessionId);
  if (!s) {
    return { sessionId: sessionId, status: 'not_started', qr: null, pairingCode: null, user: null, error: null };
  }
  return {
    sessionId: sessionId,
    status: s.status,
    qr: s.qr,
    pairingCode: s.pairingCode,
    user: s.user,
    error: s.error,
    registered: !!(s.sock && s.sock.authState && s.sock.authState.creds && s.sock.authState.creds.registered),
  };
}

async function stopSession(sessionId) {
  var s = sessions.get(sessionId);
  if (s && s.sock) {
    try { s.sock.end(undefined); } catch (e) {}
  }
  sessions.delete(sessionId);
  logger.warn('[' + sessionId + '] Stopped');
}

function getOnlineCount() {
  var n = 0;
  sessions.forEach(function (s) {
    if (s.status === 'online') n++;
  });
  return n;
}

module.exports = {
  startSession: startSession,
  requestPairingCode: requestPairingCode,
  getAllSessions: getAllSessions,
  getSessionStatus: getSessionStatus,
  stopSession: stopSession,
  getOnlineCount: getOnlineCount,
  sessions: sessions,
};
