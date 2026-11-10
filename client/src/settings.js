export const DEFAULT_SETTINGS = {
  theme: 'glass',
  scene: 'aurora',
  perf: false,
  density: 8,
  labels: false,
  immersive: false,
  glass: 'frosted'
};

export const GLASS_STYLES = ['clear', 'frosted', 'smoked'];

export const DENSITIES = [4, 6, 8];
export const THEMES = ['console', 'glass'];
export const SCENE_IDS = ['aurora', 'midnight', 'lagoon', 'prism', 'dusk', 'ember', 'forest', 'slate'];

const SETTINGS_KEY = 'localdock.settings';
const PCS_KEY = 'localdock.pcs';
const LEGACY_ADDRESS_KEY = 'localdock.address';

let override = null;

export function useStorage(storage) {
  override = storage;
}

function store() {
  if (override) return override;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readJson(key, fallback) {
  try {
    const s = store();
    if (!s) return fallback;
    const raw = s.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value === null || value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    const s = store();
    if (s) s.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function sanitizeSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    theme: THEMES.includes(source.theme) ? source.theme : DEFAULT_SETTINGS.theme,
    scene: SCENE_IDS.includes(source.scene) ? source.scene : DEFAULT_SETTINGS.scene,
    perf: source.perf === true,
    density: DENSITIES.includes(source.density) ? source.density : DEFAULT_SETTINGS.density,
    labels: source.labels === true,
    immersive: source.immersive === true,
    glass: GLASS_STYLES.includes(source.glass) ? source.glass : DEFAULT_SETTINGS.glass
  };
}

export function loadSettings() {
  return sanitizeSettings(readJson(SETTINGS_KEY, null));
}

export function saveSettings(settings) {
  writeJson(SETTINGS_KEY, sanitizeSettings(settings));
}

export function sanitizePcs(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const item of input) {
    if (!item || typeof item.address !== 'string' || !item.address || seen.has(item.address)) continue;
    seen.add(item.address);
    out.push({
      address: item.address,
      name: typeof item.name === 'string' ? item.name : '',
      platform: typeof item.platform === 'string' ? item.platform : '',
      token: typeof item.token === 'string' && item.token ? item.token : null,
      lastSeen: Number(item.lastSeen) || 0
    });
  }
  return out;
}

export function loadPcs() {
  const existing = readJson(PCS_KEY, null);
  if (Array.isArray(existing)) return sanitizePcs(existing);
  let legacy = '';
  try {
    const s = store();
    legacy = (s && s.getItem(LEGACY_ADDRESS_KEY)) || '';
  } catch {
    legacy = '';
  }
  const trimmed = legacy.trim();
  if (!trimmed) return [];
  const migrated = [{ address: trimmed, name: '', platform: '', token: null, lastSeen: 0 }];
  writeJson(PCS_KEY, migrated);
  try {
    const s = store();
    if (s) s.removeItem(LEGACY_ADDRESS_KEY);
  } catch {
    return migrated;
  }
  return migrated;
}

export function savePcs(pcs) {
  writeJson(PCS_KEY, sanitizePcs(pcs));
}

export function upsertPc(pcs, patch) {
  const index = pcs.findIndex((pc) => pc.address === patch.address);
  if (index === -1) {
    return [...pcs, { name: '', platform: '', token: null, lastSeen: 0, ...patch }];
  }
  const next = pcs.slice();
  next[index] = { ...next[index], ...patch };
  return next;
}

export function removePc(pcs, address) {
  return pcs.filter((pc) => pc.address !== address);
}

export function getToken(pcs, address) {
  const pc = pcs.find((item) => item.address === address);
  return pc && pc.token ? pc.token : null;
}

export function setToken(pcs, address, token) {
  return upsertPc(pcs, { address, token });
}

export function dropToken(pcs, address) {
  return pcs.map((pc) => (pc.address === address ? { ...pc, token: null } : pc));
}
