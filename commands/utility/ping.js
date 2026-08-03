module.exports = {
  name: 'ping',
  aliases: ['p'],
  description: 'Check bot response speed',
  category: 'utility',
  async execute({ sock, msg, from }) {
    const start = Date.now();
    const sent = await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted: msg });
    const latency = Date.now() - start;
    await sock.sendMessage(from, {
      text: `🏓 *Pong!*\n⏱️ Latency: ${latency}ms`,
      edit: sent.key,
    }).catch(() => {
      // edit may not work on all versions, fallback already sent
    });
  },
};
