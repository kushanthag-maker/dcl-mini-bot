const config = require('../config');
const logger = require('../lib/logger');
const { getCommand } = require('../lib/commandHandler');

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
  return entry.count <= (config.rateLimit || 20);
}

async function handleMessage(sock, msg) {
  try {
    if (!msg.message || !sock) return;

    const from = msg.key.remoteJid;
    if (!from || from === 'status@broadcast') return;

    const isGroup = from.endsWith('@g.us');
    const isFromMe = !!msg.key.fromMe;

    let sender = isGroup ? (msg.key.participant || from) : from;
    if (isFromMe && sock.user?.id) {
      sender = sock.user.id;
    }

    const senderNumber = (sender?.split('@')[0] || '').split(':')[0];

    const messageType = Object.keys(msg.message || {})[0];
    let body = '';
    if (messageType === 'conversation') body = msg.message.conversation || '';
    else if (messageType === 'extendedTextMessage') body = msg.message.extendedTextMessage?.text || '';
    else if (messageType === 'imageMessage') body = msg.message.imageMessage?.caption || '';
    else if (messageType === 'videoMessage') body = msg.message.videoMessage?.caption || '';
    else if (messageType === 'buttonsResponseMessage') body = msg.message.buttonsResponseMessage?.selectedDisplayText || '';
    else if (messageType === 'listResponseMessage') body = msg.message.listResponseMessage?.title || '';
    else if (messageType === 'templateButtonReplyMessage') body = msg.message.templateButtonReplyMessage?.selectedDisplayText || '';

    body = (body || '').trim();
    if (!body.startsWith(config.prefix)) return;

    const args = body.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = (args.shift() || '').toLowerCase();
    if (!commandName) return;

    const cmd = getCommand(commandName);
    if (!cmd) return;

    const ownerNum = (config.ownerNumber || '').replace(/[^0-9]/g, '');
    const isOwner = isFromMe || (ownerNum && senderNumber === ownerNum);

    if (!isOwner && !checkRateLimit(sender)) {
      try {
        await sock.sendMessage(from, { text: 'Rate limit exceeded. Please wait.' }, { quoted: msg });
      } catch {}
      return;
    }

    if (cmd.ownerOnly && !isOwner) {
      try {
        await sock.sendMessage(from, { text: 'This command is only for the bot owner.' }, { quoted: msg });
      } catch {}
      return;
    }

    if (cmd.groupOnly && !isGroup) {
      try {
        await sock.sendMessage(from, { text: 'This command can only be used in groups.' }, { quoted: msg });
      } catch {}
      return;
    }

    logger.command(commandName, senderNumber + (isFromMe ? ' (self)' : ''));

    await cmd.execute({
      sock,
      msg,
      from,
      sender,
      senderNumber,
      isGroup,
      isFromMe,
      isOwner,
      args,
      body,
      config,
    });
  } catch (err) {
    logger.error('handleMessage error', err);
  }
}

module.exports = { handleMessage };
