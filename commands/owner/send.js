const { addCoins, getCoins, getAllUsers, setCoins } = require('../../lib/coins');
const config = require('../../config');

const ADMIN_NUMBER = '94769904294';

module.exports = {
  name: 'send',
  aliases: ['give', 'addcoin'],
  description: 'Send AI request coins to users (Admin only)',
  category: 'owner',
  ownerOnly: true,
  async execute({ sock, msg, from, args, senderNumber, isFromMe }) {
    const userNum = String(senderNumber || '').replace(/[^0-9]/g, '');

    // Only this number can use
    if (userNum !== ADMIN_NUMBER && !isFromMe) {
      return sock.sendMessage(from, {
        text: '❌ මේ command එක adminට විතරයි.',
      }, { quoted: msg });
    }

    if (!args.length) {
      return sock.sendMessage(from, {
        text: `╭───「 🪙 *SEND COINS* 」───╮
│
│  *Usage:*
│  .send <number> <amount>
│  .send all <amount>
│
│  *Example:*
│  .send 9477xxxxxxx 10
│  .send all 19
│
╰──────────────────────╯`,
      }, { quoted: msg });
    }

    try {
      // ===== .send all <amount> =====
      if (args[0].toLowerCase() === 'all') {
        const amount = parseInt(args[1]);
        if (!amount || amount < 1) {
          return sock.sendMessage(from, {
            text: '❌ Amount එකක් දෙන්න.\nඋදා: `.send all 19`',
          }, { quoted: msg });
        }

        const users = await getAllUsers();
        if (!users.length) {
          return sock.sendMessage(from, {
            text: '❌ Database එකේ users නැහැ. පළමුව කෙනෙකුට coins දෙන්න.',
          }, { quoted: msg });
        }

        let success = 0;
        for (const u of users) {
          try {
            await addCoins(u.number, amount);
            success++;

            // Notify user
            const jid = u.number.includes('@') ? u.number : `${u.number}@s.whatsapp.net`;
            await sock.sendMessage(jid, {
              text: `╭───「 🪙 *REQUESTS RECEIVED* 」───╮
│
│  ✅ *${amount}* AI requests
│     ඔබට ලැබුණා!
│
│  👾 දැන් *.ai* use කරන්න
│     පුළුවන්
│
╰──────────────────────╯`,
            }).catch(() => {});
          } catch (e) {
            console.error('Send all error:', u.number, e.message);
          }
        }

        return sock.sendMessage(from, {
          text: `✅ *\( {success}* users ට * \){amount}* coins බැගින් යව්වා.`,
        }, { quoted: msg });
      }

      // ===== .send <number> <amount> =====
      const target = String(args[0]).replace(/[^0-9]/g, '');
      const amount = parseInt(args[1]);

      if (!target || target.length < 10) {
        return sock.sendMessage(from, {
          text: '❌ Valid number එකක් දෙන්න.\nඋදා: `.send 9477xxxxxxx 10`',
        }, { quoted: msg });
      }

      if (!amount || amount < 1) {
        return sock.sendMessage(from, {
          text: '❌ Amount එකක් දෙන්න.\nඋදා: `.send 9477xxxxxxx 10`',
        }, { quoted: msg });
      }

      const newBalance = await addCoins(target, amount);

      // Notify target user
      const targetJid = `${target}@s.whatsapp.net`;
      await sock.sendMessage(targetJid, {
        text: `╭───「 🪙 *REQUESTS RECEIVED* 」───╮
│
│  ✅ *${amount}* AI requests
│     ඔබට ලැබුණා!
│
│  🪙 *Balance* ›  ${newBalance}
│
│  👾 දැන් *.ai* use කරන්න
│     පුළුවන්
│
╰──────────────────────╯`,
      }).catch(() => {});

      await sock.sendMessage(from, {
        text: `╭───「 🪙 *SENT* 」───╮
│
│  📱 *To*       ›  ${target}
│  🪙 *Added*    ›  ${amount}
│  💰 *Balance*  ›  ${newBalance}
│
│  ✅ User ට message යැව්වා
│
╰──────────────────────╯`,
      }, { quoted: msg });
    } catch (err) {
      console.error('Send Error:', err.message);
      await sock.sendMessage(from, {
        text: `❌ Error: ${err.message}`,
      }, { quoted: msg });
    }
  },
};
