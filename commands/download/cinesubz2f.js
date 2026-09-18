const config = require('../../config');
const cs2 = require('./cinesubz2');

module.exports = {
  name: 'cinesubz2f',
  aliases: ['cs2f', 'cine2f'],
  description: 'Set custom footer for .cinesubz2 cards & documents',
  category: 'download',

  async execute(ctx) {
    const sock = ctx.sock;
    const msg = ctx.msg;
    const from = ctx.from;
    const args = ctx.args || [];
    const prefix = config.prefix || '.';

    if (!args.length) {
      return cs2.replyImg(
        sock,
        from,
        msg,
        '╭───「 💖✨ *FOOTER* 」───╮\n│\n' +
          '│  Current › *' +
          cs2.getFooter(from) +
          '*\n│\n' +
          '│  📌 Set:\n' +
          '│  ' +
          prefix +
          'cinesubz2f <your text>\n│\n' +
          '│  📌 Reset:\n' +
          '│  ' +
          prefix +
          'cinesubz2f reset\n│\n' +
          '│  Shows on detail card + document\n' +
          '╰──────────────────────╯'
      );
    }

    const text = args.join(' ').trim();
    if (/^(reset|default|clear)$/i.test(text)) {
      cs2.setFooter(from, '');
      return cs2.replyImg(
        sock,
        from,
        msg,
        '✅ Footer reset → *' + cs2.DEFAULT_FOOTER + '*'
      );
    }

    const set = cs2.setFooter(from, text);
    return cs2.replyImg(
      sock,
      from,
      msg,
      '✅ Footer set → *' + set + '*\n💕 Used on next .cinesubz2 detail & document'
    );
  },
};
