/**
 * Status Seen + Anti Delete hooks for Baileys sock
 * + Channel auto-react (.setreact)
 */
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { getSettings } = require('./botSettings');
const store = require('./antiDeleteStore');
const logger = require('./logger');
const { attachChannelReactHook } = require('./channelReactHook');

function extractText(msg) {
  if (!msg) return '';
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;
  return '';
}

function detectType(msg) {
  if (!msg) return 'empty';
  if (msg.conversation || msg.extendedTextMessage) return 'text';
  if (msg.imageMessage) return 'image';
  if (msg.videoMessage) return 'video';
  if (msg.audioMessage) return 'audio';
  if (msg.stickerMessage) return 'sticker';
  if (msg.documentMessage) return 'document';
  if (msg.contactMessage) return 'contact';
  if (msg.locationMessage) return 'location';
  return 'other';
}

async function saveIncomingMessage(sock, m) {
  try {
    if (!m?.message || !m.key) return;
    if (m.key.fromMe) return;
    const jid = m.key.remoteJid;
    if (!jid || jid === 'status@broadcast') return;

    const id = m.key.id;
    const type = detectType(m.message);
    const text = extractText(m.message);
    const pushName = m.pushName || '';

    const entry = {
      type,
      text,
      pushName,
      participant: m.key.participant || null,
      mimetype: null,
      fileName: null,
      mediaBuffer: null,
    };

    const mediaTypes = ['image', 'video', 'audio', 'sticker', 'document'];
    if (mediaTypes.includes(type)) {
      try {
        const buffer = await downloadMediaMessage(
          m,
          'buffer',
          {},
          {
            logger: require('pino')({ level: 'silent' }),
            reuploadRequest: sock.updateMediaMessage.bind(sock),
          }
        );
        entry.mediaBuffer = buffer;
        if (m.message.imageMessage) {
          entry.mimetype = m.message.imageMessage.mimetype || 'image/jpeg';
        } else if (m.message.videoMessage) {
          entry.mimetype = m.message.videoMessage.mimetype || 'video/mp4';
        } else if (m.message.audioMessage) {
          entry.mimetype = m.message.audioMessage.mimetype || 'audio/ogg; codecs=opus';
          entry.ptt = !!m.message.audioMessage.ptt;
        } else if (m.message.stickerMessage) {
          entry.mimetype = m.message.stickerMessage.mimetype || 'image/webp';
        } else if (m.message.documentMessage) {
          entry.mimetype = m.message.documentMessage.mimetype || 'application/octet-stream';
          entry.fileName = m.message.documentMessage.fileName || 'file';
        }
      } catch (e) {
        logger.warn('antiDelete media download failed: ' + e.message);
      }
    }

    store.put(jid, id, entry);
  } catch (e) {
    logger.warn('saveIncomingMessage error: ' + e.message);
  }
}

async function resendDeleted(sock, jid, key, entry) {
  const who = (key.participant || entry.participant || jid || '').split('@')[0];
  const name = entry.pushName || who;
  const header =
    '🛡️ *Anti Delete*\n' +
    '👤 ' + name + ' (' + who + ')\n' +
    '━━━━━━━━━━━━━━\n';

  try {
    if (entry.type === 'text' && entry.text) {
      await sock.sendMessage(jid, { text: header + entry.text });
      return;
    }

    if (entry.type === 'image' && entry.mediaBuffer) {
      await sock.sendMessage(jid, {
        image: entry.mediaBuffer,
        caption: header + (entry.text || ''),
        mimetype: entry.mimetype || 'image/jpeg',
      });
      return;
    }

    if (entry.type === 'video' && entry.mediaBuffer) {
      await sock.sendMessage(jid, {
        video: entry.mediaBuffer,
        caption: header + (entry.text || ''),
        mimetype: entry.mimetype || 'video/mp4',
      });
      return;
    }

    if (entry.type === 'audio' && entry.mediaBuffer) {
      await sock.sendMessage(jid, { text: header + '🎤 *Voice / Audio deleted*' });
      await sock.sendMessage(jid, {
        audio: entry.mediaBuffer,
        mimetype: entry.mimetype || 'audio/ogg; codecs=opus',
        ptt: !!entry.ptt,
      });
      return;
    }

    if (entry.type === 'sticker' && entry.mediaBuffer) {
      await sock.sendMessage(jid, { text: header + '💟 *Sticker deleted*' });
      await sock.sendMessage(jid, {
        sticker: entry.mediaBuffer,
      });
      return;
    }

    if (entry.type === 'document' && entry.mediaBuffer) {
      await sock.sendMessage(jid, {
        document: entry.mediaBuffer,
        mimetype: entry.mimetype || 'application/octet-stream',
        fileName: entry.fileName || 'file',
        caption: header + (entry.text || ''),
      });
      return;
    }

    await sock.sendMessage(jid, {
      text: header + '_(Message deleted — content not in cache / unsupported type: ' + entry.type + ')_',
    });
  } catch (e) {
    logger.error('resendDeleted failed: ' + e.message);
  }
}

