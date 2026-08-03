module.exports = {
  name: 'play',
  aliases: ['song'],
  description: 'Play / download song (requires external API setup)',
  category: 'download',
  async execute({ sock, msg, from, args }) {
    if (!args.length) {
      await sock.sendMessage(from, { text: '❌ Usage: .play <song name>' }, { quoted: msg });
      return;
    }
    // NOTE: Real implementation needs yt-dlp or a reliable music API + proper licensing.
    // This is a placeholder. Do not use unofficial downloaders that violate ToS/copyright.
    await sock.sendMessage(from, {
      text: `🎵 Search: *${args.join(' ')}*\n\n⚠️ Download features require additional setup (API keys / yt-dlp) and must respect copyright laws.\nThis command is a stub in the starter template.`,
    }, { quoted: msg });
  },
};
