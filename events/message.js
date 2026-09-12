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

/** Extract interactive reply id (buttons / list / native flow) */
function extractInteractiveId(msg) {
  const m = msg.message || {};
  if (m.buttonsResponseMessage?.selectedButtonId) {
    return m.buttonsResponseMessage.selectedButtonId;
  }
  if (m.templateButtonReplyMessage?.selectedId) {
    return m.templateButtonReplyMessage.selectedId;
  }
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  }
  const nf = m.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nf?.paramsJson) {
    try {
      const p = JSON.parse(nf.paramsJson);
      return p.id || p.selectedRowId || p.button_id || p.rowId || null;
    } catch (_) {}
  }
  return null;
}

function extractBody(msg) {
  const messageType = Object.keys(msg.message || {})[0];
  let body = '';

  if (messageType === 'conversation') body = msg.message.conversation || '';
  else if (messageType === 'extendedTextMessage') body = msg.message.extendedTextMessage?.text || '';
  else if (messageType === 'imageMessage') body = msg.message.imageMessage?.caption || '';
  else if (messageType === 'videoMessage') body = msg.message.videoMessage?.caption || '';
  else if (messageType === 'buttonsResponseMessage') {
    // Prefer button ID so commands can route (not display text)
    body =
      msg.message.buttonsResponseMessage?.selectedButtonId ||
      msg.message.buttonsResponseMessage?.selectedDisplayText ||
      '';
  } else if (messageType === 'listResponseMessage') {
    body =
      msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
      msg.message.listResponseMessage?.title ||
      '';
  } else if (messageType === 'templateButtonReplyMessage') {
    body =
      msg.message.templateButtonReplyMessage?.selectedId ||
      msg.message.templateButtonReplyMessage?.selectedDisplayText ||
      '';
  } else if (messageType === 'interactiveResponseMessage') {
    body = extractInteractiveId(msg) || '';
  }

  return (body || '').trim();
}

/**
 * Map interactive ids → command invocation
 * e.g. baiscope_s_0 → command baiscope, args [baiscope_s_0]
 */
function routeInteractive(body) {
  if (!body) return null;
  if (body.startsWith('baiscope_')) {
    return { commandName: 'baiscope', args: [body] };
  }
  // future: other_cmd_...
  return null;
}

async function handleMessage(sock, msg, sessionId) {
  try {
    if (!msg.message || !sock) return;

    const from = msg.key.remoteJid;
    if (!from || from === 'status@broadcast') return;

    const isGroup = from.endsWith('@g.us');
    const isFromMe = !!msg.key.fromMe;

    let sender = isGroup ? msg.key.participant || from : from;
    if (isFromMe && sock.user?.id) {
      sender = sock.user.id;
    }

    const senderNumber = (sender?.split('@')[0] || '').split(':')[0];

    let body = extractBody(msg);
    let commandName = '';
    let args = [];

    // 1) Interactive id routing (works even without prefix)
    const routed = routeInteractive(body);
    if (routed) {
      commandName = routed.commandName;
      args = routed.args;
    } else if (body.startsWith(config.prefix || '.')) {
      // 2) Normal prefix commands
      const parts = body.slice((config.prefix || '.').length).trim().split(/\s+/);
      commandName = (parts.shift() || '').toLowerCase();
      args = parts;
    } else {
      return;
    }

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
      sessionId: sessionId || null,
    });
  } catch (err) {
    logger.error('handleMessage error', err);
  }
}

module.exports = { handleMessage };