/**
 * Attach feature hooks to a Baileys socket
 */
function attachFeatureHooks(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      const settings = getSettings(sessionId);
      if (!messages || !messages.length) return;

      for (const m of messages) {
        if (!m) continue;

        if (
          settings.statusSeen &&
          m.key &&
          m.key.remoteJid === 'status@broadcast' &&
          !m.key.fromMe
        ) {
          try {
            await sock.readMessages([m.key]);
            if (typeof sock.sendReceipt === 'function') {
              try {
                await sock.sendReceipt(m.key.remoteJid, m.key.participant, [m.key.id], 'read');
              } catch (_) {}
            }
          } catch (e) {
            logger.warn('[' + sessionId + '] status seen fail: ' + e.message);
          }
          continue;
        }

        if (settings.antiDelete) {
          await saveIncomingMessage(sock, m);
        }
      }
    } catch (e) {
      logger.warn('[' + sessionId + '] feature upsert error: ' + e.message);
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    try {
      const settings = getSettings(sessionId);
      if (!settings.antiDelete) return;
      if (!Array.isArray(updates)) return;

      for (const u of updates) {
        if (!u || !u.key) continue;
        if (u.key.fromMe) continue;

        const jid = u.key.remoteJid;
        if (!jid || jid === 'status@broadcast') continue;

        let isRevoke = false;
        const proto = u.update?.message?.protocolMessage;
        if (proto && (proto.type === 0 || proto.type === 'REVOKE')) {
          isRevoke = true;
        }
        if (u.update && u.update.message === null) isRevoke = true;
        if (u.update?.messageStubType === 1 || u.update?.messageStubType === 2) {
          isRevoke = true;
        }

        if (!isRevoke) continue;

        let msgId = (proto && proto.key && proto.key.id) ? proto.key.id : u.key.id;
        let chatJid = jid;
        if (proto && proto.key && proto.key.remoteJid) {
          chatJid = proto.key.remoteJid;
        }

        const entry = store.get(chatJid, msgId) || store.get(jid, msgId);
        if (!entry) {
          try {
            await sock.sendMessage(jid, {
              text: '🛡️ *Anti Delete*\n\nA message was deleted, but it was not in cache.\n_(Bot must be online when the message was originally sent.)_',
            });
          } catch (_) {}
          continue;
        }

        await resendDeleted(sock, jid, u.key, entry);
        store.remove(chatJid, msgId);
        store.remove(jid, msgId);
      }
    } catch (e) {
      logger.error('[' + sessionId + '] antiDelete update error: ' + e.message);
    }
  });

  // ===== Channel auto-react (.setreact) =====
  try {
    attachChannelReactHook(sock, sessionId);
  } catch (e) {
    logger.warn(
      '[' + sessionId + '] channelReact hook fail: ' + (e && e.message ? e.message : e)
    );
  }
}

module.exports = { attachFeatureHooks };
