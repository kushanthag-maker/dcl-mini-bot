const { getAllCommands, getCommandsByCategory } = require('../../lib/commandHandler');
const config = require('../../config');

module.exports = {
  name: 'menu',
  aliases: ['help', 'list'],
  description: 'Show all available commands',
  category: 'utility',
  async execute({ sock, msg, from }) {
    const categories = {
      owner: '👑 Owner',
      group: '👥 Group',
      download: '🎵 Download',
      ai: '🤖 AI',
      utility: '🛠 Utility',
      fun: '🎮 Fun',
    };

    let text = `╭───『 *${config.botName}* 』───╮\n`;
    text += `│ Prefix: *${config.prefix}*\n`;
    text += `│ Total Commands: *${getAllCommands().length}*\n`;
    text += `╰──────────────────╯\n\n`;

    for (const [cat, title] of Object.entries(categories)) {
      const cmds = getCommandsByCategory(cat);
      if (cmds.length === 0) continue;
      text += `*${title}*\n`;
      text += cmds.map((c) => `  ${config.prefix}${c.name}`).join('\n');
      text += '\n\n';
    }

    text += `_Type ${config.prefix}help <command> for more info_`;

    await sock.sendMessage(from, { text }, { quoted: msg });
  },
};
