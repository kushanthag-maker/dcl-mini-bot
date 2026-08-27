const config = require('../../config');

// Owner number (Sri Lanka) — with country code, no +
const OWNER_NUMBER = '94769904294';
const OWNER_DISPLAY = '+94 76 990 4294';
const OWNER_NAME = 'Sandaru Udan';

module.exports = {
  name: 'owner',
  aliases: ['creator', 'dev', 'developer'],
  description: 'Show bot owner contact',
  category: 'owner',

  async execute({ sock, msg, from }) {
    try {
      const botName = config.botName || 'ZAYRAX MINI';
      const prefix = config.prefix || '.';

      // vCard contact card
      const vcard =
        `BEGIN:VCARD\n` +
        `VERSION:3.0\n` +
        `FN:${OWNER_NAME}\n` +
        `ORG:${botName};\n` +
        `TEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}\n` +
        `END:VCARD`;

      const text = `
╭───「 👑 *𝗢𝗪𝗡𝗘𝗥* 」───╮
│
│  🤖 *Bot*      ›  ${botName}
│  👤 *Name*     ›  ${OWNER_NAME}
│  📱 *Number*   ›  ${OWNER_DISPLAY}
│  💬 *WhatsApp* ›  wa.me/${OWNER_NUMBER}
│
│  💡 Contact card එක පහළින් 👇
│
╰──────────────────────╯

💜 *${botName}* — Fast · Stable · Secure
`.trim();

      await sock.sendMessage(from, { text }, { quoted: msg });

      await sock.sendMessage(
        from,
        {
          contacts: {
            displayName: OWNER_NAME,
            contacts: [{ vcard }],
          },
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('Owner Error:', err.message);
      await sock.sendMessage(
        from,
        {
          text: `👑 *Owner*\n📱 ${OWNER_DISPLAY}\n🔗 https://wa.me/${OWNER_NUMBER}`,
        },
        { quoted: msg }
      );
    }
  },
};
