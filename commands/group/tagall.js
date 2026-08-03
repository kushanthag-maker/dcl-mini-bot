module.exports = {
  name: 'tagall',
  aliases: ['everyone', 'all'],
  description: 'Tag all group members',
  category: 'group',
  groupOnly: true,
  async execute({ sock, msg, from, args, isGroup }) {
    try {
      const groupMeta = await sock.groupMetadata(from);
      const participants = groupMeta.participants || [];
      if (participants.length === 0) {
        await sock.sendMessage(from, { text: 'No participants found.' }, { quoted: msg });
        return;
      }

      const text = args.length > 0 ? args.join(' ') : '📢 Attention everyone!';
      let mentions = participants.map((p) => p.id);
      let body = `${text}\n\n`;
      for (const p of participants) {
        body += `@${p.id.split('@')[0]} `;
      }

      await sock.sendMessage(from, {
        text: body.trim(),
        mentions,
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(from, { text: '❌ Failed to tag members. Make sure bot is admin.' }, { quoted: msg });
    }
  },
};
