const { removeBan } = require('../../lib/groupBanStore');

module.exports = {
  name: 'unban',
  aliases: ['ungb'],
  description: 'Remove a user from the group ban list',
  category: 'group',
  groupOnly: true,
  async execute({ sock, msg, from, sender, isOwner, args }) {
    try {
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const replied = msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (!mentioned.length && !replied && !args[0]) {
        await sock.sendMessage(from, { text: '❌ Tag the user or give their number to unban.' }, { quoted: msg });
        return;
      }
      const raw = mentioned[0] || replied || (args[0].includes('@') ? args[0] : args[0] + '@s.whatsapp.net');
      const target = raw.split(':')[0];

      const meta = await sock.groupMetadata(from);
      const senderJid = (sender || '').split(':')[0];
      const senderEntry = meta.participants.find((p) => p.id === senderJid);
      if (!isOwner && !senderEntry?.admin) {
        await sock.sendMessage(from, { text: '❌ Only group admins can unban.' }, { quoted: msg });
        return;
      }

      const removed = removeBan(from, target);
      await sock.sendMessage(from, {
        text: removed
          ? '✅ @' + target.split('@')[0] + ' unbanned. They can join again.'
          : '⚠️ @' + target.split('@')[0] + ' is not in the ban list.',
        mentions: [target],
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(from, { text: '❌ Unban failed: ' + (err?.message || err) }, { quoted: msg });
    }
  },
};
