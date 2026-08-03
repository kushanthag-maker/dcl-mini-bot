/**
 * DCL MINI - Entry Point (Heroku safe)
 */

console.log('[BOOT] Starting DCL MINI...');
console.log('[BOOT] Node version:', process.version);
console.log('[BOOT] PORT:', process.env.PORT || 'not set');

try {
  require('dotenv').config();
  console.log('[BOOT] dotenv loaded');
} catch (e) {
  console.error('[BOOT] dotenv failed:', e.message);
}

const chalk = require('chalk');
const config = require('./config');
console.log('[BOOT] config loaded, mongoUri set:', !!config.mongoUri);

const { startServer } = require('./lib/server');
console.log('[BOOT] server module loaded');

// Start web server FIRST (critical for Heroku)
try {
  startServer();
  console.log('[BOOT] Express server started');
} catch (e) {
  console.error('[BOOT] FATAL - server failed to start:', e);
  setTimeout(() => process.exit(1), 3000);
}

// Load bot after server is up
let startBot;
try {
  startBot = require('./lib/bot').startBot;
  console.log('[BOOT] bot module loaded');
} catch (e) {
  console.error('[BOOT] bot module failed to load:', e.message);
  console.error(e.stack);
}

async function startBotSafely() {
  if (!startBot) {
    console.error('[BOT] startBot not available, retrying module load in 10s...');
    setTimeout(() => {
      try {
        startBot = require('./lib/bot').startBot;
        startBotSafely();
      } catch (e) {
        console.error('[BOT] still failed:', e.message);
        setTimeout(startBotSafely, 15000);
      }
    }, 10000);
    return;
  }

  try {
    console.log('[BOT] Connecting to WhatsApp...');
    await startBot();
  } catch (err) {
    console.error('[BOT] Failed to start:', err.message);
    global.botStatus = 'error';
    global.botError = err.message || String(err);
    setTimeout(startBotSafely, 15000);
  }
}

startBotSafely();

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT]', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('SIGTERM', () => {
  console.log('[BOOT] SIGTERM received');
  process.exit(0);
});

console.log('[BOOT] Main script finished loading (bot starting in background)');
