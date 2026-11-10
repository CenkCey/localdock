const assert = require('assert');
const { createLock, runExclusive } = require('../src/lock');
const { createLockout, hashToken, safeEqual, generatePin } = require('../src/auth');
const { sanitizeName } = require('../src/files');
const { normalize } = require('../src/input');
const { validateLayout, defaultLayout } = require('../src/layout');
const { ACTION_NAMES, isAction, parseParams } = require('../src/actions');
const { windowsCommand } = require('../src/platform/commands');
const { solidPng } = require('../src/platform/png');
const { createStderrLog } = require('../src/platform/stderrlog');

async function testLock() {
  const lock = createLock();
  const slow = lock.run(() => new Promise((r) => setTimeout(() => r('done'), 50)));
  assert.strictEqual(lock.held, true);
  const second = await lock.run(async () => 'never');
  assert.strictEqual(second.busy, true);
  assert.deepStrictEqual(await runExclusive(lock, async () => ({ ok: true })), { ok: false, error: 'BUSY' });
  assert.deepStrictEqual(await slow, { busy: false, value: 'done' });
  assert.strictEqual(lock.held, false);
  assert.strictEqual((await lock.run(async () => 'again')).value, 'again');
  const failing = await runExclusive(lock, async () => {
    throw new Error('boom');
  });
  assert.deepStrictEqual(failing, { ok: false, error: 'EXEC_FAILED' });
  const coded = await runExclusive(lock, async () => {
    const e = new Error('t');
    e.code = 'TIMEOUT';
    throw e;
  });
  assert.deepStrictEqual(coded, { ok: false, error: 'TIMEOUT' });
  assert.strictEqual(lock.held, false);
}

function testLockout() {
  let t = 1000;
  const lockout = createLockout(() => t);
  for (let i = 0; i < 9; i += 1) assert.strictEqual(lockout.fail('1.1.1.1'), false);
  assert.strictEqual(lockout.blocked('1.1.1.1'), false);
  assert.strictEqual(lockout.fail('1.1.1.1'), true);
  assert.strictEqual(lockout.blocked('1.1.1.1'), true);
  assert.strictEqual(lockout.blocked('2.2.2.2'), false);
  t += 59000;
  assert.strictEqual(lockout.blocked('1.1.1.1'), true);
  t += 2000;
  assert.strictEqual(lockout.blocked('1.1.1.1'), false);
  for (let i = 0; i < 9; i += 1) lockout.fail('3.3.3.3');
  t += 5 * 60 * 1000 + 1;
  assert.strictEqual(lockout.fail('3.3.3.3'), false);
  for (let i = 0; i < 9; i += 1) lockout.fail('4.4.4.4');
  lockout.clear('4.4.4.4');
  assert.strictEqual(lockout.fail('4.4.4.4'), false);
}

function testAuthHelpers() {
  assert.match(generatePin(), /^\d{6}$/);
  assert.strictEqual(hashToken('abc').length, 64);
  assert.strictEqual(safeEqual('abc', 'abc'), true);
  assert.strictEqual(safeEqual('abc', 'abd'), false);
  assert.strictEqual(safeEqual('abc', 'abcd'), false);
}

function testSanitize() {
  assert.strictEqual(sanitizeName('photo.jpg'), 'photo.jpg');
  assert.strictEqual(sanitizeName('../../etc/passwd'), 'passwd');
  assert.strictEqual(sanitizeName('C:\\Windows\\sys.ini'), 'sys.ini');
  assert.strictEqual(sanitizeName('evil<>:"|?*.txt'), 'evil.txt');
  assert.strictEqual(sanitizeName('name...'), 'name');
  assert.strictEqual(sanitizeName('name. . '), 'name');
  assert.strictEqual(sanitizeName('CON'), '_CON');
  assert.strictEqual(sanitizeName('nul.txt'), '_nul.txt');
  assert.strictEqual(sanitizeName('com1.tar.gz'), '_com1.tar.gz');
  assert.strictEqual(sanitizeName('console.txt'), 'console.txt');
  assert.strictEqual(sanitizeName(''), 'upload');
  assert.strictEqual(sanitizeName('...'), 'upload');
  assert.strictEqual(sanitizeName('  '), 'upload');
  assert.strictEqual(sanitizeName('a\u0000b\nc.txt'), 'abc.txt');
  const long = sanitizeName(`${'x'.repeat(400)}.png`);
  assert.ok(long.length <= 150 && long.endsWith('.png'));
}

