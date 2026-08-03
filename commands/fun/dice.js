module.exports = {
  name: 'dice',
  aliases: ['roll'],
  description: 'Roll a dice (1-6)',
  category: 'fun',
  async execute({ sock, msg, from }) {
    const result = Math.floor(Math.random() * 6) + 1;
    await sock.sendMessage(from, { text: `🎲 You rolled: *${result}*` }, { quoted: msg });
  },
};
