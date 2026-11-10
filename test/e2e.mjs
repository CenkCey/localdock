import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDockClient } from '../client/src/dockClient.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3457;
const PIN = '246810';
const address = `127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localdock-e2e-'));

function startServer() {
  const child = spawn(process.execPath, [path.join(root, 'server', 'src', 'index.js')], {
    env: { ...process.env, LOCALDOCK_DEV: '1', LOCALDOCK_PIN: PIN, LOCALDOCK_DATA: dataDir, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  return new Promise((resolve) => {
    child.stdout.on('data', (d) => String(d).includes('PIN') && resolve(child));
  });
}

function track() {
  const log = { statuses: [], waiters: [] };
  const client = createDockClient({
    onStatus: (s) => {
      log.statuses.push(s);
      log.waiters = log.waiters.filter((w) => !w(s));
    }
  });
  const until = (pred, ms = 5000) =>
    new Promise((resolve, reject) => {
      const hit = log.statuses.find(pred);
      if (hit) return resolve(hit);
      const timer = setTimeout(() => reject(new Error('timeout waiting for status')), ms);
      log.waiters.push((s) => (pred(s) ? (clearTimeout(timer), resolve(s), true) : false));
    });
  return { client, log, until };
}

function waitPush(client, event) {
  return new Promise((resolve) => {
    const off = client.on(event, (payload) => {
      off();
      resolve(payload);
    });
  });
}

let server = await startServer();
let exitCode = 0;

try {
  const hello = await fetch(`http://${address}/hello`).then((r) => r.json());
  assert.strictEqual(hello.app, 'localdock');
  assert.strictEqual(hello.pinLength, 6);

  const a = track();
  a.client.connect(address);
  const pinState = await a.until((s) => s.status === 'pin');
  assert.strictEqual(pinState.pinLength, 6);
  assert.strictEqual(pinState.attemptsLeft, 5);

  assert.strictEqual(a.client.submitPin('000000'), true);
  const bad = await a.until((s) => s.status === 'pin' && s.error === 'BAD_PIN');
  assert.strictEqual(bad.attemptsLeft, 4);

  const statePush = new Promise((resolve) => {
    const t = setInterval(() => {
      const st = a.client.last('STATE');
      if (st) (clearInterval(t), resolve(st));
    }, 20);
  });
  a.client.submitPin(PIN);
  const ready = await a.until((s) => s.status === 'ready');
  assert.ok(ready.token && ready.token.length === 64);
  assert.ok(ready.actions.includes('SLEEP_PC') && ready.actions.includes('OPEN_CMD'));
  assert.strictEqual(ready.caps.apps, true);
  const st = await statePush;
  assert.ok(typeof st.volume === 'number');
  assert.ok(st.media && st.media.title);

  const vol = await a.client.request('SET_VOLUME', { value: 33 });
  assert.strictEqual(vol.ok, true);
  assert.strictEqual(a.client.last('STATE').volume, 33);
  assert.strictEqual((await a.client.request('SET_VOLUME', { value: 500 })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.client.exec('VOLUME_UP', { steps: 3 })).ok, true);
  assert.strictEqual((await a.client.exec('format c:')).error, 'UNKNOWN_ACTION');

  await a.client.request('LAYOUT_GET');
  const layout = a.client.last('LAYOUT').layout;
  assert.ok(layout.pages.length >= 1);

  await a.client.request('APPS_GET', { refresh: false });
  const apps = a.client.last('APPS').apps;
  assert.ok(apps.length >= 12);

  const icon = await fetch(`${a.client.httpBase()}/icons/${apps[0].id}.png?k=${a.client.httpKey()}`);
  assert.strictEqual(icon.status, 200);
  assert.strictEqual((await fetch(`${a.client.httpBase()}/icons/${apps[0].id}.png?k=nope`)).status, 401);

  const launch = await a.client.request('LAUNCH', { kind: 'app', ref: apps[0].id });
  assert.strictEqual(launch.ok, true);

  const b = track();
  b.client.connect(address, ready.token);
  const b2 = await b.until((s) => s.status === 'ready');
  assert.ok(b2.caps.input);

  const pushed = waitPush(b.client, 'LAYOUT');
  const next = {
    version: 1,
    pages: [
      ...layout.pages,
      { id: 'p_new', tiles: [{ id: 't_app', kind: 'app', ref: apps[1].id, label: apps[1].name }] }
    ]
  };
  assert.strictEqual((await a.client.request('LAYOUT_SET', { layout: next })).ok, true);
  const broadcast = await pushed;
  assert.strictEqual(broadcast.layout.pages.length, layout.pages.length + 1);
  const badLayout = { version: 1, pages: [{ id: 'p', tiles: [{ id: 't', kind: 'app', ref: 'app_unknown', label: null }] }] };
  assert.strictEqual((await a.client.request('LAYOUT_SET', { layout: badLayout })).error, 'BAD_PARAMS');

  assert.strictEqual(b.client.sendInput({ type: 'move', dx: 5, dy: 5 }), true);
  assert.strictEqual(b.client.sendInput({ type: 'text', text: 'hello' }), true);

  const clip = await a.client.request('CLIPBOARD_SEND', { text: 'from phone', paste: true });
  assert.strictEqual(clip.ok, true);
  await a.client.request('CLIPBOARD_GET');
  assert.ok(a.client.last('CLIPBOARD').items.some((i) => i.text === 'from phone'));

  const shot = await a.client.request('CAPTURE_SCREENSHOT');
  assert.ok(shot.ok && shot.file && shot.thumb.startsWith('data:image/'));

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const sig = await a.client.request('SIGNATURE_SEND', { png: png.toString('base64'), insert: false });
  assert.ok(sig.ok && sig.file);

  const up = await fetch(`${a.client.httpBase()}/upload?k=${a.client.httpKey()}&name=${encodeURIComponent('photo 1.jpg')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('abc')
  }).then((r) => r.json());
  assert.deepStrictEqual(up, { ok: true, file: 'photo 1.jpg' });

  a.client.disconnect();
  b.client.disconnect();

  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  server = await startServer();

  const c = track();
  c.client.connect(address, ready.token);
  await c.until((s) => s.status === 'ready');
  await c.client.request('LAYOUT_GET');
  assert.strictEqual(c.client.last('LAYOUT').layout.pages.length, layout.pages.length + 1);
  c.client.disconnect();

  const d = track();
  d.client.connect(address, 'f'.repeat(64));
  const fallback = await d.until((s) => s.status === 'pin' && s.badToken);
  assert.ok(fallback.badToken);
  d.client.disconnect();

  const e = track();
  e.client.connect(address);
  await e.until((s) => s.status === 'pin');
  for (let i = 0; i < 5; i += 1) {
    e.client.submitPin('111111');
    if (i < 4) await e.until((s) => s.status === 'pin' && s.attemptsLeft === 4 - i);
  }
  const blocked = await e.until((s) => s.status === 'error');
  assert.strictEqual(blocked.error, 'TOO_MANY_ATTEMPTS');

  const f = track();
  f.client.connect('127.0.0.1:1');
  assert.strictEqual((await f.until((s) => s.status === 'error')).error, 'UNREACHABLE');

  console.log('e2e client<->server v2 passed');
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
  setTimeout(() => process.exit(exitCode), 150);
}
