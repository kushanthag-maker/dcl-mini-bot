/**
 * Native-flow buttons via relayMessage
 * Works on forks that have InteractiveMessage in proto (waileys does)
 */
function getBaileys() {
  return require('@whiskeysockets/baileys');
}

/**
 * Send single_select list (tap menu)
 * rows: [{ id, title, description? }]
 */
async function sendSelectList(sock, jid, {
  text,
  footer = 'DARK QUEEN OFC',
  title = 'Select',
  buttonText = 'Open menu',
  rows = [],
  quoted,
  imageUrl,
} = {}) {
  const {
    proto,
    generateWAMessageFromContent,
    prepareWAMessageMedia,
  } = getBaileys();

  const sections = [
    {
      title: title,
      rows: rows.map((r) => ({
        header: r.header || '',
        title: String(r.title || '').slice(0, 24),
        description: String(r.description || '').slice(0, 72),
        id: String(r.id),
      })),
    },
  ];

  const nativeFlowButtons = [
    {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: buttonText,
        sections,
      }),
    },
  ];

  let header = undefined;
  if (imageUrl) {
    try {
      const media = await prepareWAMessageMedia(
        { image: { url: imageUrl } },
        { upload: sock.waUploadToServer }
      );
      header = {
        title: title,
        hasMediaAttachment: true,
        imageMessage: media.imageMessage,
      };
    } catch (e) {
      console.log('[sendButtons] image header fail:', e.message);
      header = { title, hasMediaAttachment: false };
    }
  } else {
    header = { title, hasMediaAttachment: false };
  }

  const interactiveMsg = {
    body: { text: text || ' ' },
    footer: { text: footer },
    header,
    nativeFlowMessage: {
      buttons: nativeFlowButtons,
      messageParamsJson: JSON.stringify({ from: 'dark-queen', v: 1 }),
    },
  };

  const full = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: interactiveMsg,
        },
      },
    },
    { userJid: sock.user?.id, quoted }
  );

  await sock.relayMessage(jid, full.message, { messageId: full.key.id });
  return full;
}

/**
 * Quick reply buttons (max ~3)
 * buttons: [{ id, text }]
 */
async function sendQuickReplies(sock, jid, {
  text,
  footer = 'DARK QUEEN OFC',
  buttons = [],
  quoted,
  imageUrl,
} = {}) {
  const {
    generateWAMessageFromContent,
    prepareWAMessageMedia,
  } = getBaileys();

  const nativeFlowButtons = buttons.slice(0, 3).map((b) => ({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: String(b.text).slice(0, 25),
      id: String(b.id),
    }),
  }));

  let header = { title: 'Dark Queen', hasMediaAttachment: false };
  if (imageUrl) {
    try {
      const media = await prepareWAMessageMedia(
        { image: { url: imageUrl } },
        { upload: sock.waUploadToServer }
      );
      header = {
        title: 'Dark Queen',
        hasMediaAttachment: true,
        imageMessage: media.imageMessage,
      };
    } catch (_) {}
  }

  const full = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: {
            body: { text: text || ' ' },
            footer: { text: footer },
            header,
            nativeFlowMessage: {
              buttons: nativeFlowButtons,
              messageParamsJson: '{}',
            },
          },
        },
      },
    },
    { userJid: sock.user?.id, quoted }
  );

  await sock.relayMessage(jid, full.message, { messageId: full.key.id });
  return full;
}

/**
 * URL open buttons
 */
async function sendUrlButtons(sock, jid, {
  text,
  footer = 'DARK QUEEN OFC',
  buttons = [], // { text, url }
  quoted,
} = {}) {
  const { generateWAMessageFromContent } = getBaileys();

  const nativeFlowButtons = buttons.slice(0, 3).map((b) => ({
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({
      display_text: String(b.text).slice(0, 25),
      url: b.url,
      merchant_url: b.url,
    }),
  }));

  const full = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: {
            body: { text: text || ' ' },
            footer: { text: footer },
            nativeFlowMessage: {
              buttons: nativeFlowButtons,
              messageParamsJson: '{}',
            },
          },
        },
      },
    },
    { userJid: sock.user?.id, quoted }
  );

  await sock.relayMessage(jid, full.message, { messageId: full.key.id });
  return full;
}

module.exports = {
  sendSelectList,
  sendQuickReplies,
  sendUrlButtons,
};
