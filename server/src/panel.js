const path = require('path');
const express = require('express');
const config = require('./config');
const { getLocalIPv4 } = require('./network');

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function createPanel({ hub, auth, pin, caps }) {
  const router = express.Router();

  router.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed =
      LOOPBACK.has(req.socket.remoteAddress) &&
      HOST_RE.test(req.headers.host || '') &&
      (!origin || ORIGIN_RE.test(origin));
    if (!allowed) {
      res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      return;
    }
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'panel.html'));
  });

  router.get('/api/state', (req, res) => {
    const ip = getLocalIPv4();
    res.json({
      ok: true,
      name: config.NAME,
      version: config.VERSION,
      address: ip ? `${ip}:${config.PORT}` : null,
      port: config.PORT,
      pin,
      devices: hub.list(),
      trusted: auth.trustedCount(),
      caps
    });
  });

  router.post('/api/revoke', (req, res) => {
    if (req.get('X-LocalDock-Panel') !== '1') {
      res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      return;
    }
    auth.revokeAll();
    hub.disconnectAll();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createPanel };
