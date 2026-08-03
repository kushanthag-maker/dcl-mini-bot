/**
 * DCL MINI - Professional WhatsApp Multi-Device Bot
 * Entry Point (Heroku / Railway / Render friendly)
 */

require('dotenv').config();
const chalk = require('chalk');
const config = require('./config');
const { startBot } = require('./lib/bot');
const { startServer } = require('./lib/server');
const logger = require('./lib/logger');

console.log(chalk.cyan(`
╔══════════════════════════════════════╗
║          DCL MINI BOT v1.0           ║
║   Multi-Device + MongoDB Session     ║
╚══════════════════════════════════════╝
`));

// Critical: Start the web server FIRST so Heroku sees a bound PORT
// and does not kill the dyno with "Application Error"
startServer();

// Start bot in background — never crash the whole process
async function startBotSafely() {
  try {
    logger.info('Starting WhatsApp connection...');
    await startBot();
  } catch (err) {
    logger.error('Bot failed to start (will keep retrying)', err);
    global.botStatus = 'error';
    global.botError = err.message || String(err);
    // Retry after 15 seconds without killing the process
    setTimeout(startBotSafely, 15000);
  }
}

startBotSafely();

// Anti-crash — log but DO NOT exit (important for Heroku)
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception (process kept alive)', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection (process kept alive)', reason);
});

process.on('SIGINT', async () => {
  logger.warn('SIGINT received. Shutting down...');
  if (global.shutdownBot) await global.shutdownBot();
  else process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.warn('SIGTERM received (Heroku dyno cycling)...');
  if (global.shutdownBot) await global.shutdownBot();
  else process.exit(0);
});
