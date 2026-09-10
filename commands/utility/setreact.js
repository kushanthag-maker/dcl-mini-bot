const config = require('../../config');
const { load, save, normalizeNewsletterJid, parseChannelLink, FOOTER } = require('../../lib/channelReactStore');
const { getOnlineSocks } = require('../../lib/channelReactLib');

const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';

module.exports = {
  name: 'setreact',
  aliases: ['autoreact', 'chsetreact'],
  description: 'Auto-react all new posts on a channel (multi-bot)',
  category: 'utility',

  async execute({ sock, msg, from, args, senderNumber }) {
    const prefix = config.prefix || '.';

    if (!args.length) {
      const data = load();
      const channels = Object.keys(data.autoChannels || {});
      let list = channels.length
        ? channels
            .map((j, i) => {
              const c = data.autoChannels[j];
              return `│  *${i + 1}.* \`${j.split('@')[0].slice(0, 16)}…\`\n│      ${ (c.emojis || []).join('') || '👍' } · ${c.enabled === false ? 'OFF' : 'ON'}`;
            })
            .join('\n')
        : '│  (empty)';

      return sock.sendMessage(
        from,
        {
          text:
            `╭───「 ⚙️ *𝐒𝐄𝐓 𝐑𝐄𝐀𝐂𝐓* 」───╮\n│\n` +
            `│  ${prefix}setreact <channel-jid|link> [emojis]\n` +
            `│  ${prefix}setreact off <channel-jid>\n│\n` +
            `│  📌 Example:\n` +
            `│  ${prefix}setreact 120363...@newsletter ❤️🔥👍\n│\n` +
            `│  📢 *Saved channels:*\n${list}\n│\n` +
            `╰──────────────────────╯\n` +
            `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`,
        },
        { quoted: msg }
      );
    }

    // off
    if (args[0].toLowerCase() === 'off' || args[0].toLowerCase() === 'remove') {
      const jid =
        normalizeNewsletterJid(args[1] || '') ||
        normalizeNewsletterJid(args.slice(1).join(' '));
      if (!jid) {
        return sock.sendMessage(from, { text: '❌ Channel jid දෙන්න' }, { quoted: msg });
      }
      const data = load();
      delete data.autoChannels[jid];
      save(data);
      return sock.sendMessage(
        from,
        {
          text: `✅ Auto-react *REMOVED*\n📢 \`${jid}\`\n> ✦ ${FOOTER} ✦`,
        },
        { quoted: msg }
      );
    }

    let jid = normalizeNewsletterJid(args[0]);
    const parsed = parseChannelLink(args[0]);
    let emojiArgs = args.slice(1);

    if (!jid && parsed) {
      // try resolve via metadata
      const socks = getOnlineSocks();
      if (socks[0]?.sock?.newsletterMetadata) {
        try {
          const meta = await socks[0].sock.newsletterMetadata('invite', parsed.inviteOrId);
          jid = normalizeNewsletterJid(meta?.id || meta?.jid) || meta?.id;
        } catch (_) {}
      }
      if (!jid) {
        return sock.sendMessage(
          from,
          {
            text:
              `❌ Channel JID resolve බැරි වුණා.\n` +
              `💡 \`${prefix}setreact 120363xxxxxxxx@newsletter ❤️👍\``,
          },
          { quoted: msg }
        );
      }
    }

    if (!jid) {
      return sock.sendMessage(
        from,
        { text: `❌ Invalid channel.\n💡 \`120363...@newsletter\`` },
        { quoted: msg }
      );
    }

    let emojis = emojiArgs
      .join(' ')
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!emojis.length) emojis = ['👍', '❤️', '🔥'];

    const data = load();
    data.autoChannels[jid] = {
      emojis,
      enabled: true,
      addedBy: String(senderNumber || ''),
      addedAt: Date.now(),
    };
    save(data);

    const bots = getOnlineSocks().length;

    await sock.sendMessage(
      from,
      {
        text:
          `╭───「 ✅ *𝐀𝐔𝐓𝐎 𝐑𝐄𝐀𝐂𝐓 𝐎𝐍* 」───╮\n│\n` +
          `│  📢 *Channel* ›  \`${jid}\`\n` +
          `│  😀 *Emojis*  ›  ${emojis.join(' ')}\n` +
          `│  🤖 *Bots*    ›  ${bots} online\n│\n` +
          `│  📌 New posts → bots share reacts\n` +
          `╰──────────────────────╯\n` +
          `> ✦ ${FOOTER} ✦\n_*✰┈ ${BOT_FANCY} ┈✰*_`,
      },
      { quoted: msg }
    );
  },
};
