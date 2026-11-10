import assert from 'node:assert';
import {
  parseAddress,
  normalizeAddress,
  isValidPin,
  isValidHttpUrl,
  errorText,
  iconUrl,
  uploadUrl,
  uploadErrorText,
  fetchHello
} from '../src/protocol.js';
import { groupActions, describeAction } from '../src/actionsMeta.js';
import { tileLabel } from '../src/tileMeta.js';

assert.deepStrictEqual(parseAddress('192.168.1.20'), {
  host: '192.168.1.20',
  port: 3000,
  url: 'http://192.168.1.20:3000'
});
assert.strictEqual(parseAddress(' http://10.0.0.5:4000/ ').url, 'http://10.0.0.5:4000');
assert.strictEqual(parseAddress('pc.local').url, 'http://pc.local:3000');
assert.strictEqual(parseAddress(''), null);
assert.strictEqual(parseAddress('a b'), null);
assert.strictEqual(parseAddress('1.2.3.4:99999'), null);
assert.strictEqual(parseAddress('1.2.3.4:0'), null);
assert.strictEqual(normalizeAddress('http://10.0.0.5'), '10.0.0.5:3000');
assert.strictEqual(normalizeAddress('nope nope'), null);

assert.ok(isValidPin('123456'));
assert.ok(isValidPin('000042'));
assert.ok(!isValidPin('1234'));
assert.ok(!isValidPin('1234567'));
assert.ok(!isValidPin('12a456'));
assert.ok(!isValidPin(123456));
assert.ok(isValidPin('1234', 4));
assert.ok(!isValidPin('123456', 4));

assert.ok(isValidHttpUrl('https://example.com/a?b=1'));
assert.ok(isValidHttpUrl('http://192.168.1.2:8080'));
assert.ok(!isValidHttpUrl('ftp://example.com'));
assert.ok(!isValidHttpUrl('javascript:alert(1)'));
assert.ok(!isValidHttpUrl('example.com'));
assert.ok(!isValidHttpUrl(''));

assert.strictEqual(iconUrl('http://pc:3000', 'k1', 'app_1'), 'http://pc:3000/icons/app_1.png?k=k1');
assert.strictEqual(
  uploadUrl('http://pc:3000', 'k 1', 'my photo (1).jpg'),
  'http://pc:3000/upload?k=k%201&name=my%20photo%20(1).jpg'
);

assert.ok(errorText('BUSY').length > 0);
assert.ok(errorText('???').length > 0);
assert.ok(errorText('TOO_LARGE').length > 0);
assert.ok(uploadErrorText(413).includes('2 GB'));
assert.ok(uploadErrorText(401).includes('Reconnect'));
assert.ok(uploadErrorText(0).includes('interrupted'));

const okFetch = async () => ({
  ok: true,
  json: async () => ({ app: 'localdock', name: 'STUDIO-PC', platform: 'windows', version: '2.0.0', pinLength: 6 })
});
assert.deepStrictEqual(await fetchHello('10.0.0.5', 500, okFetch), {
  name: 'STUDIO-PC',
  platform: 'windows',
  version: '2.0.0',
  pinLength: 6
});
assert.strictEqual(await fetchHello('10.0.0.5', 500, async () => ({ ok: true, json: async () => ({ app: 'other' }) })), null);
assert.strictEqual(await fetchHello('10.0.0.5', 500, async () => { throw new Error('down'); }), null);
assert.strictEqual(await fetchHello('bad address', 500, okFetch), null);
const slow = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
const started = Date.now();
assert.strictEqual(await fetchHello('10.0.0.5', 80, slow), null);
assert.ok(Date.now() - started < 1000);

const groups = groupActions(['LOCK_PC', 'VOLUME_UP', 'OPEN_CMD', 'NEW_THING', 'SLEEP_PC']);
assert.deepStrictEqual(
  groups.map((g) => g.id),
  ['apps', 'sound', 'system', 'other']
);
assert.strictEqual(describeAction('NEW_THING').label, 'New Thing');
assert.strictEqual(describeAction('SLEEP_PC').label, 'Sleep PC');

assert.strictEqual(tileLabel({ kind: 'action', ref: 'OPEN_CALC', label: null }), 'Calculator');
assert.strictEqual(tileLabel({ kind: 'action', ref: 'OPEN_CALC', label: 'Calc' }), 'Calc');
assert.strictEqual(tileLabel({ kind: 'folder', ref: 'C:\\Users\\me\\Documents\\', label: null }), 'Documents');
assert.strictEqual(tileLabel({ kind: 'url', ref: 'https://www.example.com/x', label: null }), 'example.com');
assert.strictEqual(tileLabel({ kind: 'app', ref: 'app_1', label: null }), 'App');

console.log('protocol tests passed');
