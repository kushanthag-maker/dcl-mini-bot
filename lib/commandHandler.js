const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

const commands = new Map();
const aliases = new Map();

async function loadCommands() {
  commands.clear();
  aliases.clear();

  const categories = ['owner', 'group', 'download', 'ai', 'utility', 'fun'];
  const commandsDir = path.join(__dirname, '..', 'commands');

  for (const cat of categories) {
    const catPath = path.join(commandsDir, cat);
    if (!(await fs.pathExists(catPath))) continue;

    const files = (await fs.readdir(catPath)).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      try {
        const filePath = path.join(catPath, file);
        delete require.cache[require.resolve(filePath)];
        const cmd = require(filePath);

        if (!cmd.name || !cmd.execute) {
          logger.warn(`Invalid command file: ${cat}/${file}`);
          continue;
        }

        commands.set(cmd.name, { ...cmd, category: cat });
        if (cmd.aliases && Array.isArray(cmd.aliases)) {
          cmd.aliases.forEach((a) => aliases.set(a, cmd.name));
        }
        logger.info(`Loaded command: .${cmd.name} (${cat})`);
      } catch (err) {
        logger.error(`Failed to load ${cat}/${file}`, err);
      }
    }
  }

  logger.success(`Total commands loaded: ${commands.size}`);
}

function getCommand(name) {
  const cmdName = aliases.get(name) || name;
  return commands.get(cmdName);
}

function getAllCommands() {
  return Array.from(commands.values());
}

function getCommandsByCategory(category) {
  return Array.from(commands.values()).filter((c) => c.category === category);
}

module.exports = {
  loadCommands,
  getCommand,
  getAllCommands,
  getCommandsByCategory,
  commands,
};
