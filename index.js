/**
 * DCL MINI - Multi-Session WhatsApp Bot
 * Entry Point (Heroku safe)
 */

console.log('[BOOT] Starting DCL MINI Multi-Session...');
console.log('[BOOT] Node version:', process.version);
console.log('[BOOT] PORT:', process.env.PORT || 'not set');

try {
  require('dotenv').config();
  console.log('[BOOT] dotenv loaded');
} catch (e) {
  console.error('[BOOT] dotenv failed:', e.message);
}

const config = require('./config');
console.log('[BOOT] config loaded, mongoUri set:', !!config.mongoUri);

const { startServer } = require('./lib/server');
console.log('[BOOT] server module loaded');

try {
  startServer();
  console.log('[BOOT] Express server started — open the website to pair bots');
} catch (e) {
  console.error('[BOOT] FATAL - server failed to start:', e);
  setTimeout(() => process.exit(1), 3000);
}

// Optional: auto-start a default session if you want one always ready
// Uncomment if needed:
// const { startSession } = require('./lib/sessionManager');
// startSession(config.sessionId || 'default').catch(err => console.error('[BOOT] default session error:', err.message));

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

console.log('[BOOT] Ready. Pair bots from the website.');
