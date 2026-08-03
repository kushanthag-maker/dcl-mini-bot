module.exports = {
  name: 'demote',
  description: 'Demote an admin (bot must be admin)',
  category: 'group',
  groupOnly: true,
  async execute({ sock, msg, from, args }) {
    try {
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentioned.length && !args[0]) {
        await sock.sendMessage(from, { text: '❌ Tag the admin to demote.' }, { quoted: msg });
        return;
      }
      const target = mentioned[0] || (args[0].includes('@') ? args[0] : args[0] + '@s.whatsapp.net');
      await sock.groupParticipantsUpdate(from, [target], 'demote');
      await sock.sendMessage(from, { text: '✅ User demoted.' }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(from, { text: '❌ Failed. Make sure the bot is an admin.' }, { quoted: msg });
    }
  },
};
