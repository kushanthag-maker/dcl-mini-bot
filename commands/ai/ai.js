const axios = require('axios');
const config = require('../../config');
const { getCoins, useCoin } = require('../../lib/coins');

const ADMIN_NUMBER = '94769904294';
const WOLF_API_KEY = 'wxa_f_4e840b5e42';

module.exports = {
  name: 'ai',
  aliases: ['darkai', 'wormgpt', 'chat', 'gpt'],
  description: 'Chat with DCL MINI AI (WormGPT)',
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

      // Coin check (admin unlimited)
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
│  💡 Admin ගෙන් requests
│     ඉල්ලන්න / ලබාගන්න
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
        const finalMessage = `*↳ ❝ [👾 ${config.botName} AI 👾] ¡! ❞*\n\n` +
          `I'm the amazing *${config.botName} AI* 🌸\nWhat do you wanna do today 🌚\n\n` +
          `> *Built by Zayra 𝜗𝜚⋆*`;

        await sock.sendMessage(from, { text: finalMessage, edit: loading.key }).catch(() =>
          sock.sendMessage(from, { text: finalMessage }, { quoted: msg })
        );
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        return;
      }

      if (['who build u', 'who build you', 'who built you', 'who made you'].includes(lowerQuery)) {
        const finalMessage = `*↳ ❝ [👾 ${config.botName} AI 👾] ¡! ❞*\n\n` +
          `I am built by *Zayra*, my creator 🫶\n\n` +
          `> *Built by Zayra 𝜗𝜚⋆*`;

        await sock.sendMessage(from, { text: finalMessage, edit: loading.key }).catch(() =>
          sock.sendMessage(from, { text: finalMessage }, { quoted: msg })
        );
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        return;
      }

      // Deduct 1 coin (non-admin)
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

      // Call WormGPT API
      const targetUrl = `https://apis.xwolf.space/api/ai/wormgpt?q=\( {encodeURIComponent(query)}&key= \){WOLF_API_KEY}`;
      const response = await axios.get(targetUrl, { timeout: 45000 });

      const aiReply =
        response.data?.result ||
        response.data?.response ||
        response.data?.reply ||
        null;

      if (!aiReply) {
        // refund if failed
        if (!isAdmin) {
          const { addCoins } = require('../../lib/coins');
          await addCoins(userNum, 1);
        }
        return sock.sendMessage(from, {
          text: '❌ AI එකෙන් පිළිතුරක් ලැබුණේ නැහැ. නැවත try කරන්න.',
          edit: loading.key,
        }).catch(() => {});
      }

      const balanceLine = isAdmin
        ? `> *Unlimited Access*`
        : `> 🪙 *Requests left:* ${remaining}`;

      const finalMessage =
        `*↳ ❝ [👾 ${config.botName} AI 👾] ¡! ❞*\n\n` +
        `${aiReply}\n\n` +
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
