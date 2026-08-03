module.exports = {
  name: 'kick',
  aliases: ['remove'],
  description: 'Remove a member from the group',
  category: 'group',
  groupOnly: true,
  async execute({ sock, msg, from, args }) {
    try {
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentioned.length && !args[0]) {
        await sock.sendMessage(from, { text: '❌ Tag the user to kick.' }, { quoted: msg });
        return;
      }
      const target = mentioned[0] || (args[0].includes('@') ? args[0] : args[0] + '@s.whatsapp.net');
      await sock.groupParticipantsUpdate(from, [target], 'remove');
      await sock.sendMessage(from, { text: '✅ User removed.' }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(from, { text: '❌ Failed. Make sure the bot is an admin.' }, { quoted: msg });
    }
  },
};
