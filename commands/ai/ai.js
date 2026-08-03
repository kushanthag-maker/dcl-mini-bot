module.exports = {
  name: 'ai',
  aliases: ['chat', 'gpt'],
  description: 'Chat with AI (requires OPENAI_API_KEY or similar)',
  category: 'ai',
  async execute({ sock, msg, from, args }) {
    if (!args.length) {
      await sock.sendMessage(from, { text: '❌ Usage: .ai <your question>' }, { quoted: msg });
      return;
    }
    // Placeholder - add your preferred AI provider (OpenAI, Groq, local LLM, etc.)
    await sock.sendMessage(from, {
      text: `🤖 *AI Response*\n\nYou asked: ${args.join(' ')}\n\n⚠️ AI commands require an API key in .env (e.g. OPENAI_API_KEY). This is a starter stub.`,
    }, { quoted: msg });
  },
};