function testInputNormalize() {
  assert.deepStrictEqual(normalize({ type: 'move', dx: 4.4, dy: -2 }), { type: 'move', dx: 4, dy: -2 });
  assert.deepStrictEqual(normalize({ type: 'move', dx: 999, dy: -999 }), { type: 'move', dx: 200, dy: -200 });
  assert.strictEqual(normalize({ type: 'move', dx: 'a', dy: 1 }), null);
  assert.strictEqual(normalize({ type: 'move', dx: NaN, dy: 1 }), null);
  assert.strictEqual(normalize({ type: 'move', dx: 1 }), null);
  assert.deepStrictEqual(normalize({ type: 'click', button: 'left' }), { type: 'click', button: 'left', count: 1 });
  assert.strictEqual(normalize({ type: 'click', button: 'left', count: 3 }), null);
  assert.strictEqual(normalize({ type: 'click', button: 'x' }), null);
  assert.deepStrictEqual(normalize({ type: 'scroll', dy: -50 }), { type: 'scroll', dx: 0, dy: -20 });
  assert.strictEqual(normalize({ type: 'scroll', dx: 0, dy: 0 }), null);
  assert.strictEqual(normalize({ type: 'key', key: 'f13' }), null);
  assert.deepStrictEqual(normalize({ type: 'key', key: 'pagedown' }), { type: 'key', key: 'pagedown' });
  assert.deepStrictEqual(normalize({ type: 'text', text: 'héllo \u{1F600}' }), { type: 'text', text: 'héllo \u{1F600}' });
  assert.strictEqual(normalize({ type: 'text', text: 'a'.repeat(201) }), null);
  assert.strictEqual(normalize({ type: 'text', text: 'a'.repeat(200) }).text.length, 200);
  assert.strictEqual(normalize({ type: 'text', text: '\n\t' }), null);
  assert.strictEqual(normalize(null), null);
  assert.strictEqual(normalize([]), null);
  assert.strictEqual(normalize({ type: '__proto__' }), null);
}

function testLayout() {
  const def = defaultLayout();
  assert.deepStrictEqual(def.pages.map((p) => p.tiles.length), [8, 4]);
  assert.deepStrictEqual(def.pages.flatMap((p) => p.tiles.map((t) => t.ref)), ACTION_NAMES);
  assert.strictEqual(validateLayout(def, () => false).ok, true);
  const tile = { id: 't1', kind: 'url', ref: 'https://example.com', label: null };
  const wrap = (t) => ({ version: 1, pages: [{ id: 'p1', tiles: t }] });
  assert.strictEqual(validateLayout(wrap([tile]), () => false).ok, true);
  assert.strictEqual(validateLayout(wrap([{ ...tile, ref: 'file:///c:/x' }]), () => false).ok, false);
  assert.strictEqual(validateLayout(wrap([tile, tile]), () => false).ok, false);
  assert.strictEqual(validateLayout(wrap([{ id: 'a', kind: 'app', ref: 'app_123456' }]), () => false).ok, false);
  assert.strictEqual(validateLayout(wrap([{ id: 'a', kind: 'app', ref: 'app_123456' }]), () => true).ok, true);
  assert.strictEqual(validateLayout(wrap([{ id: 'a', kind: 'action', ref: '__proto__' }]), () => true).ok, false);
  assert.strictEqual(validateLayout({ version: 1, pages: [] }, () => true).ok, false);
}

function testActions() {
  assert.strictEqual(isAction('__proto__'), false);
  assert.strictEqual(isAction('OPEN_CMD'), true);
  assert.deepStrictEqual(parseParams('VOLUME_UP', undefined), { ok: true, steps: 5 });
  assert.deepStrictEqual(parseParams('VOLUME_UP', { steps: 25 }), { ok: true, steps: 25 });
  assert.strictEqual(parseParams('VOLUME_UP', { steps: 26 }).ok, false);
  assert.strictEqual(parseParams('VOLUME_UP', { steps: '3' }).ok, false);
  assert.strictEqual(parseParams('OPEN_CMD', null).ok, false);
  assert.strictEqual(parseParams('OPEN_CMD', []).ok, false);
}

function testWindowsCommands() {
  for (const name of ACTION_NAMES) assert.ok(typeof windowsCommand(name, 3) === 'string', name);
  assert.strictEqual(windowsCommand('SLEEP_PC'), 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
  assert.ok(windowsCommand('VOLUME_UP', 3).includes('[char]175'));
  assert.strictEqual(windowsCommand('VOLUME_UP', 99), null);
  assert.strictEqual(windowsCommand('__proto__', 1), null);
  assert.strictEqual(windowsCommand('format c:', 1), null);
}

function testPng() {
  const png = solidPng(8, 8, [1, 2, 3]);
  assert.strictEqual(png.subarray(1, 4).toString(), 'PNG');
  assert.strictEqual(png.readUInt32BE(16), 8);
}

function testStderrLog() {
  const out = [];
  const log = createStderrLog('[helper]', 3, (l) => out.push(l));
  log.add('one\r\ntwo\n\nthr');
  log.add('ee\nfour\nfive');
  assert.strictEqual(log.flush(), true);
  assert.deepStrictEqual(out, ['[helper] one', '[helper] two', '[helper] three']);
  log.add('later\n');
  assert.strictEqual(log.flush(), false);
  assert.strictEqual(out.length, 3);
  const quiet = [];
  const other = createStderrLog('[helper]', 20, (l) => quiet.push(l));
  other.add('x\n');
  other.discard();
  assert.strictEqual(other.flush(), false);
  assert.strictEqual(quiet.length, 0);
  const tail = [];
  const last = createStderrLog('[helper]', 20, (l) => tail.push(l));
  last.add('no newline');
  last.flush();
  assert.deepStrictEqual(tail, ['[helper] no newline']);
}

async function run() {
  await testLock();
  testLockout();
  testAuthHelpers();
  testSanitize();
  testInputNormalize();
  testLayout();
  testActions();
  testWindowsCommands();
  testPng();
  testStderrLog();
  console.log('unit tests passed');
}

module.exports = { run };
