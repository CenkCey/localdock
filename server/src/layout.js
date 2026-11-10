const { ACTION_NAMES, isAction } = require('./actions');
const { normalizeHttpUrl } = require('./url');

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const APP_RE = /^app_[0-9a-f]{6,10}$/;
const KINDS = ['action', 'app', 'folder', 'url'];
const MAX_PAGES = 12;
const MAX_TILES = 64;
const MAX_REF = 500;
const MAX_LABEL = 60;

function isPlain(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateTile(tile, hasApp, seen) {
  if (!isPlain(tile)) return null;
  if (typeof tile.id !== 'string' || !ID_RE.test(tile.id) || seen.has(tile.id)) return null;
  if (!KINDS.includes(tile.kind)) return null;
  if (typeof tile.ref !== 'string' || tile.ref.length < 1 || tile.ref.length > MAX_REF) return null;
  let label = tile.label === undefined ? null : tile.label;
  if (label !== null && (typeof label !== 'string' || label.length > MAX_LABEL)) return null;
  if (tile.kind === 'action' && !isAction(tile.ref)) return null;
  if (tile.kind === 'app' && (!APP_RE.test(tile.ref) || !hasApp(tile.ref))) return null;
  if (tile.kind === 'url' && !normalizeHttpUrl(tile.ref)) return null;
  if (tile.kind === 'folder' && /[\u0000-\u001f]/.test(tile.ref)) return null;
  seen.add(tile.id);
  return { id: tile.id, kind: tile.kind, ref: tile.ref, label };
}

function validateLayout(layout, hasApp) {
  if (!isPlain(layout) || layout.version !== 1) return { ok: false };
  if (!Array.isArray(layout.pages) || layout.pages.length < 1 || layout.pages.length > MAX_PAGES) {
    return { ok: false };
  }
  const pageIds = new Set();
  const pages = [];
  for (const page of layout.pages) {
    if (!isPlain(page) || typeof page.id !== 'string' || !ID_RE.test(page.id) || pageIds.has(page.id)) {
      return { ok: false };
    }
    if (!Array.isArray(page.tiles) || page.tiles.length > MAX_TILES) return { ok: false };
    pageIds.add(page.id);
    const seen = new Set();
    const tiles = [];
    for (const tile of page.tiles) {
      const clean = validateTile(tile, hasApp, seen);
      if (!clean) return { ok: false };
      tiles.push(clean);
    }
    pages.push({ id: page.id, tiles });
  }
  return { ok: true, layout: { version: 1, pages } };
}

function defaultLayout() {
  const pages = [];
  let n = 0;
  for (let i = 0; i < ACTION_NAMES.length; i += 8) {
    const tiles = ACTION_NAMES.slice(i, i + 8).map((ref) => {
      n += 1;
      return { id: `t${n}`, kind: 'action', ref, label: null };
    });
    pages.push({ id: `p${pages.length + 1}`, tiles });
  }
  return { version: 1, pages };
}

function createLayout({ store, apps }) {
  let current = null;
  const stored = store.read('layout.json', null);
  const checked = stored ? validateLayout(stored, () => true) : { ok: false };
  current = checked.ok ? checked.layout : defaultLayout();

  return {
    get() {
      return current;
    },
    validate(layout) {
      return validateLayout(layout, (id) => apps.has(id));
    },
    set(layout) {
      store.write('layout.json', layout);
      current = layout;
    }
  };
}

module.exports = { createLayout, validateLayout, defaultLayout };
