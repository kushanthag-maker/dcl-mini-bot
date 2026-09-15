const { addBan } = require('../../lib/groupBanStore');

/**
 * groupBan — ban user from group (remove + record in ban list)
 * Usage: .ban @user / reply + .ban / .ban 9477xxxxxx
 */
async function groupBan(sock, target, user) {
  if (!target.endsWith('@g.us')) throw '@g.us server required';
  if (!user.endsWith('@s.whatsapp.net')) throw '@s.whatsapp.net user required';
  try {
    await sock.groupParticipantsUpdate(target, [user], 'remove');
    addBan(target, user);
  } catch (e) {
    throw e;
  }
}

module.exports = {
  name: 'ban',
  aliases: ['gb'],
  description: 'Ban a member from the group (kick + auto-kick on rejoin)',
  category: 'group',
  groupOnly: true,
  async execute({ sock, msg, from, sender, isOwner, args }) {
    try {
      // target resolve: mention > reply > plain number
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const replied = msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (!mentioned.length && !replied && !args[0]) {
        await sock.sendMessage(from, { text: '❌ Tag the user or reply to their message to ban.' }, { quoted: msg });
        return;
      }
      const raw = mentioned[0] || replied || (args[0].includes('@') ? args[0] : args[0] + '@s.whatsapp.net');
      const target = raw.split(':')[0]; // device suffix ain karala

      const meta = await sock.groupMetadata(from);
      const botId = (sock.user?.id || '').split(':')[0];
      const senderJid = (sender || '').split(':')[0];
      const botEntry = meta.participants.find((p) => p.id === botId);
      const senderEntry = meta.participants.find((p) => p.id === senderJid);
      const targetEntry = meta.participants.find((p) => p.id === target);

      if (!botEntry?.admin) {
        await sock.sendMessage(from, { text: '❌ Bot must be an admin to ban.' }, { quoted: msg });
        return;
      }
      if (!isOwner && !senderEntry?.admin) {
        await sock.sendMessage(from, { text: '❌ Only group admins can ban.' }, { quoted: msg });
        return;
      }
      if (target === botId) {
        await sock.sendMessage(from, { text: '❌ Cannot ban the bot itself.' }, { quoted: msg });
        return;
      }
      if (targetEntry?.admin) {
        await sock.sendMessage(from, { text: '❌ Cannot ban an admin. Demote first.' }, { quoted: msg });
        return;
      }

      await groupBan(sock, from, target);
      await sock.sendMessage(from, {
        text: '✅ @' + target.split('@')[0] + ' banned. Auto-kick if they rejoin. 🔨',
        mentions: [target],
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(from, { text: '❌ Ban failed: ' + (err?.message || err) }, { quoted: msg });
    }
  },
};
