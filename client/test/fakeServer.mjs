import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';

const ACTIONS = [
  'OPEN_CMD',
  'OPEN_CALC',
  'OPEN_TASKMGR',
  'SHOW_DESKTOP',
  'LOCK_PC',
  'SLEEP_PC',
  'VOLUME_UP',
  'VOLUME_DOWN',
  'VOLUME_MUTE',
  'MEDIA_PLAY_PAUSE',
  'MEDIA_NEXT',
  'MEDIA_PREV'
];

const APP_NAMES = [
  'Visual Studio Code',
  'Google Chrome',
  'Spotify',
  'Discord',
  'Notepad',
  'Steam',
  'OBS Studio',
  'Paint',
  'Slack',
  'Firefox',
  'Photoshop',
  'Excel'
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function makePng(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function hue(h) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (0.65 - 0.35 * Math.max(Math.min(k, 4 - k, 1), 0)));
  };
  return [f(5), f(3), f(1)];
}

function iconPng(seed) {
  const base = hue(seed % 360);
  const accent = hue((seed + 140) % 360);
  return makePng(64, 64, (x, y) => {
    const dx = x - 32;
    const dy = y - 32;
    const inside = Math.abs(dx) < 28 && Math.abs(dy) < 28 && Math.hypot(Math.max(Math.abs(dx) - 18, 0), Math.max(Math.abs(dy) - 18, 0)) < 10;
    if (!inside) return [0, 0, 0, 0];
    if (Math.hypot(dx, dy) < 13) return [...accent, 255];
    const t = (x + y) / 128;
    return [Math.round(base[0] * (1.15 - t * 0.5)), Math.round(base[1] * (1.15 - t * 0.5)), Math.round(base[2] * (1.15 - t * 0.5)), 255];
  });
}

