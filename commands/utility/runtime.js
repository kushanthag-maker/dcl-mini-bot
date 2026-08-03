module.exports = {
  name: 'runtime',
  aliases: ['uptime'],
  description: 'Show bot uptime',
  category: 'utility',
  async execute({ sock, msg, from }) {
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    const text = `⏱ *Runtime*\n\n${d}d ${h}h ${m}m ${s}s`;
    await sock.sendMessage(from, { text }, { quoted: msg });
  },
};
