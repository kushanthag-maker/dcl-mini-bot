/**
 * DCL MINI - Professional WhatsApp Multi-Device Bot
 * Entry Point
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

async function main() {
  // Start pairing / dashboard website
  startServer();

  // Start WhatsApp bot
  logger.info('Starting WhatsApp connection...');
  await startBot();
}

// Anti-crash
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', reason);
});

process.on('SIGINT', async () => {
  logger.warn('SIGINT received. Shutting down...');
  if (global.shutdownBot) await global.shutdownBot();
  else process.exit(0);
});

main().catch((err) => {
  logger.error('Fatal error on startup', err);
  process.exit(1);
});
