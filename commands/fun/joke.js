const jokes = [
  "Why don't scientists trust atoms? Because they make up everything!",
  "Why did the scarecrow win an award? Because he was outstanding in his field!",
  "What do you call a fake noodle? An impasta!",
  "Why couldn't the bicycle stand up by itself? It was two tired!",
  "What do you call cheese that isn't yours? Nacho cheese!",
  "Why did the math book look so sad? Because it had too many problems!",
  "What do you call a bear with no teeth? A gummy bear!",
  "Why don't eggs tell jokes? They'd crack each other up!",
];

module.exports = {
  name: 'joke',
  aliases: ['jokes'],
  description: 'Get a random joke',
  category: 'fun',
  async execute({ sock, msg, from }) {
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    await sock.sendMessage(from, { text: `😂 *Joke*\n\n${joke}` }, { quoted: msg });
  },
};
