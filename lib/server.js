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
} = require('./sessionManager');

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
    const sessions = getAllSessions().map((s) => ({
      sessionId: s.sessionId,
      status: s.status,
      user: s.user,
      startedAt: s.startedAt,
      error: s.error,
    }));
    res.json({
      onlineCount: getOnlineCount(),
      totalSessions: sessions.length,
      sessions,
    });
  });

  app.get('/api/session/:id', (req, res) => {
    res.json(getSessionStatus(req.params.id));
  });

  app.post('/api/session/start', async (req, res) => {
    try {
      const sessionId = (req.body?.sessionId || '').trim() || `bot_${Date.now()}`;
      await startSession(sessionId);
      res.json({ ok: true, sessionId, status: getSessionStatus(sessionId) });
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
        sessionId = `bot_\( {phone.slice(-6)}_ \){Date.now().toString().slice(-4)}`;
      }

      const code = await requestPairingCode(sessionId, phone);
      res.json({ code, sessionId });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to generate pairing code' });
    }
  });

  // Stop — only if ADMIN_SECRET matches
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

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'website', 'index.html'));
  });

  const port = process.env.PORT || config.port || 3000;
  const host = config.host || '0.0.0.0';

  app.listen(port, host, () => {
    logger.success(`Pairing website running on port ${port}`);
  });

  return app;
}

module.exports = { startServer };
