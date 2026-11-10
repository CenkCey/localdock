import assert from 'node:assert';
import {
  rechunk,
  displayPages,
  toLayout,
  moveTileWithin,
  moveTileToPage,
  removeTile,
  addTile,
  addPage,
  removePage,
  newTile,
  normalizeLayout,
  gridFor,
  MAX_PAGES,
  MAX_TILES
} from '../src/layout.js';
import {
  useStorage,
  loadPcs,
  savePcs,
  upsertPc,
  removePc,
  getToken,
  setToken,
  dropToken,
  loadSettings,
  saveSettings,
  sanitizeSettings
} from '../src/settings.js';
import { accelerate, createCoalescer, createScroller, splitText } from '../src/touchpad.js';

function memory(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    }
  };
}

function tiles(n, prefix = 't') {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, kind: 'action', ref: 'OPEN_CMD', label: null }));
}

let counter = 0;
const ids = (prefix) => `${prefix}gen${(counter += 1)}`;

const eight = rechunk([{ id: 'p1', tiles: tiles(8) }], 8);
assert.strictEqual(eight.length, 1);
const four = rechunk([{ id: 'p1', tiles: tiles(8) }], 4);
assert.deepStrictEqual(four.map((p) => p.tiles.length), [4, 4]);
assert.deepStrictEqual(four.map((p) => p.id), ['p1', 'p1_2']);
const six = rechunk([{ id: 'p1', tiles: tiles(8) }, { id: 'p2', tiles: tiles(3, 'u') }], 6);
assert.deepStrictEqual(six.map((p) => p.tiles.length), [6, 2, 3]);
assert.deepStrictEqual(six.map((p) => p.id), ['p1', 'p1_2', 'p2']);
const clash = rechunk([{ id: 'p1', tiles: tiles(8) }, { id: 'p1_2', tiles: [] }], 4);
assert.strictEqual(new Set(clash.map((p) => p.id)).size, clash.length);
assert.deepStrictEqual(rechunk([{ id: 'p1', tiles: [] }], 4).map((p) => p.tiles.length), [0]);
assert.deepStrictEqual(rechunk([], 4), [{ id: 'p1', tiles: [] }]);

assert.deepStrictEqual(gridFor(4), { cols: 2, rows: 2 });
assert.deepStrictEqual(gridFor(6), { cols: 3, rows: 2 });
assert.deepStrictEqual(gridFor(8), { cols: 4, rows: 2 });

assert.deepStrictEqual(normalizeLayout(null).pages.length, 1);
assert.deepStrictEqual(normalizeLayout({ pages: [] }).pages.length, 1);
const dirty = normalizeLayout({ pages: [{ id: 'a', tiles: [{ id: 'x', kind: 'app', ref: 'r' }, null, { id: 'y' }] }] });
assert.strictEqual(dirty.pages[0].tiles.length, 1);

const layout = { version: 1, pages: [{ id: 'p1', tiles: tiles(8) }] };
const shown = displayPages(layout, 4);
assert.strictEqual(shown.length, 2);
const saved = toLayout(shown, 4);
assert.deepStrictEqual(saved.pages.map((p) => p.tiles.length), [4, 4]);
assert.strictEqual(saved.version, 1);
assert.deepStrictEqual(displayPages(saved, 4), shown);

const many = Array.from({ length: 15 }, (_, i) => ({ id: `q${i}`, tiles: tiles(2, `z${i}_`) }));
const capped = toLayout(many);
assert.strictEqual(capped.pages.length, MAX_PAGES);
assert.strictEqual(capped.pages.flatMap((p) => p.tiles).length, 30);
const huge = toLayout([{ id: 'p1', tiles: tiles(70) }]);
assert.strictEqual(huge.pages[0].tiles.length, MAX_TILES);

const pages = [{ id: 'a', tiles: tiles(4, 'a') }, { id: 'b', tiles: tiles(2, 'b') }];
const reordered = moveTileWithin(pages, 0, 0, 2);
assert.deepStrictEqual(reordered[0].tiles.map((t) => t.id), ['a2', 'a3', 'a1', 'a4']);
assert.strictEqual(pages[0].tiles[0].id, 'a1');
assert.deepStrictEqual(moveTileWithin(pages, 0, 3, 99)[0].tiles.map((t) => t.id), ['a1', 'a2', 'a3', 'a4']);
assert.deepStrictEqual(moveTileWithin(pages, 0, 3, 0)[0].tiles.map((t) => t.id), ['a4', 'a1', 'a2', 'a3']);
assert.strictEqual(moveTileWithin(pages, 0, 1, 1), pages);

