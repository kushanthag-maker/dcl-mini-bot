const config = require('../../config');
const { multiReact, resolvePostTarget, getOnlineSocks } = require('../../lib/channelReactLib');
const { FOOTER } = require('../../lib/channelReactStore');

const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';

module.exports = {
  name: 'react',
  aliases: ['creact', 'chreact'],
  description: 'React to a WhatsApp channel post (multi-bot)',
  category: 'utility',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    if (args.length < 2) {
      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 💬 *𝐂𝐇𝐀𝐍𝐍𝐄𝐋 𝐑𝐄𝐀𝐂𝐓* 」───╮\n│\n` +
            `│  ${prefix}react <post-link> <emoji> [count]\n` +
            `│  ${prefix}react <link> 🔥❤️👍 10\n│\n` +
            `│  📌 Example:\n` +
            `│  ${prefix}react https://whatsapp.com/channel/xxx/123 ❤️ 5\n│\n` +
            `│  🤖 Active bots share reacts\n` +
            `╰──────────────────────╯\n` +
            `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`,
        },
        { quoted: msg }
      );
    }

    // Parse: link ... emojis count
    // last arg if number = count
    let count = 1;
    let rest = [...args];
    const last = rest[rest.length - 1];
    if (/^\d+$/.test(last) && rest.length >= 3) {
      count = Math.min(parseInt(last, 10), 200);
      rest = rest.slice(0, -1);
    }

    // find link token
    let linkIdx = rest.findIndex((a) => /whatsapp\.com\/channel\//i.test(a) || /@newsletter/i.test(a));
    if (linkIdx < 0) linkIdx = 0;
    const link = rest[linkIdx];
    const emojiParts = rest.filter((_, i) => i !== linkIdx);
    const emojis = emojiParts.length ? emojiParts : ['👍'];

    const loading = await sock.sendMessage(
      from,
      { text: `💬✨ *𝐑𝐞𝐚𝐜𝐭𝐢𝐧𝐠...*\n🤖 bots × ${count}` },
      { quoted: msg }
    );

    try {
      const bots = getOnlineSocks().length;
      const { newsletterJid, serverMsgId } = await resolvePostTarget(link);

      const result = await multiReact({
        newsletterJid,
        serverMsgId,
        emojis,
        count,
      });

      const text =
        `╭───「 ${result.ok ? '✅' : '⚠️'} *𝐑𝐄𝐀𝐂𝐓* 」───╮\n│\n` +
        `│  📢 *Channel* ›  \`${newsletterJid.split('@')[0].slice(0, 18)}…\`\n` +
        `│  🆔 *Post*    ›  ${serverMsgId}\n` +
        `│  😀 *Emoji*   ›  ${emojis.join(' ')}\n` +
        `│  🤖 *Bots*    ›  ${result.bots}\n` +
        `│  💥 *Reacts*  ›  ${result.done}/${result.requested}\n│\n` +
        (result.errors?.length
          ? `│  ⚠️ ${result.errors[0].slice(0, 40)}\n│\n`
          : '') +
        `╰──────────────────────╯\n` +
        `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`;

      await sock
        .sendMessage(from, { text, edit: loading.key })
        .catch(() => sock.sendMessage(from, { text }, { quoted: msg }));
    } catch (err) {
      console.error('react cmd:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ *𝐑𝐞𝐚𝐜𝐭 𝐟𝐚𝐢𝐥*\n\n\`${err.message}\`\n> ✦ ${FOOTER} ✦`,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
