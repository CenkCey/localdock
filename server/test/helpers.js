const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const SERVER = path.join(__dirname, '..', 'src', 'index.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer({ port, pin, dataDir, env = {} }) {
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      LOCALDOCK_DEV: '1',
      LOCALDOCK_PIN: pin,
      LOCALDOCK_DATA: dataDir,
      PORT: String(port),
      ...env
    },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  let banner = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 10000);
    child.stdout.on('data', (d) => {
      banner += d;
      if (banner.includes('PIN')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', () => reject(new Error('server exited early')));
  });
  return {
    banner,
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const done = new Promise((r) => child.once('exit', r));
      child.kill();
      await done;
    }
  };
}

function connect(url) {
  const socket = io(url, { transports: ['websocket'], reconnection: false, forceNew: true });
  const log = [];
  let counter = 0;
  socket.onAny((ev, payload) => log.push({ ev, payload, used: false }));

  const api = {
    socket,
    log,
    take(ev, pred = () => true, ms = 3000) {
      return new Promise((resolve, reject) => {
        const find = () => log.find((e) => !e.used && e.ev === ev && pred(e.payload));
        const hit = find();
        if (hit) {
          hit.used = true;
          resolve(hit.payload);
          return;
        }
        const watcher = () => {
          const e = find();
          if (!e) return;
          e.used = true;
          cleanup();
          resolve(e.payload);
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(`timeout waiting for ${ev}`));
        }, ms);
        const cleanup = () => {
          clearTimeout(timer);
          socket.offAny(watcher);
        };
        socket.onAny(watcher);
      });
    },
    drain(ev) {
      for (const e of log) if (e.ev === ev) e.used = true;
    },
    async none(ev, ms = 300, pred = () => true) {
      await sleep(ms);
      const hit = log.find((e) => !e.used && e.ev === ev && pred(e.payload));
      if (hit) throw new Error(`unexpected ${ev}: ${JSON.stringify(hit.payload).slice(0, 200)}`);
    },
    async cmd(event, payload = {}) {
      counter += 1;
      const id = `c${counter}`;
      socket.emit(event, { id, ...payload });
      return api.take('EXEC_RESULT', (r) => r.id === id);
    },
    async auth(payload) {
      socket.emit('AUTH', payload);
      return api.take('AUTH_RESULT');
    },
    async login(pin) {
      await api.take('PIN_REQ');
      return api.auth({ pin });
    },
    close() {
      socket.close();
    }
  };
  return api;
}

async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor timeout');
    await sleep(25);
  }
}

module.exports = { startServer, connect, sleep, waitFor };
