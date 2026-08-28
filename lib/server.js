const express = require('express');
const path = require('path');
const config = require('../config');
const logger = require('./logger');
const {
  startSession,
  requestPairingCode,
  getAllSessions,
  getSessionStatus,
  stopSession,
  getOnlineCount,
  sessions,
} = require('./sessionManager');
const { getSettings, updateSettings } = require('./botSettings');

// phone -> { code, expires, verified }
const settingsOtp = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(p) {
  return String(p || '').replace(/[^0-9]/g, '');
}

async function sendWhatsAppText(phone, text) {
  const clean = normalizePhone(phone);
  if (clean.length < 10) throw new Error('Invalid phone number');

  let sock = null;
  sessions.forEach(function (s) {
    if (!sock && s.status === 'online' && s.sock) sock = s.sock;
  });

  if (!sock) {
    throw new Error('No online bot session. Pair a bot first, then try again.');
  }

  const jid = clean + '@s.whatsapp.net';
  await sock.sendMessage(jid, { text: text });
  return true;
}

function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'website')));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
    next();
  });

  app.get('/api/status', (req, res) => {
    const list = getAllSessions().map((s) => ({
      sessionId: s.sessionId,
      status: s.status,
      user: s.user ? { name: s.user.name || null } : null,
      startedAt: s.startedAt,
      error: s.error,
    }));
    res.json({
      onlineCount: getOnlineCount(),
      totalSessions: list.length,
      sessions: list,
    });
  });

  app.get('/api/session/:id', (req, res) => {
    const st = getSessionStatus(req.params.id);
    if (st.user) st.user = { name: st.user.name || null };
    res.json(st);
  });

  app.post('/api/session/start', async (req, res) => {
    try {
      const sessionId = (req.body?.sessionId || '').trim() || 'bot_' + Date.now();
      await startSession(sessionId);
      res.json({ ok: true, sessionId: sessionId, status: getSessionStatus(sessionId) });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to start session' });
    }
  });

  app.post('/api/pair', async (req, res) => {
    try {
      const phone = (req.body?.phone || '').trim();
      let sessionId = (req.body?.sessionId || '').trim();

      if (!phone) return res.status(400).json({ error: 'Phone number required' });
      if (!sessionId) {
        sessionId = 'bot_' + phone.slice(-6) + '_' + Date.now().toString().slice(-4);
      }

      const code = await requestPairingCode(sessionId, phone);
      res.json({ code: code, sessionId: sessionId });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to generate pairing code' });
    }
  });

  app.post('/api/session/stop', async (req, res) => {
    const adminKey = process.env.ADMIN_SECRET || '';
    const provided = req.headers['x-admin-key'] || req.body?.adminKey || '';

    if (!adminKey || provided !== adminKey) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    try {
      const sessionId = (req.body?.sessionId || '').trim();
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
      await stopSession(sessionId);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ===== Settings OTP: send password to bot user's WhatsApp =====
  app.post('/api/settings/request-otp', async (req, res) => {
    try {
      const phone = normalizePhone(req.body?.phone);
      if (phone.length < 10 || phone.length > 15) {
        return res.status(400).json({ error: 'Valid phone number required (country code, no +)' });
      }

      const code = genCode();
      settingsOtp.set(phone, {
        code: code,
        expires: Date.now() + OTP_TTL_MS,
        verified: false,
      });

      const text =
        '🔐 *ZYIRA Settings Access*\n\n' +
        'Your password:\n' +
        '```' + code + '```\n\n' +
        'Enter this on the website Settings panel.\n' +
        '⏱ Valid for 5 minutes.\n\n' +
        '_Do not share this code._';

      await sendWhatsAppText(phone, text);
      logger.info('Settings OTP sent to ' + phone);
      res.json({ ok: true, message: 'Password sent to WhatsApp' });
    } catch (err) {
      logger.error('settings OTP failed', err);
      res.status(400).json({ error: err.message || 'Failed to send password' });
    }
  });

  app.post('/api/settings/verify-otp', (req, res) => {
    try {
      const phone = normalizePhone(req.body?.phone);
      const code = String(req.body?.code || '').trim();

      if (!phone || !code) {
        return res.status(400).json({ error: 'Phone and password required' });
      }

      const entry = settingsOtp.get(phone);
      if (!entry) {
        return res.status(400).json({ error: 'No password requested. Request again.' });
      }
      if (Date.now() > entry.expires) {
        settingsOtp.delete(phone);
        return res.status(400).json({ error: 'Password expired. Request a new one.' });
      }
      if (entry.code !== code) {
        return res.status(400).json({ error: 'Wrong password' });
      }

      entry.verified = true;
      entry.token = genCode() + genCode();
      entry.expires = Date.now() + 30 * 60 * 1000; // 30 min session
      settingsOtp.set(phone, entry);

      res.json({ ok: true, token: entry.token });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Verify failed' });
    }
  });

  app.post('/api/settings/check', (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const token = String(req.body?.token || '');
    const entry = settingsOtp.get(phone);
    const ok =
      entry &&
      entry.verified &&
      entry.token === token &&
      Date.now() < entry.expires;
    res.json({ ok: !!ok });
  });


  // Public: logo + name for website
  app.get('/api/settings', (req, res) => {
    const s = getSettings();
    res.json({
      botName: s.botName,
      logo: s.logo,
      menuStyle: s.menuStyle,
      statusSeen: !!s.statusSeen,
      antiDelete: !!s.antiDelete,
    });
  });

  // Save settings (requires verified OTP token)
  app.post('/api/settings/save', (req, res) => {
    try {
      const phone = String(req.body?.phone || '').replace(/[^0-9]/g, '');
      const token = String(req.body?.token || '');
      const entry = settingsOtp.get(phone);
      const ok =
        entry &&
        entry.verified &&
        entry.token === token &&
        Date.now() < entry.expires;
      if (!ok) {
        return res.status(403).json({ error: 'Not authorized. Login to Settings again.' });
      }

      const partial = {};
      if (req.body.logo !== undefined) partial.logo = String(req.body.logo || '').trim();
      if (req.body.botName !== undefined) partial.botName = String(req.body.botName || 'Zayra').trim();
      if (req.body.statusSeen !== undefined) partial.statusSeen = !!req.body.statusSeen;
      if (req.body.antiDelete !== undefined) partial.antiDelete = !!req.body.antiDelete;
      if (req.body.menuStyle !== undefined) partial.menuStyle = String(req.body.menuStyle || 'cyber');

      const saved = updateSettings(partial);
      logger.info('Bot settings updated by ' + phone);
      res.json({ ok: true, settings: saved });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Save failed' });
    }
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'website', 'index.html'));
  });

  const port = process.env.PORT || config.port || 3000;
  const host = config.host || '0.0.0.0';

  app.listen(port, host, () => {
    logger.success('Pairing website running on port ' + port);
  });

  return app;
}

module.exports = { startServer };
