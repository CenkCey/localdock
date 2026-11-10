const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const { sanitizeName, reserveFile } = require('./files');

const MAX_UPLOAD = 2 * 1024 * 1024 * 1024;
const ICON_RE = /^(app_[0-9a-f]{6,10}|OPEN_CMD|OPEN_CALC|OPEN_TASKMGR)\.png$/;

function createHttp(ctx) {
  const { hub, apps, platform } = ctx;
  const app = express();
  app.disable('x-powered-by');
  if (ctx.panel) app.use('/panel', ctx.panel);

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const guard = (req, res, next) => {
    if (hub.validKey(req.query.k)) {
      next();
      return;
    }
    res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  };

  app.get('/hello', (req, res) => {
    res.json({
      app: 'localdock',
      name: config.NAME,
      platform: config.DEV ? 'dev' : 'windows',
      version: config.VERSION,
      pinLength: config.PIN_LENGTH
    });
  });

  app.get('/icons/:file', guard, async (req, res) => {
    const match = ICON_RE.exec(req.params.file);
    if (!match) {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return;
    }
    await apps.ready();
    const file = match[1].startsWith('app_') ? await apps.iconFile(match[1]) : await apps.actionIconFile(match[1]);
    if (!file) {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return;
    }
    res.set('Cache-Control', 'private, max-age=86400');
    res.type('image/png');
    res.sendFile(path.resolve(file));
  });

  app.post('/upload', guard, async (req, res) => {
    const declared = Number(req.headers['content-length']);
    if (declared > MAX_UPLOAD) {
      res.set('Connection', 'close');
      res.status(413).json({ ok: false, error: 'TOO_LARGE' });
      return;
    }
    const name = sanitizeName(typeof req.query.name === 'string' ? req.query.name : '');
    let slot;
    try {
      slot = await reserveFile(path.join(platform.dirs.downloads, 'LocalDock'), name);
    } catch (e) {
      res.status(500).json({ ok: false, error: 'EXEC_FAILED' });
      return;
    }
    const out = fs.createWriteStream(slot.filePath);
    let size = 0;
    let failed = false;

    const fail = (status, error) => {
      if (failed) return;
      failed = true;
      req.unpipe(out);
      out.once('close', () => fs.rm(slot.filePath, { force: true }, () => {}));
      out.destroy();
      if (!res.headersSent) {
        res.set('Connection', 'close');
        res.status(status).json({ ok: false, error });
      }
    };

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD) fail(413, 'TOO_LARGE');
    });
    req.on('close', () => {
      if (!req.complete) fail(400, 'ABORTED');
    });
    req.on('error', () => fail(400, 'ABORTED'));
    out.on('error', () => fail(500, 'EXEC_FAILED'));
    out.on('finish', () => {
      if (!failed) res.json({ ok: true, file: slot.name });
    });
    req.pipe(out);
  });

  if (config.DEV) {
    app.get('/dev/log', guard, (req, res) => res.json(platform.log()));
    app.post('/dev/state', guard, (req, res) => {
      platform.setFake({ volume: Number(req.query.volume), brightness: Number(req.query.brightness) });
      res.json({ ok: true });
    });
    app.post('/dev/copy', guard, (req, res) => {
      platform.simulateCopy(typeof req.query.text === 'string' ? req.query.text : '');
      res.json({ ok: true });
    });
  }

  app.use((req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND' }));
  return app;
}

module.exports = { createHttp };
