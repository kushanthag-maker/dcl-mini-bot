const config = require('../../config');
const { getOnlineCount, getAllSessions } = require('../../lib/sessionManager');

// Only this number can use .active
const ALLOWED = '94769904294'; // 0769904294

function digits(n) {
  return String(n || '').replace(/[^0-9]/g, '');
}

function isAllowed(senderNumber, isOwner, isFromMe) {
  const n = digits(senderNumber);
  if (n === ALLOWED || n === ALLOWED.slice(-9) || n.endsWith('769904294')) return true;
  // also allow if ends with local form without leading 0
  if (n === '769904294' || n === '0769904294') return true;
  if (isFromMe) return true;
  return false;
}

function formatUptime(ms) {
  if (!ms) return 'N/A';
  const sec = Math.floor((Date.now() - ms) / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}D ${h}H ${m}M`;
}

module.exports = {
  name: 'active',
  aliases: ['bots', 'onlinebots', 'botcount'],
  description: 'Show active bot count (owner only)',
  category: 'owner',

  async execute({ sock, msg, from, senderNumber, isOwner, isFromMe }) {
    const prefix = config.prefix || '.';

    if (!isAllowed(senderNumber, isOwner, isFromMe)) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 🔒 *ACTIVE* 」───╮
│
│  ❌ *Access denied*
│  👑 Owner only command
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    try {
      const online = getOnlineCount();
      const all = getAllSessions();
      const onlineList = all.filter((s) => s.status === 'online');
      const connecting = all.filter((s) =>
        ['connecting', 'waiting_qr', 'waiting_pair'].includes(s.status)
      ).length;
      const totalTracked = all.length;

      let listBlock = '';
      if (onlineList.length) {
        listBlock += `\n*╭──┉❰ 📋 𝐎𝐍𝐋𝐈𝐍𝐄 𝐋𝐈𝐒𝐓 ❱┉──•*\n`;
        onlineList.slice(0, 25).forEach((s, i) => {
          const name = (s.user && s.user.name) || '—';
          const up = s.startedAt ? formatUptime(s.startedAt) : 'N/A';
          listBlock += `*│◊│* ✦ \`${i + 1}.\` *${s.sessionId}* · ${name} · ⏱ ${up}\n`;
        });
        if (onlineList.length > 25) {
          listBlock += `*│◊│* … +${onlineList.length - 25} more\n`;
        }
        listBlock += `*│◊╰────────────┉•┉*\n*╰──────────────────┉*\n`;
      }

      const text = `
*╭─┉❰ 🌸 𝐀𝐂𝐓𝐈𝐕𝐄 𝐁𝐎𝐓𝐒 🌸 ❱┉─┉──•*
*│ 👑 𝐎𝚆𝙽𝙴𝚁 𝐒𝚃𝙰𝚃𝚄𝚂 𝐏𝙰𝙽𝙴𝙻*
*╰┉────────────┉─•*

*╭──┉❰ 📊 𝐂𝐎𝐔𝐍𝐓 ❱┉──•*
*│◊│* ✦ 🤖 \`ᴏɴʟɪɴᴇ\` : *${online}*
*│◊│* ✦ 🔄 \`ᴄᴏɴɴᴇᴄᴛɪɴɢ\` : *${connecting}*
*│◊│* ✦ 📦 \`ᴛʀᴀᴄᴋᴇᴅ\` : *${totalTracked}*
*│◊╰────────────┉•┉*
*╰──────────────────┉*
${listBlock}
*╭━━〔 💬 𝐍𝐎𝐓𝐈𝐂𝐄 〕━━⬣*
*│◊│* 📌 Live count from this server
*│◊│* 🌸 Only *0769904294* can use this
*╰━━━━━━━━━━━━━━⬣*

_*✰┈ 𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴 ┈✰*_

> RED DEVIL AND ZAYRA DEV
`.trim();

      await sock.sendMessage(from, { text }, { quoted: msg });
    } catch (err) {
      console.error('active cmd error:', err.message);
      await sock.sendMessage(
        from,
        { text: `❌ \`${err.message}\`` },
        { quoted: msg }
      );
    }
  },
};
