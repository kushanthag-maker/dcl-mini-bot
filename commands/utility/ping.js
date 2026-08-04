module.exports = {
  name: 'ping',
  aliases: ['p'],
  description: 'Check bot response speed',
  category: 'utility',
  async execute({ sock, msg, from }) {
    const start = Date.now();
    
    // First message (loading)
    const sent = await sock.sendMessage(from, { 
      text: '🏓 *Pinging...*' 
    }, { quoted: msg });

    const latency = Date.now() - start;

    // Beautiful final message
    const text = `
╭───「 🏓 *P O N G* 」───╮
│
│  ⚡ *Latency*  ›  \`${latency}ms\`
│  📶 *Status*   ›  Online ✅
│  🤖 *Bot*      ›  Active
│
╰──────────────────────╯
`.trim();

    await sock.sendMessage(from, {
      text: text,
      edit: sent.key,
    }).catch(() => {
      // edit support නැතිනම් fallback
      sock.sendMessage(from, { text }, { quoted: msg });
    });
  },
};
