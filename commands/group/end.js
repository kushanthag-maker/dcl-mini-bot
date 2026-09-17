const config = require('../../config');

const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const THUMB = 'https://files.catbox.moe/ti2zgx.webp';
const MAX_NUMBERS = 300;
const DELAY_MS = 1000;

function foot() {
  return (
    '\n🌸💕 *Pair:* ' +
    SITE +
    '\n> ✦ ' +
    FOOTER +
    ' ✦\n_*✰┈ ' +
    BOT_FANCY +
    ' ┈✰*_'
  );
}

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

async function replyImg(sock, from, msg, text) {
  const caption = String(text) + foot();
  try {
    await sock.sendMessage(
      from,
      { image: { url: THUMB }, caption: caption },
      msg ? { quoted: msg } : undefined
    );
  } catch (_) {
    await sock.sendMessage(
      from,
      { text: caption },
      msg ? { quoted: msg } : undefined
    );
  }
}

function normalizeNumber(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  s = s.replace(/@.*$/, '');
  s = s.replace(/[\s\-\(\)\+]/g, '');
  s = s.replace(/\D/g, '');
  if (s.length < 8 || s.length > 15) return null;
  if (s.startsWith('0') && s.length === 10) {
    s = '94' + s.slice(1);
  }
  return s;
}

function toJid(num) {
  return num + '@s.whatsapp.net';
}

function parseNumbers(args, body) {
  const text = (args && args.length ? args.join(' ') : body || '').trim();
  const parts = text.split(/[\s,;|\n\r]+/).filter(Boolean);
  const seen = {};
  const list = [];
  for (let i = 0; i < parts.length; i++) {
    if (/^\.?end$/i.test(parts[i])) continue;
    const n = normalizeNumber(parts[i]);
    if (!n) continue;
    if (seen[n]) continue;
    seen[n] = true;
    list.push(n);
    if (list.length >= MAX_NUMBERS) break;
  }
  return list;
}

/**
 * Build a Set of all possible ID formats for the bot.
 * Handles both @s.whatsapp.net and @lid formats (Baileys MD).
 */
function buildBotIdSet(sock) {
  const set = new Set();
  const rawId = sock.user?.id || '';
  const rawLid = sock.user?.lid || '';

  [rawId, rawLid].forEach(function (v) {
    if (!v) return;
    const s = String(v);
    const userPart = s.split('@')[0];          // 94771234567:5
    const numPart = userPart.split(':')[0];     // 94771234567

    set.add(s);                                 // full jid
    set.add(userPart);                          // 94771234567:5
    set.add(numPart);                           // 94771234567
    set.add(numPart + '@s.whatsapp.net');       // 94771234567@s.whatsapp.net
    set.add(numPart + '@lid');                  // 94771234567@lid
  });

  return set;
}

/**
 * Find the bot's participant entry from group metadata.
 * Matches against id, lid, phone number, or jid formats.
 */
function findBotParticipant(participants, botIds) {
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const pid = String(p.id || '');
    const plid = String(p.lid || '');

    const pidUser = pid.split('@')[0];
    const pidNum = pidUser.split(':')[0];
    const plidUser = plid.split('@')[0];
    const plidNum = plidUser.split(':')[0];

    // Exact match with any known bot id format
    if (
      botIds.has(pid) ||
      botIds.has(plid) ||
      botIds.has(pidUser) ||
      botIds.has(plidUser) ||
      botIds.has(pidNum) ||
      botIds.has(plidNum)
    ) {
      return p;
    }
  }
  return null;
}

