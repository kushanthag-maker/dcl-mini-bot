module.exports = {
  name: 'flip',
  aliases: ['coin'],
  description: 'Flip a coin',
  category: 'fun',
  async execute({ sock, msg, from }) {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    await sock.sendMessage(from, { text: `🪙 Coin flip: *${result}*` }, { quoted: msg });
  },
};