const forward = moveTileToPage(pages, 0, 3, 1, 4);
assert.deepStrictEqual(forward[0].tiles.map((t) => t.id), ['a1', 'a2', 'a3']);
assert.deepStrictEqual(forward[1].tiles.map((t) => t.id), ['a4', 'b1', 'b2']);
const backward = moveTileToPage(pages, 1, 1, -1, 8);
assert.deepStrictEqual(backward[0].tiles.map((t) => t.id), ['a1', 'a2', 'a3', 'a4', 'b2']);
assert.strictEqual(moveTileToPage(pages, 0, 0, -1, 4), pages);
const fullTarget = [{ id: 'a', tiles: tiles(2, 'a') }, { id: 'b', tiles: tiles(2, 'b') }];
assert.strictEqual(moveTileToPage(fullTarget, 0, 0, 1, 2), fullTarget);

const removed = removeTile(pages, 0, 1);
assert.deepStrictEqual(removed[0].tiles.map((t) => t.id), ['a1', 'a3', 'a4']);
assert.strictEqual(removed[1], pages[1]);

const tile = newTile('app', 'app_1', 'Code', ids);
assert.deepStrictEqual(tile, { id: 'tgen1', kind: 'app', ref: 'app_1', label: 'Code' });
assert.strictEqual(newTile('folder', 'C:\\x', '', ids).label, null);
const added = addTile(pages, 1, tile, 4);
assert.deepStrictEqual(added[1].tiles.map((t) => t.id), ['b1', 'b2', 'tgen1']);
const spilled = addTile(pages, 0, tile, 4);
assert.deepStrictEqual(spilled.map((p) => p.tiles.length), [4, 3]);
assert.strictEqual(spilled[1].tiles[2].id, 'tgen1');
const allFull = [{ id: 'a', tiles: tiles(4, 'a') }, { id: 'b', tiles: tiles(4, 'b') }];
const appended = addTile(allFull, 0, tile, 4, ids);
assert.deepStrictEqual(appended.map((p) => p.tiles.length), [4, 4, 1]);
assert.ok(appended[2].id.startsWith('pgen'));
const atMax = Array.from({ length: MAX_PAGES }, (_, i) => ({ id: `p${i}`, tiles: tiles(4, `x${i}_`) }));
const overflowed = addTile(atMax, 0, tile, 4, ids);
assert.strictEqual(toLayout(overflowed, 4).pages.length, MAX_PAGES);
assert.strictEqual(toLayout(overflowed, 4).pages.flatMap((p) => p.tiles).length, MAX_PAGES * 4 + 1);

const grown = addPage(pages, ids);
assert.strictEqual(grown.length, 3);
assert.ok(grown[2].id.startsWith('pgen'));
assert.deepStrictEqual(grown[2].tiles, []);
const maxed = Array.from({ length: MAX_PAGES }, (_, i) => ({ id: `p${i}`, tiles: [] }));
assert.strictEqual(addPage(maxed, ids), maxed);
assert.strictEqual(removePage(pages, 0).length, 1);
assert.strictEqual(removePage([pages[0]], 0).length, 1);

const mem = memory();
useStorage(mem);
assert.deepStrictEqual(loadPcs(), []);
let pcs = [];
pcs = upsertPc(pcs, { address: '10.0.0.5:3000', name: 'STUDIO-PC', platform: 'windows' });
pcs = upsertPc(pcs, { address: '10.0.0.6:3000' });
pcs = setToken(pcs, '10.0.0.5:3000', 'abc');
assert.strictEqual(getToken(pcs, '10.0.0.5:3000'), 'abc');
assert.strictEqual(getToken(pcs, '10.0.0.6:3000'), null);
assert.strictEqual(getToken(pcs, 'nowhere:3000'), null);
assert.strictEqual(pcs[0].name, 'STUDIO-PC');
savePcs(pcs);
assert.deepStrictEqual(loadPcs(), pcs);
pcs = dropToken(pcs, '10.0.0.5:3000');
assert.strictEqual(getToken(pcs, '10.0.0.5:3000'), null);
assert.strictEqual(pcs[0].name, 'STUDIO-PC');
assert.deepStrictEqual(removePc(pcs, '10.0.0.5:3000').map((p) => p.address), ['10.0.0.6:3000']);
assert.strictEqual(upsertPc(pcs, { address: '10.0.0.5:3000', name: 'X' }).length, 2);

