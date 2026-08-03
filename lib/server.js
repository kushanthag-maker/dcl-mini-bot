const express = require('express');
const path = require('path');
const config = require('../config');
const logger = require('./logger');

function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'website')));

  // CORS simple for local
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  app.get('/api/status', (req, res) => {
    let status = { status: global.botStatus || 'starting' };
    if (typeof global.getBotStatus === 'function') {
      try {
        status = { ...status, ...global.getBotStatus() };
      } catch (e) {}
    }
    if (global.botError) status.error = global.botError;
    res.json(status);
  });

  app.post('/api/pair', async (req, res) => {
    try {
      const { phone } = req.body || {};
      if (!phone) return res.status(400).json({ error: 'Phone number required' });
      if (typeof global.requestPairing !== 'function') {
        return res.status(503).json({ error: 'Bot not ready yet' });
      }
      const code = await global.requestPairing(phone);
      res.json({ code });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to generate pairing code' });
    }
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'website', 'index.html'));
  });

  // Simple dashboard placeholders
  app.get('/dashboard', (req, res) => {
    res.send(`
      <html><body style="background:#0b0f19;color:#e2e8f0;font-family:sans-serif;padding:2rem;">
        <h1>DCL MINI Dashboard</h1>
        <p>Bot Status: <span id="s">...</span></p>
        <p><a href="/" style="color:#a5b4fc;">Go to Pairing</a></p>
        <script>
          fetch('/api/status').then(r=>r.json()).then(d=>{
            document.getElementById('s').textContent = d.status;
          });
        </script>
      </body></html>
    `);
  });

  // Heroku / Railway / Render inject PORT — always respect it
  const port = process.env.PORT || config.port || 3000;
  const host = config.host || '0.0.0.0';

  app.listen(port, host, () => {
    logger.success(`Pairing website running on port ${port}`);
  });

  return app;
}

module.exports = { startServer };
