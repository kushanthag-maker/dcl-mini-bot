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

// Auto-restore paired sessions after Heroku restart
const { restoreAllSessions } = require('./lib/sessionManager');
restoreAllSessions()
  .then(function (ids) {
    console.log('[BOOT] Restored sessions:', ids.length ? ids.join(', ') : '(none)');
  })
  .catch(function (err) {
    console.error('[BOOT] Session restore error:', err.message);
  });

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
