/**
 * DCL MINI - Core Bot Logic
 * Baileys Multi-Device + MongoDB Session + Auto Reconnect
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
const { useMongoAuthState, closeMongo } = require('../database/mongoAuthState');
const config = require('../config');
const logger = require('./logger');
const { loadCommands } = require('./commandHandler');
const { handleMessage } = require('../events/message');

let sock = null;
let isConnecting = false;
let pairingCode = null;
let lastQR = null;

async function startBot(options = {}) {
  if (isConnecting) return;
  isConnecting = true;

  try {
    if (!config.mongoUri) {
      throw new Error('MONGODB_URI is missing! Set it in Heroku Config Vars (Settings → Config Vars)');
    }

    const { state, saveCreds, clearSession } = await useMongoAuthState(
      config.mongoUri,
      config.sessionId
    );

    const { version } = await fetchLatestBaileysVersion();
    logger.info(`Using Baileys version: ${version.join('.')}`);

    sock = makeWASocket({
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
      getMessage: async () => undefined,
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        lastQR = qr;
        logger.connection('QR Code received. Scan or use pairing code.');
        try {
          const qrDataUrl = await qrcode.toDataURL(qr);
          global.currentQR = qrDataUrl;
        } catch (e) {
          global.currentQR = null;
        }
      }

      if (connection === 'open') {
        isConnecting = false;
        pairingCode = null;
        global.currentQR = null;
        global.currentPairingCode = null;
        global.botStatus = 'online';
        global.botError = null;
        logger.success(`${config.botName} is now ONLINE!`);
        logger.info(`Logged in as: ${sock.user?.id || 'unknown'}`);
      }

      if (connection === 'close') {
        isConnecting = false;
        global.botStatus = 'offline';
        const statusCode = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output?.statusCode
          : 0;

        const shouldReconnect =
          statusCode !== DisconnectReason.loggedOut &&
          statusCode !== DisconnectReason.badSession;

        logger.warn(`Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
          logger.warn('Session invalid. Clearing MongoDB session...');
          await clearSession();
        }

        if (shouldReconnect) {
          logger.connection('Auto-reconnecting in 5 seconds...');
          setTimeout(() => startBot(options), 5000);
        } else {
          logger.error('Logged out. Please pair again via website.');
        }
      }
    });

    // Messages — FIXED: allow fromMe commands (self-chat)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message) continue;

        // Allow fromMe ONLY if it looks like a command (owner testing from same number)
        if (msg.key.fromMe) {
          const messageType = Object.keys(msg.message)[0];
          let text = '';
          if (messageType === 'conversation') text = msg.message.conversation || '';
          else if (messageType === 'extendedTextMessage') text = msg.message.extendedTextMessage?.text || '';
          else if (messageType === 'imageMessage') text = msg.message.imageMessage?.caption || '';
          else if (messageType === 'videoMessage') text = msg.message.videoMessage?.caption || '';

          if (!text.trim().startsWith(config.prefix)) continue; // ignore non-command self messages
        }

        try {
          await handleMessage(sock, msg);
        } catch (err) {
          logger.error('Message handler error', err);
        }
      }
    });

    // Load commands once
    await loadCommands();

    // Pairing code request helper (called from website)
    global.requestPairing = async (phoneNumber) => {
      if (!sock) throw new Error('Bot not started');
      if (sock.authState.creds.registered) {
        throw new Error('Already registered. Clear session first.');
      }
      const clean = phoneNumber.replace(/[^0-9]/g, '');
      if (clean.length < 10) throw new Error('Invalid phone number');
      const code = await sock.requestPairingCode(clean);
      pairingCode = code;
      global.currentPairingCode = code;
      logger.success(`Pairing code generated for ${clean}: ${code}`);
      return code;
    };

    global.getBotStatus = () => ({
      status: global.botStatus || 'starting',
      user: sock?.user || null,
      qr: global.currentQR || null,
      pairingCode: global.currentPairingCode || null,
      registered: sock?.authState?.creds?.registered || false,
    });

    global.restartBot = async () => {
      logger.warn('Restart requested...');
      if (sock) {
        try { sock.end(undefined); } catch {}
      }
      setTimeout(() => startBot(options), 2000);
    };

    global.shutdownBot = async () => {
      logger.warn('Shutdown requested...');
      if (sock) {
        try { sock.end(undefined); } catch {}
      }
      await closeMongo();
      process.exit(0);
    };

  } catch (err) {
    isConnecting = false;
    global.botStatus = 'error';
    global.botError = err.message || String(err);
    logger.error('Failed to start bot', err);
    throw err;
  }
}

function getSocket() {
  return sock;
}

module.exports = { startBot, getSocket };
