const config = require('../../config');
const moment = require('moment-timezone');

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm'],
  description: 'Show all available commands with banner',
  category: 'utility',
  async execute({ sock, msg, from }) {
    try {
      const uptime = process.uptime();
      const d = Math.floor(uptime / 86400);
      const h = Math.floor((uptime % 86400) / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);
      const runtime = `${d}d ${h}h ${m}m ${s}s`;
      const now = moment().tz(config.timezone || 'Asia/Colombo').format('HH:mm');

      const user = (msg.key.participant || msg.key.remoteJid || '').split('@')[0];

      const menuText = `
╭───「 ⚡ *${config.botName}* 」───╮
│
│  👤 *User*      ›  @${user}
│  🤖 *Bot*       ›  ${config.botName}
│  ⚙️ *Prefix*    ›  *${config.prefix}*
│  ⏱ *Runtime*   ›  _${runtime}_
│  🕐 *Time*      ›  _${now}_
│  📶 *Status*    ›  Online ✅
│
╰──────────────────────╯

╭───「 👑 *𝗢𝗪𝗡𝗘𝗥* 」───╮
│
│  ▸ *${config.prefix}owner*     _creator_
│  ▸ *${config.prefix}restart*   _reboot_
│  ▸ *${config.prefix}shutdown*  _stop_
│
╰──────────────────────╯

╭───「 👥 *𝗚𝗥𝗢𝗨𝗣* 」───╮
│
│  ▸ *${config.prefix}kick*      _remove_
│  ▸ *${config.prefix}promote*
│  ▸ *${config.prefix}demote*
│  ▸ *${config.prefix}tagall*    _everyone, all_
│
╰──────────────────────╯

╭───「 📥 *𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗* 」───╮
│
│  ▸ *${config.prefix}play*      _song, p_
│
╰──────────────────────╯

╭───「 🤖 *𝗔𝗜* 」───╮
│
│  ▸ *${config.prefix}ai*        _chat, gpt_
│
╰──────────────────────╯

╭───「 🛠️ *𝗨𝗧𝗜𝗟𝗜𝗧𝗬* 」───╮
│
│  ▸ *${config.prefix}menu*      _help, list, m_
│  ▸ *${config.prefix}ping*      _p_
│  ▸ *${config.prefix}runtime*   _uptime_
│  ▸ *${config.prefix}alive*     _bot_
│  ▸ *${config.prefix}news*      _adaderana, n_
│  ▸ *${config.prefix}calc*      _calculate, math_
│
╰──────────────────────╯

╭───「 🎮 *𝗙𝗨𝗡* 」───╮
│
│  ▸ *${config.prefix}dice*      _roll_
│  ▸ *${config.prefix}flip*      _coin_
│  ▸ *${config.prefix}joke*      _jokes_
│
╰──────────────────────╯

╭───「 ℹ️ *𝗜𝗡𝗙𝗢* 」───╮
│
│  💡 Type *${config.prefix}help* <cmd>
│  🔥 *DCL MINI* › _v1.0_
│  🖤 _Dark Cyber Lidarz_
│
╰──────────────────────╯
`.trim();

      await sock.sendMessage(
        from,
        {
          image: { url: 'https://files.catbox.moe/xvos88.png' },
          caption: menuText,
          mentions: [msg.key.participant || msg.key.remoteJid],
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('Menu Error:', err.message);
      await sock.sendMessage(from, {
        text: '❌ Menu load වෙන්නේ නැහැ.',
      }, { quoted: msg });
    }
  },
};
