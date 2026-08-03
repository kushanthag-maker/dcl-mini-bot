module.exports = {
  name: 'calc',
  aliases: ['calculate', 'math'],
  description: 'Simple calculator',
  category: 'utility',
  async execute({ sock, msg, from, args }) {
    if (!args.length) {
      await sock.sendMessage(from, { text: '❌ Usage: .calc 2+2*5' }, { quoted: msg });
      return;
    }
    const expr = args.join('').replace(/[^0-9+\-*/().%\s]/g, '');
    try {
      // Basic safe eval for simple math only
      const result = Function(`"use strict"; return (${expr})`)();
      await sock.sendMessage(from, { text: `🧮 Result: *${result}*` }, { quoted: msg });
    } catch {
      await sock.sendMessage(from, { text: '❌ Invalid expression' }, { quoted: msg });
    }
  },
};
