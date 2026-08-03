/**
 * Multi-Session Manager
 * Stable multi-device WhatsApp bots with MongoDB sessions
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

async function getVersion() {
  if (!baileysVersion) {
    const { version } = await fetchLatestBaileysVersion();
    baileysVersion = version;
  }
  return baileysVersion;
}

async function startSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId is required');
  }

  const existing = sessions.get(sessionId);
  if (existing && existing.status === 'online' && existing.sock) {
    return existing;
  }
  if (existing && (existing.status === 'connecting' || existing.status === 'reconnecting')) {
    return existing;
  }

  if (!config.mongoUri) {
    throw new Error('MONGODB_URI is missing! Set it in Heroku Config Vars');
  }

  if (existing?.sock) {
    try { existing.sock.end(undefined); } catch {}
  }

  sessions.set(sessionId, {
    sock: null,
    status: 'connecting',
    user: null,
    qr: null,
    pairingCode: null,
    error: null,
    startedAt: new Date(),
    reconnectAttempts: existing?.reconnectAttempts || 0,
  });

  try {
    const { state, saveCreds, clearSession } = await useMongoAuthState(
      config.mongoUri,
      sessionId
    );

    const version = await getVersion();
    logger.info(`[${sessionId}] Baileys ${version.join('.')}`);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 500,
      getMessage: async () => undefined,
    });

    const session = sessions.get(sessionId);
    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const s = sessions.get(sessionId);
      if (!s) return;

      if (qr) {
        try {
          s.qr = await qrcode.toDataURL(qr);
        } catch {
          s.qr = null;
        }
        s.status = 'waiting_qr';
        logger.connection(`[${sessionId}] QR received`);
      }

      if (connection === 'open') {
        s.status = 'online';
        s.user = sock.user || null;
        s.qr = null;
        s.pairingCode = null;
        s.error = null;
        s.reconnectAttempts = 0;
        logger.success(`[${sessionId}] ONLINE as ${sock.user?.id || 'unknown'}`);
        try {
          await sock.sendPresenceUpdate('available');
        } catch {}
      }

      if (connection === 'close') {
        const statusCode =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output?.statusCode
            : 0;

        const reason = lastDisconnect?.error?.message || 'unknown';
        logger.warn(`[\( {sessionId}] Closed code= \){statusCode} reason=${reason}`);

        const isLoggedOut =
          statusCode === DisconnectReason.loggedOut ||
          statusCode === DisconnectReason.badSession ||
          statusCode === 401 ||
          statusCode === 403;

        if (isLoggedOut) {
          s.status = 'offline';
          s.user = null;
          s.error = 'Logged out. Pair again with a new session ID.';
          try { await clearSession(); } catch {}
          return;
        }

        s.status = 'reconnecting';
        s.user = null;
        s.reconnectAttempts = (s.reconnectAttempts || 0) + 1;

        const delay = Math.min(5000 * s.reconnectAttempts, 30000);
        logger.connection(`[${sessionId}] Reconnecting in ${delay}ms (attempt ${s.reconnectAttempts})`);

        setTimeout(() => {
          startSession(sessionId).catch((err) => {
            logger.error(`[${sessionId}] Reconnect failed`, err);
          });
        }, delay);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;

      for (const msg of messages) {
        try {
          if (!msg.message) continue;
          if (msg.key.remoteJid === 'status@broadcast') continue;

          if (msg.key.fromMe) {
            const mt = Object.keys(msg.message)[0];
            let text = '';
            if (mt === 'conversation') text = msg.message.conversation || '';
            else if (mt === 'extendedTextMessage') text = msg.message.extendedTextMessage?.text || '';
            else if (mt === 'imageMessage') text = msg.message.imageMessage?.caption || '';
            else if (mt === 'videoMessage') text = msg.message.videoMessage?.caption || '';
            if (!text.trim().startsWith(config.prefix)) continue;
          }

          await handleMessage(sock, msg);
        } catch (err) {
          logger.error(`[${sessionId}] msg handler error`, err);
        }
      }
    });

    if (!commandsLoaded) {
      await loadCommands();
      commandsLoaded = true;
    }

    return sessions.get(sessionId);
  } catch (err) {
    const s = sessions.get(sessionId);
    if (s) {
      s.status = 'error';
      s.error = err.message || String(err);
    }
    logger.error(`[${sessionId}] Failed to start`, err);
    throw err;
  }
}

async function requestPairingCode(sessionId, phoneNumber) {
  let session = sessions.get(sessionId);

  if (!session || !session.sock) {
    await startSession(sessionId);
    session = sessions.get(sessionId);
    await new Promise((r) => setTimeout(r, 2500));
  }

  const sock = session?.sock;
  if (!sock) throw new Error('Session not ready. Try again in a few seconds.');

  if (sock.authState?.creds?.registered) {
    throw new Error('This session is already paired. Use a different Session ID for another number.');
  }

  const clean = String(phoneNumber).replace(/[^0-9]/g, '');
  if (clean.length < 10 || clean.length > 15) {
    throw new Error('Invalid phone number. Use country code without +');
  }

  const code = await sock.requestPairingCode(clean);
  session.pairingCode = code;
  session.status = 'waiting_pair';
  logger.success(`[${sessionId}] Pairing code: ${code}`);
  return code;
}

function getAllSessions() {
  const list = [];
  for (const [id, s] of sessions.entries()) {
    list.push({
      sessionId: id,
      status: s.status,
      user: s.user ? { id: s.user.id, name: s.user.name } : null,
      hasQr: !!s.qr,
      pairingCode: s.pairingCode,
      error: s.error,
      startedAt: s.startedAt,
    });
  }
  return list;
}

function getSessionStatus(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) {
    return { sessionId, status: 'not_started', qr: null, pairingCode: null, user: null, error: null };
  }
  return {
    sessionId,
    status: s.status,
    qr: s.qr,
    pairingCode: s.pairingCode,
    user: s.user,
    error: s.error,
    registered: s.sock?.authState?.creds?.registered || false,
  };
}

async function stopSession(sessionId) {
  const s = sessions.get(sessionId);
  if (s?.sock) {
    try { s.sock.end(undefined); } catch {}
  }
  sessions.delete(sessionId);
  logger.warn(`[${sessionId}] Stopped`);
}

function getOnlineCount() {
  let n = 0;
  for (const s of sessions.values()) {
    if (s.status === 'online') n++;
  }
  return n;
}

module.exports = {
  startSession,
  requestPairingCode,
  getAllSessions,
  getSessionStatus,
  stopSession,
  getOnlineCount,
  sessions,
};
