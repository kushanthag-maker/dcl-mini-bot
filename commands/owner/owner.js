const config = require('../../config');

module.exports = {
  name: 'owner',
  aliases: ['creator'],
  description: 'Show bot owner contact',
  category: 'owner',
  async execute({ sock, msg, from }) {
    const owner = config.ownerNumber;
    if (!owner) {
      await sock.sendMessage(from, { text: 'Owner number not configured.' }, { quoted: msg });
      return;
    }

    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${config.botName} Owner
TEL;type=CELL;type=VOICE;waid=${owner}:+${owner}
END:VCARD`;

    await sock.sendMessage(from, {
      contacts: {
        displayName: `${config.botName} Owner`,
        contacts: [{ vcard }],
      },
    }, { quoted: msg });
  },
};
