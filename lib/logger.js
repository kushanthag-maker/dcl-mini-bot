const chalk = require('chalk');
const moment = require('moment-timezone');
const config = require('../config');

const time = () => moment().tz(config.timezone).format('HH:mm:ss');

const logger = {
  info: (msg) => console.log(chalk.blue(`[${time()}]`) + chalk.cyan(' [INFO] ') + msg),
  success: (msg) => console.log(chalk.blue(`[${time()}]`) + chalk.green(' [SUCCESS] ') + msg),
  warn: (msg) => console.log(chalk.blue(`[${time()}]`) + chalk.yellow(' [WARN] ') + msg),
  error: (msg, err) => {
    console.log(chalk.blue(`[${time()}]`) + chalk.red(' [ERROR] ') + msg);
    if (err) console.error(err);
  },
  connection: (msg) => console.log(chalk.blue(`[${time()}]`) + chalk.magenta(' [CONN] ') + msg),
  command: (cmd, from) => console.log(chalk.blue(`[${time()}]`) + chalk.white(` [CMD] .${cmd} from ${from}`)),
};

module.exports = logger;