module.exports = {
  name: 'end',
  aliases: ['addall', 'addnums', 'bulkadd', 'addmembers'],
  description: 'Add many numbers to the group (max 300, 1s each)',
  category: 'group',

  async execute(ctx) {
    const sock = ctx.sock;
    const msg = ctx.msg;
    const from = ctx.from;
    const args = ctx.args || [];
    const body = ctx.body || '';
    const isGroup =
      ctx.isGroup != null ? ctx.isGroup : String(from).endsWith('@g.us');
    const prefix = config.prefix || '.';

    // ── 1. Group check ────────────────────────────────────
    if (!isGroup) {
      return replyImg(
        sock,
        from,
        msg,
        '❌💕 This command works *only in a group*\nOpen the group → ' +
          prefix +
          'end <numbers>'
      );
    }

    // ── 2. Parse numbers ──────────────────────────────────
    const numbers = parseNumbers(args, body);

    if (!numbers.length) {
      return replyImg(
        sock,
        from,
        msg,
        '╭───「 💖👥 *END / BULK ADD* 」───╮\n│\n' +
          '│  Add many numbers to *this group*\n│\n' +
          '│  📌 Usage:\n' +
          '│  ' +
          prefix +
          'end 0771234567 94771234567\n' +
          '│  ' +
          prefix +
          'end 0771...,0772...,0773...\n│\n' +
          '│  ⚠️ Max *' +
          MAX_NUMBERS +
          '* numbers\n' +
          '│  ⏱️ 1 second per number\n' +
          '│  👑 Bot must be *admin*\n│\n' +
          '╰──────────────────────╯'
      );
    }

    // ── 3. Admin check (FIXED) ────────────────────────────
    try {
      const meta = await sock.groupMetadata(from);
      const participants = meta.participants || [];

      const botIds = buildBotIdSet(sock);
      const me = findBotParticipant(participants, botIds);

      // Debug log — helpu diagnose issues
      console.log(
        '[end] bot ids:',
        Array.from(botIds),
        '| matched:',
        me ? me.id : 'NONE'
      );

      const isAdmin =
        me && (me.admin === 'admin' || me.admin === 'superadmin');

      if (!isAdmin) {
        return replyImg(
          sock,
          from,
          msg,
          '❌👑 Bot is not *admin* in this group\nMake bot admin first'
        );
      }
    } catch (e) {
      console.error('[end] metadata error:', e.message);
      return replyImg(
        sock,
        from,
        msg,
        '⚠️ Could not verify bot admin status\nPlease try again in a moment'
      );
    }

    // ── 4. Start message ──────────────────────────────────
    const total = numbers.length;
    await replyImg(
      sock,
      from,
      msg,
      '╭───「 💖👥 *BULK ADD* 」───╮\n│\n' +
        '│  📦 Numbers › *' +
        total +
        '*\n' +
        '│  ⏱️ Delay › 1s each\n' +
        '│  ⏳ ETA ~' +
        total +
        's\n' +
        '│  🌸 Starting...\n│\n' +
        '╰──────────────────────╯'
    );

    // ── 5. Add loop ───────────────────────────────────────
    let ok = 0;
    let fail = 0;
    const failed = [];

    for (let i = 0; i < numbers.length; i++) {
      const num = numbers[i];
      const jid = toJid(num);
      try {
        const res = await sock.groupParticipantsUpdate(from, [jid], 'add');
        const status =
          Array.isArray(res) && res[0]
            ? String(res[0].status || res[0])
            : '200';
        if (status === '200' || status === '202') {
          ok++;
        } else {
          fail++;
          failed.push(num + ' (' + status + ')');
        }
      } catch (err) {
        fail++;
        failed.push(num + ' (err)');
        console.error('[end] add failed', num, err.message);
      }

      if ((i + 1) % 25 === 0 || i === numbers.length - 1) {
        await replyImg(
          sock,
          from,
          null,
          '💗 Progress *' +
            (i + 1) +
            '/' +
            total +
            '* · ✅' +
            ok +
            ' · ❌' +
            fail
        );
      }

      if (i < numbers.length - 1) await sleep(DELAY_MS);
    }

    // ── 6. Final report ───────────────────────────────────
    let done =
      '╭───「 💖✅ *DONE* 」───╮\n│\n' +
      '│  📦 Total › *' +
      total +
      '*\n' +
      '│  ✅ Added › *' +
      ok +
      '*\n' +
      '│  ❌ Failed › *' +
      fail +
      '*\n';

    if (failed.length && failed.length <= 15) {
      done += '│\n│  ⚠️ Fail list:\n';
      failed.forEach(function (f) {
        done += '│  ' + f + '\n';
      });
    } else if (failed.length > 15) {
      done += '│\n│  ⚠️ ' + failed.length + ' failed (privacy / invalid)\n';
    }

    done += '│\n╰──────────────────────╯';

    await replyImg(sock, from, msg, done);
  },
};
