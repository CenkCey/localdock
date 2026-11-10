const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha1(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

function createApps({ platform, store }) {
  let byId = new Map();
  let sorted = [];
  let scanning = null;
  const iconJobs = new Map();

  function build(found) {
    const names = new Set();
    const next = new Map();
    const ordered = found
      .filter((a) => a && typeof a.name === 'string' && typeof a.path === 'string' && a.name.trim() !== '')
      .sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
    for (const a of ordered) {
      const key = a.name.trim().toLowerCase();
      if (names.has(key)) continue;
      const hash = sha1(a.path.toLowerCase());
      let id = `app_${hash.slice(0, 8)}`;
      if (next.has(id)) id = `app_${hash.slice(0, 10)}`;
      if (next.has(id)) continue;
      names.add(key);
      next.set(id, { id, name: a.name.trim(), path: a.path });
    }
    byId = next;
    console.log(`[apps] ${next.size} apps found (${[...next.values()].filter((a) => a.path.startsWith('uwp:')).length} from the Store)`);
    sorted = [...next.values()].sort(
      (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)
    );
  }

  function rescan() {
    if (!scanning) {
      scanning = Promise.resolve()
        .then(() => platform.scanApps())
        .then(build)
        .catch((e) => console.warn(`[apps] scan failed: ${e.message}`))
        .finally(() => {
          scanning = null;
        });
    }
    return scanning;
  }

  const initial = rescan();

  async function iconFile(id) {
    const app = byId.get(id);
    if (!app) return null;
    const file = path.join(store.iconsDir, `${id}.png`);
    if (fs.existsSync(file)) return file;
    if (!iconJobs.has(id)) {
      const tmp = `${file}.tmp`;
      const job = platform
        .extractIcon(app.path, tmp)
        .then(() => {
          fs.renameSync(tmp, file);
          return file;
        })
        .catch(() => {
          fs.rm(tmp, { force: true }, () => {});
          return null;
        })
        .finally(() => iconJobs.delete(id));
      iconJobs.set(id, job);
    }
    return iconJobs.get(id);
  }

  const ACTION_EXE = {
    OPEN_CMD: 'cmd.exe',
    OPEN_CALC: 'calc.exe',
    OPEN_TASKMGR: 'taskmgr.exe'
  };

  async function actionIconFile(action) {
    const exe = ACTION_EXE[action];
    if (!exe) return null;
    const file = path.join(store.iconsDir, `${action}.png`);
    if (fs.existsSync(file)) return file;
    const key = `act_${action}`;
    if (!iconJobs.has(key)) {
      const tmp = `${file}.tmp`;
      const root = process.env.SystemRoot || 'C:\\Windows';
      const full = path.join(root, 'System32', exe);
      const job = platform
        .extractIcon(full, tmp)
        .then(() => {
          fs.renameSync(tmp, file);
          return file;
        })
        .catch(() => {
          fs.rm(tmp, { force: true }, () => {});
          return null;
        })
        .finally(() => iconJobs.delete(key));
      iconJobs.set(key, job);
    }
    return iconJobs.get(key);
  }

  return {
    actionIconFile,
    ready: () => initial,
    rescan,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id) || null,
    list: () => sorted.map((a) => ({ id: a.id, name: a.name })),
    iconFile
  };
}

module.exports = { createApps };
