const axios = require('axios');
const config = require('../../config');
const { getCoins, useCoin, addCoins } = require('../../lib/coins');

const ADMIN_NUMBER = '94769904294';
const WOLF_API_KEY = 'wxa_f_4e840b5e42';

module.exports = {
  name: 'ai',
  aliases: ['darkai', 'wormgpt', 'chat', 'gpt'],
  description: 'Chat with DCL MINI AI',
  category: 'ai',
  async execute({ sock, msg, from, args, senderNumber, isOwner, isFromMe }) {
    try {
      const query = args.join(' ').trim();
      if (!query) {
        return sock.sendMessage(from, {
          text: `╭───「 👾 *${config.botName} AI* 」───╮
│
│  ❌ *Usage:* .ai <your question>
│
│  💡 Example:
│  .ai write a python script
│
╰──────────────────────╯`,
        }, { quoted: msg });
      }

      const userNum = String(senderNumber || '').replace(/[^0-9]/g, '');
      const isAdmin = userNum === ADMIN_NUMBER || isOwner || isFromMe;

      // Coin check (admin = unlimited)
      if (!isAdmin) {
        const coins = await getCoins(userNum);
        if (coins <= 0) {
          return sock.sendMessage(from, {
            text: `╭───「 👾 *${config.botName} AI* 」───╮
│
│  ❌ *Requests ඉවරයි!*
│
│  🪙 *Balance* ›  0
│
│  💡 Admin ගෙන් requests ලබාගන්න
│
╰──────────────────────╯`,
          }, { quoted: msg });
        }
      }

      await sock.sendMessage(from, {
        react: { text: '👾', key: msg.key },
      }).catch(() => {});

      const loading = await sock.sendMessage(from, {
        text: `👾 *${config.botName} AI Processing...* ⏳`,
      }, { quoted: msg });

      const lowerQuery = query.toLowerCase();

      // Custom replies
      if (['who are you', 'who are u', 'who r u'].includes(lowerQuery)) {
        const finalMessage =
          `*↳ ❝ [👾 ${config.botName} AI 👾] ¡! ❞*\n\n` +
          `I'm the amazing *${config.botName} AI* 🌸\nWhat do you wanna do today 🌚\n\n` +
          `> *Built by Zayra 𝜗𝜚⋆*`;
        await sock.sendMessage(from, { text: finalMessage, edit: loading.key }).catch(() =>
          sock.sendMessage(from, { text: finalMessage }, { quoted: msg })
        );
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        return;
      }

      if (['who build u', 'who build you', 'who built you', 'who made you'].includes(lowerQuery)) {
        const finalMessage =
          `*↳ ❝ [👾 ${config.botName} AI 👾] ¡! ❞*\n\n` +
          `I am built by *Zayra*, my creator 🫶\n\n` +
          `> *Built by Zayra 𝜗𝜚⋆*`;
        await sock.sendMessage(from, { text: finalMessage, edit: loading.key }).catch(() =>
          sock.sendMessage(from, { text: finalMessage }, { quoted: msg })
        );
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        return;
      }

      // Deduct coin
      let remaining = null;
      if (!isAdmin) {
        const result = await useCoin(userNum);
        if (!result.ok) {
          return sock.sendMessage(from, {
            text: '❌ Requests ඉවරයි. Admin ගෙන් ලබාගන්න.',
            edit: loading.key,
          }).catch(() => {});
        }
        remaining = result.coins;
      }

      // ===== Get AI reply (with fallback) =====
      let aiReply = null;

      // 1) Try WormGPT (xwolf)
      try {
        const wolfUrl = `https://apis.xwolf.space/api/ai/wormgpt?q=\( {encodeURIComponent(query)}&key= \){WOLF_API_KEY}`;
        const wolfRes = await axios.get(wolfUrl, {
          timeout: 25000,
          validateStatus: () => true,
        });
        if (wolfRes.status === 200) {
          aiReply =
            wolfRes.data?.result ||
            wolfRes.data?.response ||
            wolfRes.data?.reply ||
            null;
        }
      } catch (e) {
        console.log('WormGPT timeout/fail, using fallback...');
      }

      // 2) Fallback - Pollinations AI (works)
      if (!aiReply) {
        try {
          const pollRes = await axios.post(
            'https://text.pollinations.ai/',
            {
              messages: [
                {
                  role: 'system',
                  content: `You are ${config.botName} AI, built by Zayra. Reply helpfully and clearly.`,
                },
                { role: 'user', content: query },
              ],
              model: 'openai',
            },
            {
              timeout: 40000,
              headers: { 'Content-Type': 'application/json' },
              responseType: 'text',
            }
          );
          aiReply = typeof pollRes.data === 'string' ? pollRes.data : String(pollRes.data || '');
        } catch (e2) {
          console.error('Fallback AI also failed:', e2.message);
        }
      }

      // 3) Last fallback - simple GET
      if (!aiReply) {
        try {
          const simple = await axios.get(
            `https://text.pollinations.ai/${encodeURIComponent(query)}`,
            { timeout: 30000, responseType: 'text' }
          );
          aiReply = typeof simple.data === 'string' ? simple.data : String(simple.data || '');
        } catch (e3) {
          console.error('Simple AI failed:', e3.message);
        }
      }

      if (!aiReply || !String(aiReply).trim()) {
        // refund coin
        if (!isAdmin) await addCoins(userNum, 1).catch(() => {});
        return sock.sendMessage(from, {
          text: '❌ AI සේවාව දැන් ලබාගත නොහැක. මඳ වේලාවකින් නැවත try කරන්න.',
          edit: loading.key,
        }).catch(() => {});
      }

      const balanceLine = isAdmin
        ? `> *Unlimited Access*`
        : `> 🪙 *Requests left:* ${remaining}`;

      const finalMessage =
        `*↳ ❝ [👾 ${config.botName} AI 👾] ¡! ❞*\n\n` +
        `${String(aiReply).trim()}\n\n` +
        `${balanceLine}\n` +
        `> *Built by Zayra 𝜗𝜚⋆*`;

      await sock.sendMessage(from, {
        text: finalMessage,
        edit: loading.key,
      }).catch(() =>
        sock.sendMessage(from, { text: finalMessage }, { quoted: msg })
      );

      await sock.sendMessage(from, {
        react: { text: '✅', key: msg.key },
      }).catch(() => {});
    } catch (e) {
      console.error('AI Error:', e.message);
      await sock.sendMessage(from, {
        text: `❌ *AI Error:* ${e.message}`,
      }, { quoted: msg }).catch(() => {});
      await sock.sendMessage(from, {
        react: { text: '❌', key: msg.key },
      }).catch(() => {});
    }
  },
};
