const config = require('../config');
const logger = require('../lib/logger');
const { getCommand } = require('../lib/commandHandler');

// Simple in-memory rate limit
const rateMap = new Map();

function checkRateLimit(jid) {
  const now = Date.now();
  const entry = rateMap.get(jid) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 60000;
  }
  entry.count++;
  rateMap.set(jid, entry);
  return entry.count <= config.rateLimit;
}

async function handleMessage(sock, msg) {
  try {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = isGroup ? msg.key.participant : from;
    const senderNumber = sender?.split('@')[0] || '';

    // Extract text
    const messageType = Object.keys(msg.message || {})[0];
    let body = '';
    if (messageType === 'conversation') body = msg.message.conversation;
    else if (messageType === 'extendedTextMessage') body = msg.message.extendedTextMessage?.text || '';
    else if (messageType === 'imageMessage') body = msg.message.imageMessage?.caption || '';
    else if (messageType === 'videoMessage') body = msg.message.videoMessage?.caption || '';

    body = (body || '').trim();
    if (!body.startsWith(config.prefix)) return;

    const args = body.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = (args.shift() || '').toLowerCase();
    if (!commandName) return;

    const cmd = getCommand(commandName);
    if (!cmd) return;

    // Rate limit
    if (!checkRateLimit(sender)) {
      await sock.sendMessage(from, { text: '⏳ Rate limit exceeded. Please wait a moment.' }, { quoted: msg });
      return;
    }

    // Owner only check
    if (cmd.ownerOnly) {
      const owners = [config.ownerNumber];
      if (!owners.includes(senderNumber)) {
        await sock.sendMessage(from, { text: '❌ This command is only for the bot owner.' }, { quoted: msg });
        return;
      }
    }

    // Group only
    if (cmd.groupOnly && !isGroup) {
      await sock.sendMessage(from, { text: '❌ This command can only be used in groups.' }, { quoted: msg });
      return;
    }

    logger.command(commandName, senderNumber);

    // Execute
    await cmd.execute({
      sock,
      msg,
      from,
      sender,
      senderNumber,
      isGroup,
      args,
      body,
      config,
    });
  } catch (err) {
    logger.error('handleMessage error', err);
  }
}

module.exports = { handleMessage };
