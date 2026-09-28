const config = require('../config');
const logger = require('../lib/logger');
const { getCommand } = require('../lib/commandHandler');
const { isPanelReply } = require('../lib/settingsPanelStore');

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
  // native flow / interactive response (list + quick reply)
  const ir = m.interactiveResponseMessage;
  if (ir) {
    const nf = ir.nativeFlowResponseMessage || ir;
    const raw = nf.paramsJson || nf.params_json || ir.paramsJson;
    if (raw) {
      try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
        // common shapes
        if (p.id) return String(p.id);
        if (p.selectedRowId) return String(p.selectedRowId);
        if (p.rowId) return String(p.rowId);
        if (p.button_id) return String(p.button_id);
        if (p.selectedId) return String(p.selectedId);
        // nested
        if (p.params && p.params.id) return String(p.params.id);
        if (p.response && p.response.id) return String(p.response.id);
        // sometimes id is the only string value
        for (const k of Object.keys(p)) {
          const v = p[k];
          if (typeof v === 'string' && (v.startsWith('dqcat_') || v.startsWith('dqmenu_') || v.startsWith('dqcmd_') || v.startsWith('dqset_'))) {
            return v;
          }
        }
      } catch (_) {}
    }
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
 */
function routeInteractive(body) {
  if (!body) return null;
  const id = String(body).trim();

  if (id.startsWith('baiscope_')) {
    return { commandName: 'baiscope', args: [id] };
  }
  if (id.startsWith('dqset_')) {
    return { commandName: 'settings', args: [id] };
  }
  // category list selection
  if (id.startsWith('dqcat_')) {
    return { commandName: 'menu', args: ['cat', id] };
  }
  // run a command from category list (dqcmd_song → .song)
  if (id.startsWith('dqcmd_')) {
    const name = id.slice(6).trim().toLowerCase();
    if (name) return { commandName: name, args: [] };
  }
  // quick reply shortcuts
  if (id.startsWith('dqmenu_')) {
    const name = id.slice(7).trim().toLowerCase();
    if (name === 'menu' || name === 'help') {
      return { commandName: 'menu', args: [] };
    }
    if (name) return { commandName: name, args: [] };
  }
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
    } else if (/^[1-9]$/.test(body) && isPanelReply(msg)) {
      // 1b) Settings panel number reply (reply "1" / "2" to the panel)
      commandName = 'settings';
      args = ['num', body];
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
