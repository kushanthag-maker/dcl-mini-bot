const config = require('../../config');
const { load, FOOTER } = require('../../lib/channelReactStore');
const { getOnlineSocks } = require('../../lib/channelReactLib');

const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const OWNER = '94769904294'; // 0769904294

function digits(n) {
  return String(n || '').replace(/[^0-9]/g, '');
}

function isOwner(senderNumber, isOwnerFlag, isFromMe) {
  const n = digits(senderNumber);
  if (isFromMe || isOwnerFlag) return true;
  if (n === OWNER || n === '769904294' || n.endsWith('769904294')) return true;
  return false;
}

module.exports = {
  name: 'reactst',
  aliases: ['reactstats', 'rstats'],
  description: 'Channel react stats (owner only)',
  category: 'owner',

  async execute({ sock, msg, from, senderNumber, isOwner, isFromMe }) {
    if (!isOwner(senderNumber, isOwner, isFromMe)) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 🔒 *𝐑𝐄𝐀𝐂𝐓 𝐒𝐓𝐀𝐓𝐒* 」───╮\n│\n` +
            `│  ❌ Owner only\n│\n` +
            `╰──────────────────────╯\n> ✦ ${FOOTER} ✦`,
        },
        { quoted: msg }
      );
    }

    const data = load();
    const bots = getOnlineSocks().length;
    const channels = Object.keys(data.autoChannels || {});
    const activeAuto = channels.filter((j) => data.autoChannels[j]?.enabled !== false);

    let chLines = '';
    const by = data.stats.byChannel || {};
    const top = Object.keys(by)
      .sort((a, b) => (by[b].reacts || 0) - (by[a].reacts || 0))
      .slice(0, 10);

    if (top.length) {
      top.forEach((j, i) => {
        const s = by[j];
        chLines += `│  *${i + 1}.* \`${j.split('@')[0].slice(0, 14)}…\`\n`;
        chLines += `│      💥 ${s.reacts || 0} reacts · 📝 ${s.posts || 0} posts\n`;
      });
    } else {
      chLines = '│  (no data yet)\n';
    }

    const text =
      `╭───「 📊 *𝐑𝐄𝐀𝐂𝐓 𝐒𝐓𝐀𝐓𝐒* 」───╮\n│\n` +
      `│  🤖 *Active bots*     ›  *${bots}*\n` +
      `│  📢 *Auto channels*   ›  *${activeAuto.length}*\n` +
      `│  💥 *Total reacts*    ›  *${data.stats.totalReacts || 0}*\n` +
      `│  📝 *Posts reacted*   ›  *${data.stats.totalPosts || 0}*\n│\n` +
      `│  🏆 *By channel:*\n${chLines}│\n` +
      `╰──────────────────────╯\n` +
      `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`;

    await sock.sendMessage(from, { text }, { quoted: msg });
  },
};