const legacy = memory({ 'localdock.address': ' 192.168.1.20 ' });
useStorage(legacy);
const migrated = loadPcs();
assert.deepStrictEqual(migrated.map((p) => p.address), ['192.168.1.20']);
assert.strictEqual(legacy.getItem('localdock.address'), null);
assert.ok(legacy.getItem('localdock.pcs'));
assert.deepStrictEqual(loadPcs(), migrated);

useStorage(memory({ 'localdock.pcs': '{broken' }));
assert.deepStrictEqual(loadPcs(), []);
useStorage(memory({ 'localdock.pcs': JSON.stringify([{ address: 'a:1' }, { address: 'a:1' }, { nope: 1 }, null]) }));
assert.deepStrictEqual(loadPcs().map((p) => p.address), ['a:1']);

const broken = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  }
};
useStorage(broken);
assert.deepStrictEqual(loadPcs(), []);
assert.doesNotThrow(() => savePcs([{ address: 'a:1' }]));
assert.doesNotThrow(() => saveSettings({ theme: 'console' }));
assert.strictEqual(loadSettings().theme, 'glass');

useStorage(memory());
const defaults = { theme: 'glass', scene: 'aurora', perf: false, density: 8, labels: false, immersive: false, glass: 'frosted' };
assert.deepStrictEqual(loadSettings(), defaults);
saveSettings({ theme: 'console', scene: 'ember', perf: true, density: 6, labels: true, immersive: true, glass: 'smoked' });
assert.deepStrictEqual(loadSettings(), {
  theme: 'console',
  scene: 'ember',
  perf: true,
  density: 6,
  labels: true,
  immersive: true,
  glass: 'smoked'
});
assert.deepStrictEqual(
  sanitizeSettings({ theme: 'neon', scene: 'x', perf: 'yes', density: 5, labels: 'yes', immersive: 1, glass: 'mirror' }),
  defaults
);
useStorage(null);

const accel = accelerate(1, 0);
assert.strictEqual(accel.dx, 1);
const fast = accelerate(30, 0);
assert.ok(fast.dx > 30 && fast.dx <= 30 * 2.4);
assert.ok(accelerate(0, -30).dy < -30);

const sent = [];
const queue = [];
const coalescer = createCoalescer((e) => sent.push(e), (fn) => queue.push(fn));
coalescer.add(1.4, 0.4);
coalescer.add(1.4, 0.4);
coalescer.add(1.4, 0.4);
assert.strictEqual(queue.length, 1);
queue.shift()();
assert.deepStrictEqual(sent, [{ type: 'move', dx: 4, dy: 1 }]);
coalescer.add(0.9, 0);
queue.shift()();
assert.strictEqual(sent.length, 2);
assert.deepStrictEqual(sent[1], { type: 'move', dx: 1, dy: 0 });
coalescer.add(0.2, 0.2);
queue.shift()();
assert.strictEqual(sent.length, 2);
coalescer.add(900, -900);
queue.shift()();
assert.deepStrictEqual(sent[2], { type: 'move', dx: 200, dy: -200 });

const scrolls = [];
const scroller = createScroller((e) => scrolls.push(e), 20);
scroller.add(-10);
assert.strictEqual(scrolls.length, 0);
scroller.add(-10);
assert.deepStrictEqual(scrolls[0], { type: 'scroll', dx: 0, dy: 1 });
scroller.add(60);
assert.deepStrictEqual(scrolls[1], { type: 'scroll', dx: 0, dy: -3 });
scroller.add(100000);
assert.strictEqual(scrolls[2].dy, -20);

assert.deepStrictEqual(splitText('abc', 2), ['ab', 'c']);
assert.strictEqual(splitText('x'.repeat(450)).length, 3);
assert.deepStrictEqual(splitText('😀😀😀', 2), ['😀😀', '😀']);

console.log('logic tests passed');
