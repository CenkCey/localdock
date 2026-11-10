import assert from 'node:assert';
import { createDockClient } from '../src/dockClient.js';
import { startFakeServer } from './fakeServer.mjs';

const server = await startFakeServer({ port: 0 });
const address = `127.0.0.1:${server.port}`;

function harness() {
  const states = [];
  const waiters = [];
  const client = createDockClient({
    onStatus: (s) => {
      states.push(s);
      waiters.splice(0).forEach((w) => w());
    }
  });
  function until(predicate, ms = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout; saw ${states.map((s) => s.status + ':' + (s.error || '')).join(',')}`)), ms);
      const check = () => {
        const hit = states.find(predicate);
        if (hit) {
          clearTimeout(timer);
          resolve(hit);
        } else waiters.push(check);
      };
      check();
    });
  }
  return { client, states, until };
}

const a = harness();
a.client.connect(address, null);
const pin = await a.until((s) => s.status === 'pin');
assert.strictEqual(pin.pinLength, 6);
assert.strictEqual(a.client.submitPin('1234'), false);
assert.strictEqual(a.client.submitPin('123456'), true);
const ready = await a.until((s) => s.status === 'ready');
assert.ok(ready.token && ready.token.length === 64);
assert.ok(ready.httpKey);
assert.strictEqual(ready.caps.volume, true);
assert.ok(ready.actions.includes('SLEEP_PC'));
assert.strictEqual(a.client.httpBase(), `http://${address}`);

const state = await new Promise((resolve) => {
  const got = a.client.last('STATE');
  if (got) resolve(got);
  else a.client.on('STATE', resolve);
});
assert.strictEqual(state.volume, 40);
assert.strictEqual(state.media.title, 'Golden Hour Drive');

const layoutPromise = new Promise((resolve) => a.client.on('LAYOUT', resolve));
const got = await a.client.request('LAYOUT_GET');
assert.strictEqual(got.ok, true);
const pushed = await layoutPromise;
assert.strictEqual(pushed.layout.pages.length, 2);

const bad = await a.client.exec('NOT_A_THING');
assert.strictEqual(bad.ok, false);
assert.strictEqual(bad.error, 'UNKNOWN_ACTION');
const failing = await a.client.exec('OPEN_TASKMGR');
assert.strictEqual(failing.error, 'EXEC_FAILED');
const shot = await a.client.request('CAPTURE_SCREENSHOT', {});
assert.ok(shot.ok && shot.file && shot.thumb.startsWith('data:image'));
const [r1, r2] = await Promise.all([a.client.exec('OPEN_CALC'), a.client.exec('SHOW_DESKTOP')]);
assert.ok(r1.ok && r2.ok && r1.id !== r2.id);

const volumeState = new Promise((resolve) => a.client.on('STATE', (s) => s.volume === 55 && resolve(s)));
await a.client.request('SET_VOLUME', { value: 55 });
assert.strictEqual((await volumeState).volume, 55);

assert.strictEqual(a.client.sendInput({ type: 'move', dx: 1, dy: 1 }), true);
const icon = await fetch(`http://${address}/icons/${server.getLayout().pages[0].tiles[1].ref}.png?k=${a.client.httpKey()}`);
assert.strictEqual(icon.status, 200);
assert.strictEqual((await fetch(`http://${address}/icons/x.png?k=wrong`)).status, 401);
const key = a.client.httpKey();
a.client.disconnect();

const b = harness();
b.client.connect(address, ready.token);
const viaToken = await b.until((s) => s.status === 'ready');
assert.ok(!b.states.some((s) => s.status === 'pin'));
assert.strictEqual(viaToken.token, null);
assert.notStrictEqual(viaToken.httpKey, key);
assert.strictEqual((await fetch(`http://${address}/icons/x.png?k=${key}`)).status, 401);
b.client.disconnect();

const c = harness();
c.client.connect(address, 'deadbeef');
const fallback = await c.until((s) => s.status === 'pin');
assert.strictEqual(fallback.badToken, true);
assert.ok(c.states.some((s) => s.badToken));
c.client.submitPin('123456');
await c.until((s) => s.status === 'ready');
c.client.disconnect();

const d = harness();
d.client.connect(address, null);
await d.until((s) => s.status === 'pin');
const early = await d.client.request('LAYOUT_GET');
assert.deepStrictEqual([early.ok, early.error], [false, 'NOT_CONNECTED']);
assert.strictEqual(d.client.sendInput({ type: 'move', dx: 1, dy: 1 }), false);
d.client.disconnect();

const e = harness();
e.client.connect(address, ready.token);
await e.until((s) => s.status === 'ready');
const timed = await e.client.request('NO_SUCH_EVENT', {}, 150);
assert.deepStrictEqual([timed.ok, timed.error], [false, 'TIMEOUT']);
const inflight = e.client.request('NO_SUCH_EVENT', {}, 5000);
e.client.disconnect();
assert.strictEqual((await inflight).error, 'DISCONNECTED');

const f = harness();
f.client.connect('127.0.0.1:1', null);
assert.strictEqual((await f.until((s) => s.status === 'error')).error, 'UNREACHABLE');
f.client.connect('not valid', null);
assert.strictEqual((await f.until((s) => s.error === 'INVALID_ADDRESS')).status, 'error');

await server.close();
console.log('client tests passed');
