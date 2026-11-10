const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { startServer, connect, sleep, waitFor } = require('./helpers');
const { ACTION_NAMES } = require('../src/actions');
const { solidPng } = require('../src/platform/png');

const PORT = 3456;
const PIN = '123456';
const PIN2 = '654321';
const URL = `http://127.0.0.1:${PORT}`;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function get(pathname, key) {
  const q = key === undefined ? '' : `${pathname.includes('?') ? '&' : '?'}k=${key}`;
  return fetch(`${URL}${pathname}${q}`);
}

async function post(pathname, key, body, extra = '') {
  return fetch(`${URL}${pathname}?k=${key}${extra}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body
  });
}

function devLog(key) {
  return get('/dev/log', key).then((r) => r.json());
}

async function testHello() {
  const res = await get('/hello');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
  const body = await res.json();
  assert.strictEqual(body.app, 'localdock');
  assert.strictEqual(body.version, '2.0.0');
  assert.strictEqual(body.pinLength, 6);
  assert.strictEqual(typeof body.name, 'string');
  assert.ok(body.platform);
}

function rawGet(pathname, headers, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function testPanel(ctx) {
  const page = await rawGet('/panel/', { Host: `localhost:${PORT}` });
  assert.strictEqual(page.status, 200);
  assert.ok(page.body.includes('LocalDock'));
  assert.strictEqual(page.headers['access-control-allow-origin'], undefined);

  const st = await rawGet('/panel/api/state', { Host: `127.0.0.1:${PORT}` });
  assert.strictEqual(st.status, 200);
  const data = JSON.parse(st.body);
  assert.strictEqual(data.pin, PIN);
  assert.ok(Array.isArray(data.devices));
  assert.ok(data.devices.length >= 1);
  assert.strictEqual(typeof data.trusted, 'number');

  const foreignHost = await rawGet('/panel/api/state', { Host: `192.168.1.50:${PORT}` });
  assert.strictEqual(foreignHost.status, 403);
  const foreignOrigin = await rawGet('/panel/api/state', { Host: `localhost:${PORT}`, Origin: 'http://evil.example' });
  assert.strictEqual(foreignOrigin.status, 403);
  const noHeader = await rawGet('/panel/api/revoke', { Host: `localhost:${PORT}` }, 'POST');
  assert.strictEqual(noHeader.status, 403);
  const preflight = await rawGet('/panel/api/revoke', { Host: `localhost:${PORT}`, Origin: 'http://evil.example' }, 'OPTIONS');
  assert.strictEqual(preflight.status, 403);
}

async function testAuth(ctx) {
  const a = connect(URL);
  ctx.a = a;
  const pinReq = await a.take('PIN_REQ');
  assert.strictEqual(pinReq.pinLength, 6);
  assert.strictEqual(pinReq.attemptsLeft, 5);
  assert.strictEqual(typeof pinReq.name, 'string');

  a.socket.emit('EXEC_CMD', { id: 'x1', action: 'OPEN_CALC' });
  const unauth = await a.take('EXEC_RESULT');
  assert.deepStrictEqual(unauth, { id: 'x1', ok: false, error: 'UNAUTHORIZED' });
  for (const ev of ['LAYOUT_GET', 'APPS_GET', 'STATE_GET', 'CLIPBOARD_GET', 'SET_VOLUME', 'LAUNCH', 'CAPTURE_SCREENSHOT']) {
    a.socket.emit(ev, { id: 'u1' });
    assert.strictEqual((await a.take('EXEC_RESULT')).error, 'UNAUTHORIZED', ev);
  }
  a.socket.emit('EXEC_CMD', { action: 'OPEN_CALC' });
  a.socket.emit('INPUT', { type: 'move', dx: 5, dy: 5 });
  await a.none('EXEC_RESULT', 200);
  await a.none('STATE', 10);

  assert.deepStrictEqual(
    [(await a.auth({ pin: '000000' })).attemptsLeft, 'BAD_PIN'],
    [4, 'BAD_PIN']
  );
  const bad4 = await a.auth({ pin: '4321' });
  assert.deepStrictEqual([bad4.ok, bad4.error, bad4.attemptsLeft], [false, 'BAD_PIN', 3]);
  const badType = await a.auth({ pin: 123456 });
  assert.strictEqual(badType.error, 'BAD_PAYLOAD');
  const badEmpty = await a.auth({});
  assert.strictEqual(badEmpty.error, 'BAD_PAYLOAD');

  const good = await a.auth({ pin: PIN });
  assert.strictEqual(good.ok, true);
  assert.match(good.token, /^[0-9a-f]{64}$/);
  assert.match(good.httpKey, /^[0-9a-f]{32}$/);
  assert.deepStrictEqual(good.actions, ACTION_NAMES);
  assert.deepStrictEqual(good.caps, {
    volume: true, brightness: true, media: true, input: true, clipboard: true, capture: true, upload: true, apps: true
  });
  assert.strictEqual(typeof good.name, 'string');
  ctx.token = good.token;
  ctx.key = good.httpKey;

  const state = await a.take('STATE');
  assert.strictEqual(state.volume, 30);
  assert.strictEqual(state.muted, false);
  assert.strictEqual(state.brightness, 70);
  assert.strictEqual(state.media.status, 'playing');
  assert.strictEqual(state.media.title, 'Golden Hour Drive');
  assert.ok(state.media.thumb.startsWith('data:image/jpeg;base64,'));

  const trusted = fs.readFileSync(path.join(ctx.dataDir, 'trusted.json'), 'utf8');
  assert.ok(!trusted.includes(good.token));
  assert.ok(trusted.includes(crypto.createHash('sha256').update(good.token).digest('hex')));

  const b = connect(URL);
  ctx.b = b;
  b.socket.emit('AUTH', { token: ctx.token });
  const viaToken = await b.take('AUTH_RESULT');
  assert.strictEqual(viaToken.ok, true);
  assert.strictEqual(viaToken.token, undefined);
  assert.match(viaToken.httpKey, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(viaToken.httpKey, ctx.key);
  ctx.keyB = viaToken.httpKey;
  await b.take('STATE');

  const d = connect(URL);
  await d.take('PIN_REQ');
  const closed = new Promise((r) => d.socket.once('disconnect', r));
  let last;
  for (let i = 0; i < 5; i += 1) last = await d.auth({ pin: '111111' });
  assert.deepStrictEqual([last.ok, last.error, last.attemptsLeft], [false, 'TOO_MANY_ATTEMPTS', 0]);
  await closed;
}

async function testExec(ctx) {
  const { a } = ctx;
  const s0 = await a.cmd('STATE_GET');
  assert.deepStrictEqual(s0, { id: s0.id, ok: true });
  assert.strictEqual((await a.take('STATE')).volume, 30);

  for (const action of ACTION_NAMES) {
    const r = await a.cmd('EXEC_CMD', { action });
    assert.strictEqual(r.ok, true, action);
  }
  let log = await devLog(ctx.key);
  assert.deepStrictEqual(log.actions.map((x) => x.name), ACTION_NAMES);
  assert.strictEqual(log.actions.find((x) => x.name === 'VOLUME_UP').steps, 5);

  const up = await a.cmd('EXEC_CMD', { action: 'VOLUME_UP', params: { steps: 3 } });
  assert.strictEqual(up.ok, true);
  const afterUp = await waitFor(async () => {
    await a.cmd('STATE_GET');
    const st = await a.take('STATE');
    return st.volume === 36 ? st : null;
  });
  assert.strictEqual(afterUp.muted, true);

  const bad = [
    { action: 'VOLUME_UP', params: { steps: 99 } },
    { action: 'VOLUME_UP', params: { steps: 0 } },
    { action: 'VOLUME_UP', params: { steps: '5' } },
    { action: 'VOLUME_DOWN', params: { steps: 1.5 } },
    { action: 'OPEN_CMD', params: null },
    { action: 'OPEN_CMD', params: [] },
    { action: 5 },
    {}
  ];
  for (const p of bad) assert.strictEqual((await a.cmd('EXEC_CMD', p)).error, 'BAD_PARAMS', JSON.stringify(p));
  for (const action of ['format c:', '__proto__', 'constructor', 'toString', 'open_cmd', 'OPEN_CMD && calc']) {
    assert.strictEqual((await a.cmd('EXEC_CMD', { action })).error, 'UNKNOWN_ACTION', action);
  }
  a.socket.emit('EXEC_CMD', { id: 'bad id!', action: 'OPEN_CALC' });
  assert.deepStrictEqual(await a.take('EXEC_RESULT'), { id: null, ok: false, error: 'BAD_PARAMS' });
  a.socket.emit('EXEC_CMD', { id: 'x'.repeat(41), action: 'OPEN_CALC' });
  assert.strictEqual((await a.take('EXEC_RESULT')).error, 'BAD_PARAMS');
  a.socket.emit('EXEC_CMD', 'garbage');
  assert.strictEqual((await a.take('EXEC_RESULT')).error, 'BAD_PARAMS');

  a.socket.emit('EXEC_CMD', { id: 'r1', action: 'OPEN_CALC' });
  a.socket.emit('EXEC_CMD', { id: 'r2', action: 'OPEN_CALC' });
  const r1 = await a.take('EXEC_RESULT', (r) => r.id === 'r1');
  const r2 = await a.take('EXEC_RESULT', (r) => r.id === 'r2');
  assert.deepStrictEqual([r1.ok, r2.ok, r2.error], [true, false, 'BUSY']);
  const after = await a.cmd('EXEC_CMD', { action: 'OPEN_CALC' });
  assert.strictEqual(after.ok, true);
}

async function testLevels(ctx) {
  const { a, b } = ctx;
  const r = await a.cmd('SET_VOLUME', { value: 40 });
  assert.strictEqual(r.ok, true);
  const st = await a.take('STATE', (s) => s.volume === 40);
  assert.strictEqual(st.muted, false);
  await b.take('STATE', (s) => s.volume === 40);
  for (const value of [-1, 101, 50.5, '40', null, undefined, NaN]) {
    assert.strictEqual((await a.cmd('SET_VOLUME', { value })).error, 'BAD_PARAMS', String(value));
    assert.strictEqual((await a.cmd('SET_BRIGHTNESS', { value })).error, 'BAD_PARAMS', String(value));
  }
  assert.strictEqual((await a.cmd('SET_VOLUME', { value: 0 })).ok, true);
  assert.strictEqual((await a.cmd('SET_VOLUME', { value: 100 })).ok, true);
  assert.strictEqual((await a.cmd('SET_BRIGHTNESS', { value: 55 })).ok, true);
  const bs = await a.take('STATE', (s) => s.brightness === 55);
  assert.strictEqual(bs.volume, 100);

  await sleep(100);
  a.drain('STATE');
  await a.none('STATE', 2600);
  await fetch(`${URL}/dev/state?k=${ctx.key}&volume=77`, { method: 'POST' });
  const polled = await a.take('STATE', (s) => s.volume === 77, 4500);
  assert.strictEqual(polled.brightness, 55);
}

async function testLayout(ctx) {
  const { a, b } = ctx;
  const first = await a.cmd('LAYOUT_GET');
  assert.strictEqual(first.ok, true);
  const def = (await a.take('LAYOUT')).layout;
  assert.strictEqual(def.version, 1);
  assert.deepStrictEqual(def.pages.map((p) => [p.id, p.tiles.length]), [['p1', 8], ['p2', 4]]);
  assert.deepStrictEqual(def.pages[0].tiles[0], { id: 't1', kind: 'action', ref: 'OPEN_CMD', label: null });
  assert.deepStrictEqual(def.pages.flatMap((p) => p.tiles.map((t) => t.ref)), ACTION_NAMES);

  const apps = await a.cmd('APPS_GET', { refresh: false });
  assert.strictEqual(apps.ok, true);
  const list = (await a.take('APPS')).apps;
  assert.ok(list.length >= 12);
  const names = list.map((x) => x.name);
  assert.deepStrictEqual(names, [...names].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' })));
  assert.strictEqual(new Set(names.map((n) => n.toLowerCase())).size, names.length);
  for (const app of list) assert.match(app.id, /^app_[0-9a-f]{8}$/);
  assert.deepStrictEqual(Object.keys(list[0]).sort(), ['id', 'name']);
  ctx.apps = list;

  assert.strictEqual((await a.cmd('APPS_GET', { refresh: true })).ok, true);
  assert.deepStrictEqual((await a.take('APPS')).apps, list);
  assert.strictEqual((await a.cmd('APPS_GET', { refresh: 'yes' })).error, 'BAD_PARAMS');

  const good = {
    version: 1,
    pages: [
      {
        id: 'p1',
        tiles: [
          { id: 't1', kind: 'action', ref: 'OPEN_CMD', label: null },
          { id: 't2', kind: 'app', ref: list[0].id, label: 'My App' },
          { id: 't3', kind: 'folder', ref: ctx.dataDir, label: 'Data' },
          { id: 't4', kind: 'url', ref: 'https://example.com', label: 'Example' }
        ]
      },
      { id: 'p_2', tiles: [] }
    ]
  };
  const set = await a.cmd('LAYOUT_SET', { layout: good });
  assert.strictEqual(set.ok, true);
  assert.deepStrictEqual((await b.take('LAYOUT')).layout, good);
  await a.none('LAYOUT', 200);
  await a.cmd('LAYOUT_GET');
  assert.deepStrictEqual((await a.take('LAYOUT')).layout, good);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(ctx.dataDir, 'layout.json'), 'utf8')), good);
  ctx.layout = good;

  const tile = { id: 't1', kind: 'action', ref: 'OPEN_CMD', label: null };
  const one = (t) => ({ version: 1, pages: [{ id: 'p1', tiles: [t] }] });
  const many = (n) => ({
    version: 1,
    pages: [{ id: 'p1', tiles: Array.from({ length: n }, (_, i) => ({ ...tile, id: `t${i}` })) }]
  });
  const invalid = {
    badKind: one({ ...tile, kind: 'shell' }),
    unknownApp: one({ id: 't1', kind: 'app', ref: 'app_deadbeef', label: null }),
    badAppRef: one({ id: 't1', kind: 'app', ref: '../x', label: null }),
    unknownAction: one({ ...tile, ref: 'FORMAT_C' }),
    protoAction: one({ ...tile, ref: '__proto__' }),
    ftpUrl: one({ id: 't1', kind: 'url', ref: 'ftp://example.com', label: null }),
    jsUrl: one({ id: 't1', kind: 'url', ref: 'javascript:alert(1)', label: null }),
    junkUrl: one({ id: 't1', kind: 'url', ref: 'not a url', label: null }),
    tooManyTiles: many(65),
    tooManyPages: { version: 1, pages: Array.from({ length: 13 }, (_, i) => ({ id: `p${i}`, tiles: [] })) },
    noPages: { version: 1, pages: [] },
    badTileId: one({ ...tile, id: 'bad id' }),
    emptyTileId: one({ ...tile, id: '' }),
    longTileId: one({ ...tile, id: 'a'.repeat(41) }),
    badPageId: { version: 1, pages: [{ id: 'p!', tiles: [] }] },
    dupPageId: { version: 1, pages: [{ id: 'p1', tiles: [] }, { id: 'p1', tiles: [] }] },
    dupTileId: { version: 1, pages: [{ id: 'p1', tiles: [tile, tile] }] },
    longLabel: one({ ...tile, label: 'x'.repeat(61) }),
    numberLabel: one({ ...tile, label: 5 }),
    longRef: one({ id: 't1', kind: 'folder', ref: 'C'.repeat(501), label: null }),
    emptyRef: one({ id: 't1', kind: 'folder', ref: '', label: null }),
    version2: { version: 2, pages: [{ id: 'p1', tiles: [] }] },
    notObject: 'layout',
    nullLayout: null,
    tilesMissing: { version: 1, pages: [{ id: 'p1' }] }
  };
  for (const [name, layout] of Object.entries(invalid)) {
    assert.strictEqual((await a.cmd('LAYOUT_SET', { layout })).error, 'BAD_PARAMS', name);
  }
  assert.strictEqual((await a.cmd('LAYOUT_SET', { layout: many(64) })).ok, true);
  assert.strictEqual((await a.cmd('LAYOUT_SET', { layout: ctx.layout })).ok, true);
  await b.none('LAYOUT', 100, (l) => l.layout.pages[0].tiles.length === 2);
  await a.cmd('LAYOUT_GET');
  assert.deepStrictEqual((await a.take('LAYOUT')).layout, good);
}

async function testIcons(ctx) {
  const id = ctx.apps[0].id;
  const ok = await get(`/icons/${id}.png`, ctx.key);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.headers.get('content-type'), 'image/png');
  assert.strictEqual(ok.headers.get('access-control-allow-origin'), '*');
  const body = Buffer.from(await ok.arrayBuffer());
  assert.ok(body.subarray(0, 4).equals(PNG_MAGIC));
  assert.ok(fs.existsSync(path.join(ctx.dataDir, 'icons', `${id}.png`)));
  assert.strictEqual((await get(`/icons/${id}.png`, ctx.keyB)).status, 200);
  assert.strictEqual((await get(`/icons/${id}.png`, 'f'.repeat(32))).status, 401);
  assert.strictEqual((await get(`/icons/${id}.png`, 'short')).status, 401);
  assert.strictEqual((await get(`/icons/${id}.png`)).status, 401);
  assert.strictEqual((await get('/icons/app_00000000.png', ctx.key)).status, 404);
  assert.strictEqual((await get('/icons/..%2F..%2Ftrusted.json', ctx.key)).status, 404);
  assert.strictEqual((await get(`/icons/${id}`, ctx.key)).status, 404);
  const all = await Promise.all(ctx.apps.map((x) => get(`/icons/${x.id}.png`, ctx.key)));
  assert.ok(all.every((r) => r.status === 200));

  const c = connect(URL);
  const res = await c.login(PIN);
  assert.strictEqual((await get(`/icons/${id}.png`, res.httpKey)).status, 200);
  c.close();
  await waitFor(async () => (await get(`/icons/${id}.png`, res.httpKey)).status === 401);
  assert.strictEqual((await get('/hello')).status, 200);
}

async function testLaunch(ctx) {
  const { a } = ctx;
  const app = ctx.apps[1];
  assert.strictEqual((await a.cmd('LAUNCH', { kind: 'app', ref: app.id })).ok, true);
  assert.strictEqual((await a.cmd('LAUNCH', { kind: 'app', ref: 'app_abcdef01' })).error, 'NOT_FOUND');
  for (const ref of ['C:\\evil.exe', '', 5, 'app_zz', undefined]) {
    assert.strictEqual((await a.cmd('LAUNCH', { kind: 'app', ref })).error, 'BAD_PARAMS', String(ref));
  }
  assert.strictEqual((await a.cmd('LAUNCH', { kind: 'folder', ref: ctx.dataDir })).ok, true);
  assert.strictEqual((await a.cmd('LAUNCH', { kind: 'folder', ref: path.join(ctx.dataDir, 'nope') })).error, 'NOT_FOUND');
  assert.strictEqual((await a.cmd('LAUNCH', { kind: 'folder', ref: path.join(ctx.dataDir, 'layout.json') })).error, 'NOT_FOUND');
  assert.strictEqual((await a.cmd('LAUNCH', { kind: 'folder', ref: 'relative/dir' })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.cmd('LAUNCH', { kind: 'folder', ref: 42 })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.cmd('LAUNCH', { kind: 'url', ref: 'https://example.com/a?b=1&c=2' })).ok, true);
  assert.strictEqual((await a.cmd('LAUNCH', { kind: 'url', ref: 'http://localhost:8080' })).ok, true);
  for (const ref of ['ftp://x.com', 'javascript:alert(1)', 'file:///c:/windows', 'https://a b.com', 'https://x.com"&calc', 'x', '', null, 7]) {
    assert.strictEqual((await a.cmd('LAUNCH', { kind: 'url', ref })).error, 'BAD_PARAMS', String(ref));
  }
  assert.strictEqual((await a.cmd('LAUNCH', { kind: 'action', ref: 'OPEN_CMD' })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.cmd('LAUNCH', { ref: 'x' })).error, 'BAD_PARAMS');
  const log = await devLog(ctx.key);
  assert.deepStrictEqual(
    log.launched.map((x) => x.kind),
    ['app', 'folder', 'url', 'url']
  );
  assert.ok(log.launched[0].ref.endsWith(`${app.name}.lnk`));
  assert.strictEqual(log.launched[2].ref, 'https://example.com/a?b=1&c=2');
}

async function testInput(ctx) {
  const { a } = ctx;
  assert.deepStrictEqual((await devLog(ctx.key)).input, []);
  const sent = [
    { type: 'move', dx: 4, dy: -2 },
    { type: 'move', dx: 500, dy: -500 },
    { type: 'move', dx: 'x', dy: 1 },
    { type: 'click', button: 'right', count: 2 },
    { type: 'click', button: 'left', count: 3 },
    { type: 'click', button: 'left' },
    { type: 'down', button: 'left' },
    { type: 'up', button: 'left' },
    { type: 'down', button: 'foot' },
    { type: 'scroll', dy: -3, dx: 0 },
    { type: 'scroll', dy: 99, dx: -99 },
    { type: 'key', key: 'esc' },
    { type: 'key', key: 'f13' },
    { type: 'text', text: 'hello' },
    { type: 'text', text: 'x'.repeat(201) },
    { type: 'text', text: 42 },
    { type: 'bogus' },
    'junk',
    null,
    { type: 'move', dx: 1, dy: 1 }
  ];
  for (const ev of sent) a.socket.emit('INPUT', ev);
  const expected = [
    { type: 'move', dx: 4, dy: -2 },
    { type: 'move', dx: 200, dy: -200 },
    { type: 'click', button: 'right', count: 2 },
    { type: 'click', button: 'left', count: 1 },
    { type: 'down', button: 'left' },
    { type: 'up', button: 'left' },
    { type: 'scroll', dx: 0, dy: -3 },
    { type: 'scroll', dx: -20, dy: 20 },
    { type: 'key', key: 'esc' },
    { type: 'text', text: 'hello' },
    { type: 'move', dx: 1, dy: 1 }
  ];
  await waitFor(async () => (await devLog(ctx.key)).input.length >= expected.length);
  await sleep(100);
  assert.deepStrictEqual((await devLog(ctx.key)).input, expected);

  await sleep(1100);
  const before = (await devLog(ctx.key)).input.length;
  const c = connect(URL);
  await c.login(PIN);
  for (let i = 0; i < 400; i += 1) c.socket.emit('INPUT', { type: 'move', dx: 1, dy: 0 });
  await sleep(600);
  const accepted = (await devLog(ctx.key)).input.length - before;
  assert.ok(accepted > 0 && accepted <= 240, `rate limit accepted ${accepted}`);
  c.close();
}

async function testClipboard(ctx) {
  const { a, b } = ctx;
  const copy = (text) => fetch(`${URL}/dev/copy?k=${ctx.key}&text=${encodeURIComponent(text)}`, { method: 'POST' });
  assert.strictEqual((await a.cmd('CLIPBOARD_GET')).ok, true);
  assert.deepStrictEqual((await a.take('CLIPBOARD')).items.map((i) => i.text), []);

  await copy('alpha');
  const first = await a.take('CLIPBOARD', (c) => c.items.length === 1);
  await b.take('CLIPBOARD', (c) => c.items.length === 1);
  assert.match(first.items[0].id, /^cb_\d+$/);
  assert.strictEqual(first.items[0].text, 'alpha');
  assert.ok(Math.abs(Date.now() - first.items[0].at) < 5000);
  await copy('beta');
  const second = await a.take('CLIPBOARD', (c) => c.items.length === 2);
  assert.deepStrictEqual(second.items.map((i) => i.text), ['beta', 'alpha']);
  await copy('alpha');
  const third = await a.take('CLIPBOARD', (c) => c.items[0].text === 'alpha');
  assert.deepStrictEqual(third.items.map((i) => i.text), ['alpha', 'beta']);
  assert.strictEqual(third.items[0].id, first.items[0].id);
  await copy('alpha');
  await copy('x'.repeat(5001));
  await copy('   ');
  await a.none('CLIPBOARD', 300);
  for (let i = 0; i < 12; i += 1) await copy(`item ${i}`);
  const full = await a.take('CLIPBOARD', (c) => c.items[0].text === 'item 11');
  assert.strictEqual(full.items.length, 10);
  assert.strictEqual(new Set(full.items.map((i) => i.text)).size, 10);

  const target = full.items[3];
  let log = await devLog(ctx.key);
  const pastes = log.pastes;
  assert.strictEqual((await a.cmd('CLIPBOARD_PASTE', { itemId: target.id })).ok, true);
  log = await devLog(ctx.key);
  assert.strictEqual(log.clipboard, target.text);
  assert.strictEqual(log.pastes, pastes + 1);
  assert.strictEqual((await a.cmd('CLIPBOARD_PASTE', { itemId: 'cb_99999' })).error, 'NOT_FOUND');
  assert.strictEqual((await a.cmd('CLIPBOARD_PASTE', { itemId: 5 })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.cmd('CLIPBOARD_PASTE', {})).error, 'BAD_PARAMS');

  assert.strictEqual((await a.cmd('CLIPBOARD_SEND', { text: 'from my phone', paste: true })).ok, true);
  log = await devLog(ctx.key);
  assert.strictEqual(log.clipboard, 'from my phone');
  assert.strictEqual(log.pastes, pastes + 2);
  assert.strictEqual((await a.cmd('CLIPBOARD_SEND', { text: 'no paste', paste: false })).ok, true);
  assert.strictEqual((await a.cmd('CLIPBOARD_SEND', { text: 'no paste 2' })).ok, true);
  log = await devLog(ctx.key);
  assert.strictEqual(log.clipboard, 'no paste 2');
  assert.strictEqual(log.pastes, pastes + 2);
  assert.strictEqual((await a.cmd('CLIPBOARD_SEND', { text: 'y'.repeat(10001), paste: true })).error, 'TOO_LARGE');
  assert.strictEqual((await a.cmd('CLIPBOARD_SEND', { text: 'z'.repeat(10000) })).ok, true);
  assert.strictEqual((await a.cmd('CLIPBOARD_SEND', { text: '' })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.cmd('CLIPBOARD_SEND', { text: 5 })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.cmd('CLIPBOARD_SEND', { text: 'a', paste: 'yes' })).error, 'BAD_PARAMS');
  assert.strictEqual((await devLog(ctx.key)).clipboard, 'z'.repeat(10000));
}

async function testCapture(ctx) {
  const { a } = ctx;
  const dir = path.join(ctx.dataDir, 'tmp', 'Pictures', 'LocalDock');
  const r1 = await a.cmd('CAPTURE_SCREENSHOT');
  assert.strictEqual(r1.ok, true);
  assert.match(r1.file, /^screenshot-\d{8}-\d{6}( \(\d+\))?\.png$/);
  assert.ok(r1.thumb.startsWith('data:image/jpeg;base64,'));
  assert.ok(r1.thumb.length < 60000);
  assert.ok(fs.readFileSync(path.join(dir, r1.file)).subarray(0, 4).equals(PNG_MAGIC));
  const r2 = await a.cmd('CAPTURE_SCREENSHOT');
  assert.notStrictEqual(r2.file, r1.file);
  assert.ok(fs.existsSync(path.join(dir, r2.file)));

  const sigDir = path.join(dir, 'Signatures');
  const png = solidPng(40, 20, [0, 0, 0]);
  const pastes = (await devLog(ctx.key)).pastes;
  const s1 = await a.cmd('SIGNATURE_SEND', { png: png.toString('base64'), insert: false });
  assert.strictEqual(s1.ok, true);
  assert.match(s1.file, /^signature-\d{8}-\d{6}( \(\d+\))?\.png$/);
  assert.ok(fs.readFileSync(path.join(sigDir, s1.file)).equals(png));
  assert.strictEqual((await devLog(ctx.key)).pastes, pastes);
  const s2 = await a.cmd('SIGNATURE_SEND', { png: png.toString('base64'), insert: true });
  assert.strictEqual(s2.ok, true);
  assert.notStrictEqual(s2.file, s1.file);
  const log = await devLog(ctx.key);
  assert.strictEqual(log.clipboardImage, s2.file);
  assert.strictEqual(log.pastes, pastes + 1);

  const big = (n) => Buffer.concat([png, Buffer.alloc(n - png.length)]);
  const max = await a.cmd('SIGNATURE_SEND', { png: big(2 * 1024 * 1024).toString('base64') });
  assert.strictEqual(max.ok, true);
  const over = await a.cmd('SIGNATURE_SEND', { png: big(2 * 1024 * 1024 + 1).toString('base64') });
  assert.strictEqual(over.error, 'TOO_LARGE');
  assert.strictEqual((await a.cmd('SIGNATURE_SEND', { png: 'abc!' })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.cmd('SIGNATURE_SEND', { png: Buffer.from('not a png at all').toString('base64') })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.cmd('SIGNATURE_SEND', { png: `data:image/png;base64,${png.toString('base64')}` })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.cmd('SIGNATURE_SEND', { png: 7 })).error, 'BAD_PARAMS');
  assert.strictEqual((await a.cmd('SIGNATURE_SEND', { png: png.toString('base64'), insert: 'yes' })).error, 'BAD_PARAMS');
}

async function testUpload(ctx) {
  const dir = path.join(ctx.dataDir, 'tmp', 'Downloads', 'LocalDock');
  const up = async (name, body, key = ctx.key) => {
    const q = name === null ? '' : `&name=${encodeURIComponent(name)}`;
    const res = await post('/upload', key, body, q);
    return { status: res.status, json: await res.json() };
  };
  const r1 = await up('photo.jpg', 'hello');
  assert.deepStrictEqual([r1.status, r1.json], [200, { ok: true, file: 'photo.jpg' }]);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'photo.jpg'), 'utf8'), 'hello');
  assert.strictEqual((await up('photo.jpg', 'two')).json.file, 'photo (1).jpg');
  assert.strictEqual((await up('photo.jpg', 'three')).json.file, 'photo (2).jpg');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'photo (2).jpg'), 'utf8'), 'three');
  assert.strictEqual((await up('notes', 'a')).json.file, 'notes');
  assert.strictEqual((await up('notes', 'b')).json.file, 'notes (1)');
  const binary = crypto.randomBytes(1024 * 1024);
  assert.strictEqual((await up('data.bin', binary)).json.file, 'data.bin');
  assert.ok(fs.readFileSync(path.join(dir, 'data.bin')).equals(binary));
  assert.strictEqual((await up('empty.txt', '')).json.file, 'empty.txt');
  assert.strictEqual((await up('ünï cödé.txt', 'u')).json.file, 'ünï cödé.txt');

  const cases = [
    ['../../evil<>:"|?*.txt', 'evil.txt'],
    ['C:\\Windows\\System32\\sys.ini', 'sys.ini'],
    ['..\\..\\boot.ini', 'boot.ini'],
    ['con.txt', '_con.txt'],
    ['NUL', '_NUL'],
    ['report...', 'report'],
    ['....', 'upload'],
    ['   ', 'upload (1)']
  ];
  for (const [name, expected] of cases) {
    const r = await up(name, 'x');
    assert.strictEqual(r.json.file, expected, name);
    assert.ok(fs.existsSync(path.join(dir, expected)));
  }
  assert.strictEqual((await up(null, 'x')).json.file, 'upload (2)');
  assert.ok(!fs.existsSync(path.join(ctx.dataDir, 'tmp', 'Downloads', 'evil.txt')));
  assert.ok(!fs.existsSync(path.join(ctx.dataDir, 'evil.txt')));

  const before = fs.readdirSync(dir).length;
  const noKey = await fetch(`${URL}/upload?name=a.txt`, { method: 'POST', body: 'x' });
  assert.strictEqual(noKey.status, 401);
  const badKey = await up('a.txt', 'x', 'e'.repeat(32));
  assert.strictEqual(badKey.status, 401);
  assert.strictEqual(fs.readdirSync(dir).length, before);

  const pre = await fetch(`${URL}/upload?k=${ctx.key}&name=a.txt`, {
    method: 'OPTIONS',
    headers: { Origin: 'capacitor://localhost', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
  });
  assert.ok(pre.status === 204 || pre.status === 200);
  assert.strictEqual(pre.headers.get('access-control-allow-origin'), '*');
  assert.match(pre.headers.get('access-control-allow-headers'), /Content-Type/i);
  assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
  const preIcon = await fetch(`${URL}/icons/x.png`, { method: 'OPTIONS' });
  assert.strictEqual(preIcon.headers.get('access-control-allow-origin'), '*');
  const uploaded = await fetch(`${URL}/upload?k=${ctx.key}&name=cors.txt`, { method: 'POST', body: 'c' });
  assert.strictEqual(uploaded.headers.get('access-control-allow-origin'), '*');

  const status = await new Promise((resolve, reject) => {
    const req = http.request(
      `${URL}/upload?k=${ctx.key}&name=huge.bin`,
      { method: 'POST', headers: { 'Content-Length': String(3 * 1024 * 1024 * 1024) } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
        req.destroy();
      }
    );
    req.on('error', (e) => {
      if (e.code !== 'ECONNRESET') reject(e);
    });
    req.write('x');
  });
  assert.strictEqual(status, 413);
  assert.ok(!fs.existsSync(path.join(dir, 'huge.bin')));
}

async function testRestart(ctx) {
  const key = ctx.key;
  assert.ok(key);
  ctx.a.close();
  ctx.b.close();
  await ctx.server.stop();

  const server = await startServer({
    port: PORT,
    pin: PIN2,
    dataDir: ctx.dataDir,
    env: { LOCALDOCK_DEV_NO_BRIGHTNESS: '1', LOCALDOCK_AUTH_TIMEOUT_MS: '700' }
  });
  ctx.server = server;
  assert.ok(server.banner.includes(PIN2));
  assert.match(server.banner, /PIN\s*:\s*\d{6}\b/);

  const idle = connect(URL);
  await idle.take('PIN_REQ');
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('idle socket not disconnected')), 3000);
    idle.socket.once('disconnect', () => {
      clearTimeout(t);
      resolve();
    });
  });

  const c = connect(URL);
  c.socket.emit('AUTH', { token: ctx.token });
  const res = await c.take('AUTH_RESULT');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.token, undefined);
  assert.strictEqual(res.caps.brightness, false);
  assert.strictEqual(res.caps.volume, true);
  const state = await c.take('STATE');
  assert.strictEqual(state.brightness, null);
  assert.strictEqual((await c.cmd('SET_BRIGHTNESS', { value: 10 })).error, 'NOT_SUPPORTED');
  assert.strictEqual((await c.cmd('SET_BRIGHTNESS', { value: 500 })).error, 'NOT_SUPPORTED');
  await c.cmd('LAYOUT_GET');
  assert.deepStrictEqual((await c.take('LAYOUT')).layout, ctx.layout);
  c.close();

  const d = connect(URL);
  await d.take('PIN_REQ');
  d.socket.emit('AUTH', { token: '0'.repeat(64) });
  const badToken = await d.take('AUTH_RESULT');
  assert.deepStrictEqual([badToken.ok, badToken.error], [false, 'BAD_TOKEN']);
  const again = await d.take('PIN_REQ');
  assert.strictEqual(again.pinLength, 6);
  assert.strictEqual(again.attemptsLeft, 5);
  d.socket.emit('AUTH', { token: 'abc' });
  assert.strictEqual((await d.take('AUTH_RESULT')).error, 'BAD_TOKEN');
  await d.take('PIN_REQ');
  d.socket.emit('AUTH', { token: 12345 });
  assert.strictEqual((await d.take('AUTH_RESULT')).error, 'BAD_PAYLOAD');
  const oldPin = await d.auth({ pin: PIN });
  assert.deepStrictEqual([oldPin.ok, oldPin.error, oldPin.attemptsLeft], [false, 'BAD_PIN', 4]);
  const ok = await d.auth({ pin: PIN2 });
  assert.strictEqual(ok.ok, true);
  assert.match(ok.token, /^[0-9a-f]{64}$/);
  assert.notStrictEqual(ok.token, ctx.token);
  d.close();
}

async function testIpLockout() {
  const e = connect(URL);
  await e.take('PIN_REQ');
  let last;
  for (let i = 0; i < 5; i += 1) last = await e.auth({ pin: '222222' });
  assert.strictEqual(last.error, 'TOO_MANY_ATTEMPTS');

  const f = connect(URL);
  await f.take('PIN_REQ');
  const closed = new Promise((r) => f.socket.once('disconnect', r));
  for (let i = 0; i < 5; i += 1) last = await f.auth({ pin: '222222' });
  assert.strictEqual(last.error, 'TOO_MANY_ATTEMPTS');
  await closed;

  const g = connect(URL);
  await g.take('PIN_REQ');
  const blocked = await g.auth({ pin: PIN2 });
  assert.deepStrictEqual([blocked.ok, blocked.error], [false, 'TOO_MANY_ATTEMPTS']);
  const res = await fetch(`${URL}/hello`);
  assert.strictEqual(res.status, 200);
}

async function run() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localdock-test-'));
  const ctx = { dataDir };
  ctx.server = await startServer({ port: PORT, pin: PIN, dataDir, env: { LOCALDOCK_DEV_DELAY_MS: '80' } });
  try {
    await testHello();
    await testAuth(ctx);
    await testPanel(ctx);
    await testExec(ctx);
    await testLevels(ctx);
    await testLayout(ctx);
    await testIcons(ctx);
    await testLaunch(ctx);
    await testInput(ctx);
    await testClipboard(ctx);
    await testCapture(ctx);
    await testUpload(ctx);
    await testRestart(ctx);
    await testIpLockout();
    console.log('integration tests passed');
  } finally {
    await ctx.server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

module.exports = { run };
