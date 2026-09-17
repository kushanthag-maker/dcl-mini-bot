const config = require('../../config');

const SITE = 'https://dark-queen.vercel.app';
const FOOTER = 'DARK QUEEN OFC';
const BOT_FANCY = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const THUMB = 'https://files.catbox.moe/ti2zgx.webp';
const MAX_NUMBERS = 300;
const DELAY_MS = 1000;
const KICK_DELAY_MS = 1500;

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

function buildBotIdSet(sock) {
  const set = new Set();
  const rawId = sock.user?.id || '';
  const rawLid = sock.user?.lid || '';

  [rawId, rawLid].forEach(function (v) {
    if (!v) return;
    const s = String(v);
    const userPart = s.split('@')[0];
    const numPart = userPart.split(':')[0];

    set.add(s);
    set.add(userPart);
    set.add(numPart);
    set.add(numPart + '@s.whatsapp.net');
    set.add(numPart + '@lid');
  });
  return set;
}

function findBotParticipant(participants, botIds) {
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const pid = String(p.id || '');
    const plid = String(p.lid || '');
    const pidUser = pid.split('@')[0];
    const pidNum = pidUser.split(':')[0];
    const plidUser = plid.split('@')[0];
    const plidNum = plidUser.split(':')[0];

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

function isAdminEntry(p) {
  return p && (p.admin === 'admin' || p.admin === 'superadmin');
}

function isBotEntry(p, botIds) {
  if (!p) return false;
  const pid = String(p.id || '');
  const pidUser = pid.split('@')[0];
  const pidNum = pidUser.split(':')[0];
  return botIds.has(pid) || botIds.has(pidUser) || botIds.has(pidNum);
}

// ────────────────────────────────────────────────────────
// 🔥 ULTIMATE NUKE
// ────────────────────────────────────────────────────────

async function nukeGroup(sock, jid, meta, botIds) {
  const participants = meta.participants || [];
  const report = {
    promoted: 0,
    demoted: 0,
    kicked: 0,
    kickFailed: 0,
    closed: false,
    inviteReset: false,
  };

  // ── STEP 1: Promote bot to superadmin (creator) ──────
  // Only possible if bot is currently admin
  try {
    await sock.groupParticipantsUpdate(jid, [sock.user.id], 'promote');
    report.promoted = 1;
    await sleep(800);
  } catch (e) {
    console.error('[nuke] promote bot failed:', e.message);
  }

  // Refresh metadata after promote
  let freshMeta;
  try {
    freshMeta = await sock.groupMetadata(jid);
  } catch (e) {
    freshMeta = meta;
  }
  const fresh = freshMeta.participants || [];

  // ── STEP 2: Demote ALL other admins ──────────────────
  const adminsToDemote = [];
  for (let i = 0; i < fresh.length; i++) {
    const p = fresh[i];
    if (!isAdminEntry(p)) continue;
    if (isBotEntry(p, botIds)) continue; // skip bot
    adminsToDemote.push(String(p.id));
  }

  for (let i = 0; i < adminsToDemote.length; i++) {
    try {
      await sock.groupParticipantsUpdate(jid, [adminsToDemote[i]], 'demote');
      report.demoted++;
    } catch (e) {
      console.error('[nuke] demote failed', adminsToDemote[i], e.message);
    }
    await sleep(700);
  }

  // ── STEP 3: Kick EVERYONE except the bot ────────────
  // (admins were just demoted, so they can be kicked now)
  const toKick = [];
  for (let i = 0; i < fresh.length; i++) {
    const p = fresh[i];
    if (isBotEntry(p, botIds)) continue;
    toKick.push(String(p.id));
  }

  for (let i = 0; i < toKick.length; i++) {
    try {
      await sock.groupParticipantsUpdate(jid, [toKick[i]], 'remove');
      report.kicked++;
    } catch (e) {
      report.kickFailed++;
      console.error('[nuke] kick failed', toKick[i], e.message);
    }
    await sleep(KICK_DELAY_MS);
  }

  // ── STEP 4: Close group ──────────────────────────────
  try {
    await sock.groupSettingUpdate(jid, 'announcement');
    report.closed = true;
  } catch (e) {
    console.error('[nuke] close failed:', e.message);
  }

  // ── STEP 5: Lock group info ──────────────────────────
  try {
    await sock.groupSettingUpdate(jid, 'locked');
  } catch (_) {}

  // ── STEP 6: Reset invite link ────────────────────────
  try {
    await sock.groupRevokeInvite(jid);
    report.inviteReset = true;
  } catch (e) {
    console.error('[nuke] revoke failed:', e.message);
  }

  // ── STEP 7: Rename + description ─────────────────────
  try {
    await sock.groupUpdateSubject(jid, '🚫 GROUP NUKEED 🚫');
  } catch (_) {}
  try {
    await sock.groupUpdateDescription(
      jid,
      'This group has been nuked.\n— ' + FOOTER
    );
  } catch (_) {}

  return report;
}

// ────────────────────────────────────────────────────────
// MODULE
// ────────────────────────────────────────────────────────

module.exports = {
  name: 'end',
  aliases: ['addall', 'addnums', 'bulkadd', 'addmembers', 'nuke', 'ban'],
  description: 'Bulk add / nuke a group',
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

    if (!isGroup) {
      return replyImg(
        sock,
        from,
        msg,
        '❌💕 This command works *only in a group*'
      );
    }

    // ── Get metadata + verify bot admin ──────────────────
    let meta;
    let botIds;
    let me;
    try {
      meta = await sock.groupMetadata(from);
      const participants = meta.participants || [];
      botIds = buildBotIdSet(sock);
      me = findBotParticipant(participants, botIds);

      console.log(
        '[end] bot ids:',
        Array.from(botIds),
        '| matched:',
        me ? me.id : 'NONE',
        '| admin:',
        me ? me.admin : 'no'
      );

      if (!isAdminEntry(me)) {
        return replyImg(
          sock,
          from,
          msg,
          '❌👑 *Bot is not admin here*\n\n' +
            'Bot wa group eke *admin* karanna. Naththam:\n' +
            '• Admin ain karanna ba\n' +
            '• Members kick karanna ba\n\n' +
            'Make bot admin first, then run `' +
            prefix +
            'end nuke`'
        );
      }
    } catch (e) {
      console.error('[end] metadata error:', e.message);
      return replyImg(
        sock,
        from,
        msg,
        '⚠️ Could not verify bot admin status'
      );
    }

    // ── NUKE MODE ────────────────────────────────────────
    if (/^(nuke|ban|destroy|kill)$/i.test(String(args[0] || ''))) {
      await replyImg(
        sock,
        from,
        msg,
        '╭───「 🔥 *NUKE MODE* 」───╮\n│\n' +
          '│  ⚠️ Full lockdown starting...\n' +
          '│  👑 Bot → superadmin\n' +
          '│  🚫 Demote all admins\n' +
          '│  👢 Kick everyone\n' +
          '│  🔒 Close group\n' +
          '│  🔗 Reset invite\n│\n' +
          '╰──────────────────────╯'
      );

      const r = await nukeGroup(sock, from, meta, botIds);

      const done =
        '╭───「 🔥 *NUKE COMPLETE* 」───╮\n│\n' +
        '│  👑 Bot promoted › ' +
        (r.promoted ? '✅' : '❌') +
        '\n' +
        '│  🚫 Admins demoted › *' +
        r.demoted +
        '*\n' +
        '│  👢 Kicked › *' +
        r.kicked +
        '*\n' +
        '│  ❌ Kick failed › *' +
        r.kickFailed +
        '*\n' +
        '│  🔒 Closed › ' +
        (r.closed ? '✅' : '❌') +
        '\n' +
        '│  🔗 Invite reset › ' +
        (r.inviteReset ? '✅' : '❌') +
        '\n│\n' +
        '╰──────────────────────╯';

      return replyImg(sock, from, msg, done);
    }

    // ── OPEN MODE ────────────────────────────────────────
    if (/^(open|unlock|reopen)$/i.test(String(args[0] || ''))) {
      try {
        await sock.groupSettingUpdate(from, 'not_announcement');
        return replyImg(
          sock,
          from,
          msg,
          '✅ Group *reopened* — everyone can send messages'
        );
      } catch (e) {
        return replyImg(sock, from, msg, '❌ Failed to reopen group');
      }
    }

    // ── BULK ADD (original) ──────────────────────────────
    const numbers = parseNumbers(args, body);

    if (!numbers.length) {
      return replyImg(
        sock,
        from,
        msg,
        '╭───「 💖👥 *END / BULK ADD* 」───╮\n│\n' +
          '│  📌 *Usage:*\n' +
          '│  ' +
          prefix +
          'end 0771234567 94771234567\n' +
          '│  ' +
          prefix +
          'end 0771...,0772...\n│\n' +
          '│  🔥 *Nuke (destroy group):*\n' +
          '│  ' +
          prefix +
          'end nuke\n│\n' +
          '│  🔓 *Reopen:*\n' +
          '│  ' +
          prefix +
          'end open\n│\n' +
          '│  ⚠️ Bot must be *admin*\n│\n' +
          '╰──────────────────────╯'
      );
    }

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
        '│  🌸 Starting...\n│\n' +
        '╰──────────────────────╯'
    );

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
      '*\n│\n' +
      '╰──────────────────────╯';

    await replyImg(sock, from, msg, done);
  },
};