function pngDataUrl(width, height, seed) {
  const a = hue(seed % 360);
  const b = hue((seed + 90) % 360);
  const png = makePng(width, height, (x, y) => {
    const t = (x / width + y / height) / 2;
    return [Math.round(a[0] * (1 - t) + b[0] * t), Math.round(a[1] * (1 - t) + b[1] * t), Math.round(a[2] * (1 - t) + b[2] * t), 255];
  });
  return `data:image/png;base64,${png.toString('base64')}`;
}

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export async function startFakeServer({ port = 3000, pin = '123456', name = 'STUDIO-PC' } = {}) {
  const apps = APP_NAMES.map((n) => ({ id: `app_${hash(n).toString(16).slice(0, 6)}`, name: n })).sort((a, b) => a.name.localeCompare(b.name));
  const tokens = new Set();
  const keys = new Set();
  const log = { events: [], uploads: [], inputs: 0 };
  let clipboard = [
    { id: 'cb_1', text: 'Shopping list: milk, eggs, coffee', at: Date.now() - 60000 },
    { id: 'cb_2', text: 'https://example.com/docs/getting-started', at: Date.now() - 600000 },
    { id: 'cb_3', text: 'Meeting notes from Monday', at: Date.now() - 3600000 }
  ];
  const state = {
    volume: 40,
    muted: false,
    brightness: 70,
    media: { status: 'playing', title: 'Golden Hour Drive', artist: 'The Sample Tapes', thumb: pngDataUrl(48, 48, 200) }
  };
  const tile = (id, kind, ref, label = null) => ({ id, kind, ref, label });
  let layout = {
    version: 1,
    pages: [
      {
        id: 'p1',
        tiles: [
          tile('t1', 'action', 'OPEN_CMD'),
          tile('t2', 'app', apps[0].id, apps[0].name),
          tile('t3', 'folder', 'C:\\Users\\me\\Documents', 'Documents'),
          tile('t4', 'url', 'https://example.com', 'Example'),
          tile('t5', 'action', 'VOLUME_UP'),
          tile('t6', 'action', 'VOLUME_DOWN'),
          tile('t7', 'app', apps[1].id, apps[1].name),
          tile('t8', 'action', 'OPEN_TASKMGR')
        ]
      },
      {
        id: 'p2',
        tiles: [
          tile('t9', 'action', 'OPEN_CALC'),
          tile('t10', 'action', 'SHOW_DESKTOP'),
          tile('t11', 'action', 'LOCK_PC'),
          tile('t12', 'action', 'MEDIA_PREV'),
          tile('t13', 'action', 'MEDIA_PLAY_PAUSE'),
          tile('t14', 'action', 'MEDIA_NEXT')
        ]
      }
    ]
  };

  const app = express();
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.get('/hello', (req, res) => {
    res.json({ app: 'localdock', name, platform: 'windows', version: '2.0.0', pinLength: pin.length });
  });
  app.get('/__log', (req, res) => res.json(log));
  app.post('/__reset', (req, res) => {
    log.events.length = 0;
    log.uploads.length = 0;
    log.inputs = 0;
    res.json({ ok: true });
  });
  app.get('/icons/:file', (req, res) => {
    if (!keys.has(req.query.k)) {
      res.status(401).end();
      return;
    }
    const id = req.params.file.replace(/\.png$/, '');
    if (!apps.some((a) => a.id === id)) {
      res.status(404).end();
      return;
    }
    res.set('Content-Type', 'image/png');
    res.send(iconPng(hash(id)));
  });
  app.post('/upload', (req, res) => {
    if (!keys.has(req.query.k)) {
      req.resume();
      res.status(401).json({ ok: false });
      return;
    }
    const fileName = String(req.query.name || 'file');
    if (fileName.startsWith('huge')) {
      req.resume();
      res.status(413).json({ ok: false });
      return;
    }
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
    });
    req.on('end', () => {
      log.uploads.push({ name: fileName, size });
      res.json({ ok: true, file: fileName });
    });
  });

  const server = http.createServer(app);
  const io = new Server(server, { transports: ['websocket'], cors: { origin: '*' }, maxHttpBufferSize: 8e6 });

  function pushState() {
    io.sockets.sockets.forEach((s) => {
      if (s.data.authed) s.emit('STATE', state);
    });
  }

  function pushClipboard() {
    io.sockets.sockets.forEach((s) => {
      if (s.data.authed) s.emit('CLIPBOARD', { items: clipboard });
    });
  }

  io.on('connection', (socket) => {
    socket.data.authed = false;
    socket.data.key = crypto.randomBytes(16).toString('hex');
    socket.emit('PIN_REQ', { pinLength: pin.length, attemptsLeft: 5, name });

    socket.on('disconnect', () => keys.delete(socket.data.key));

    socket.on('AUTH', (payload) => {
      log.events.push({ event: 'AUTH', payload });
      const ok = (token) => {
        socket.data.authed = true;
        keys.add(socket.data.key);
        const result = {
          ok: true,
          name,
          httpKey: socket.data.key,
          actions: ACTIONS,
          caps: { volume: true, brightness: true, media: true, input: true, clipboard: true, capture: true, upload: true, apps: true }
        };
        if (token) result.token = token;
        socket.emit('AUTH_RESULT', result);
        socket.emit('STATE', state);
      };
      if (payload && payload.token) {
        if (tokens.has(payload.token)) {
          ok(null);
        } else {
          socket.emit('AUTH_RESULT', { ok: false, error: 'BAD_TOKEN' });
          socket.emit('PIN_REQ', { pinLength: pin.length, attemptsLeft: 5, name });
        }
        return;
      }
      if (payload && payload.pin === pin) {
        const token = crypto.randomBytes(32).toString('hex');
        tokens.add(token);
        ok(token);
        return;
      }
      socket.emit('AUTH_RESULT', { ok: false, error: 'BAD_PIN', attemptsLeft: 4 });
    });

    function handle(event, fn) {
      socket.on(event, (payload) => {
        if (!socket.data.authed) {
          if (payload && payload.id) socket.emit('EXEC_RESULT', { id: payload.id, ok: false, error: 'UNAUTHORIZED' });
          return;
        }
        if (event !== 'INPUT') log.events.push({ event, payload });
        const reply = (extra = {}) => payload && payload.id && socket.emit('EXEC_RESULT', { id: payload.id, ok: true, ...extra });
        const fail = (error) => payload && payload.id && socket.emit('EXEC_RESULT', { id: payload.id, ok: false, error });
        fn(payload || {}, reply, fail);
      });
    }

    handle('INPUT', () => {
      log.inputs += 1;
    });
    handle('STATE_GET', (p, reply) => {
      socket.emit('STATE', state);
      reply();
    });
    handle('LAYOUT_GET', (p, reply) => {
      socket.emit('LAYOUT', { layout });
      reply();
    });
    handle('LAYOUT_SET', (p, reply, fail) => {
      const next = p.layout;
      if (!next || !Array.isArray(next.pages) || next.pages.length < 1 || next.pages.length > 12) {
        fail('BAD_PARAMS');
        return;
      }
      for (const page of next.pages) {
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(page.id) || page.tiles.length > 64) {
          fail('BAD_PARAMS');
          return;
        }
        for (const t of page.tiles) {
          if (!/^[A-Za-z0-9_-]{1,40}$/.test(t.id) || (t.kind === 'app' && !apps.some((a) => a.id === t.ref)) || (t.kind === 'action' && !ACTIONS.includes(t.ref))) {
            fail('BAD_PARAMS');
            return;
          }
          if (t.kind === 'url' && !/^https?:\/\//.test(t.ref)) {
            fail('BAD_PARAMS');
            return;
          }
        }
      }
      layout = next;
      socket.broadcast.emit('LAYOUT', { layout });
      reply();
    });
    handle('APPS_GET', (p, reply) => {
      socket.emit('APPS', { apps });
      reply();
    });
    handle('LAUNCH', (p, reply, fail) => {
      if (p.kind === 'folder' && /nope/i.test(p.ref)) fail('NOT_FOUND');
      else reply();
    });
    handle('EXEC_CMD', (p, reply, fail) => {
      if (!ACTIONS.includes(p.action)) {
        fail('UNKNOWN_ACTION');
        return;
      }
      if (p.action === 'OPEN_TASKMGR') {
        fail('EXEC_FAILED');
        return;
      }
      if (p.action === 'VOLUME_MUTE') {
        state.muted = !state.muted;
        pushState();
      }
      if (p.action === 'VOLUME_UP' || p.action === 'VOLUME_DOWN') {
        const steps = (p.params && p.params.steps) || 5;
        state.volume = Math.max(0, Math.min(100, state.volume + (p.action === 'VOLUME_UP' ? 2 : -2) * steps));
        pushState();
      }
      if (p.action === 'MEDIA_PLAY_PAUSE' && state.media) {
        state.media = { ...state.media, status: state.media.status === 'playing' ? 'paused' : 'playing' };
        pushState();
      }
      setTimeout(() => reply(), p.action === 'OPEN_CALC' ? 350 : 40);
    });
    handle('SET_VOLUME', (p, reply) => {
      state.volume = p.value;
      state.muted = false;
      pushState();
      reply();
    });
    handle('SET_BRIGHTNESS', (p, reply) => {
      state.brightness = p.value;
      pushState();
      reply();
    });
    handle('CLIPBOARD_GET', (p, reply) => {
      socket.emit('CLIPBOARD', { items: clipboard });
      reply();
    });
    handle('CLIPBOARD_PASTE', (p, reply, fail) => {
      if (clipboard.some((c) => c.id === p.itemId)) reply();
      else fail('NOT_FOUND');
    });
    handle('CLIPBOARD_SEND', (p, reply, fail) => {
      if (typeof p.text !== 'string' || p.text.length > 10000) {
        fail('TOO_LARGE');
        return;
      }
      clipboard = [{ id: `cb_${Date.now()}`, text: p.text, at: Date.now() }, ...clipboard].slice(0, 10);
      pushClipboard();
      reply();
    });
    handle('CAPTURE_SCREENSHOT', (p, reply) => {
      setTimeout(() => reply({ file: 'screenshot-20261110-021500.png', thumb: pngDataUrl(160, 100, 300) }), 300);
    });
    handle('SIGNATURE_SEND', (p, reply, fail) => {
      if (typeof p.png !== 'string' || !p.png) {
        fail('BAD_PARAMS');
        return;
      }
      reply({ file: 'signature-20261110-021600.png' });
    });
  });

  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  return {
    port: server.address().port,
    pin,
    tokens,
    log,
    state,
    getLayout: () => layout,
    close: () =>
      new Promise((resolve) => {
        io.close(() => resolve());
        server.closeAllConnections();
      })
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  startFakeServer({ port }).then((s) => {
    console.log(`fake LocalDock server on ${s.port}, PIN ${s.pin}`);
  });
}
