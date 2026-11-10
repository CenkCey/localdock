const { exec, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { codedError } = require('../lock');
const { createWorker } = require('./psworker');
const { windowsCommand } = require('./commands');

const EXEC_TIMEOUT_MS = 8000;
const SCAN_DEPTH = 6;

function runShell(command) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: EXEC_TIMEOUT_MS, windowsHide: true }, (err) => {
      if (!err) {
        resolve();
        return;
      }
      reject(codedError(err.killed ? 'TIMEOUT' : 'EXEC_FAILED'));
    });
  });
}

function launch(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (e) {}
    }, 10000);
    child.once('error', () => {
      clearTimeout(timer);
      reject(codedError('EXEC_FAILED'));
    });
    child.once('exit', () => clearTimeout(timer));
    child.once('spawn', () => {
      child.unref();
      timer.unref();
      resolve();
    });
  });
}

const SKIP_DIRS = /^(administrative tools|accessibility|accessories|system tools|startup|maintenance|windows (accessories|administrative tools|ease of access|powershell|system|tools))$/i;
const SKIP_NAMES = /uninstall|command prompt|powershell|\bcmd\b|command line|documentation|\bdocs?\b|manual|read ?me|release notes|licen[sc]e|install(er|ation)? manager|app recovery|administrative tools|recovery|\bhelp\b|\bsetup\b|installer|updater|update (tool|manager)|repair|website|web site|\bsupport\b|\bsdk\b|native tools|cross tools|developer (command|powershell)|diagnos|debug/i;
const SKIP_TARGET = /unins|uninst|setup|install|repair|recover|crash|migrat|diag/i;
const KEEP_SYSTEM = /^(notepad|mspaint|explorer|snippingtool|wordpad)\.exe$/i;

function keepTarget(target) {
  if (!target) return true;
  if (!/\.exe$/i.test(target)) return false;
  const base = path.basename(target);
  const win = String(process.env.SystemRoot || 'C:\\Windows').toLowerCase();
  if (target.toLowerCase().startsWith(`${win}\\`) && !KEEP_SYSTEM.test(base)) return false;
  return !SKIP_TARGET.test(base);
}

const SKIP_UWP = /^(get help|tips|feedback hub|cortana|quick assist|narrator|magnifier|mixed reality portal|windows backup|windows security|microsoft edge game assist|xbox identity provider)$/i;

async function walk(dir, depth, out) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < SCAN_DEPTH && !SKIP_DIRS.test(entry.name)) await walk(full, depth + 1, out);
    } else if (entry.isFile() && /\.lnk$/i.test(entry.name)) {
      const name = entry.name.slice(0, -4);
      if (!SKIP_NAMES.test(name)) out.push({ name, path: full });
    }
  }
}

const HELPER_EXE = path.join(__dirname, '..', '..', 'helper', 'bin', 'LocalDock.Helper.exe');

function createSysWorker() {
  if (!fs.existsSync(HELPER_EXE)) {
    console.error('[helper] LocalDock.Helper.exe not found. Run build-helper.bat in the server folder to build it.');
    return {
      ensure: () => Promise.reject(codedError('EXEC_FAILED', 'helper missing')),
      request: () => Promise.reject(codedError('EXEC_FAILED', 'helper missing')),
      send() {},
      close() {}
    };
  }
  return createWorker({ command: HELPER_EXE, args: [], captureStderr: true });
}

function create() {
  const home = process.env.USERPROFILE || os.homedir();
  const sys = createSysWorker();
  const inp = createWorker({ script: path.join(__dirname, 'ps', 'input.ps1') });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const timers = [];
  const uwpLogos = new Map();
  const ask = (cmd, extra, timeoutMs) => sys.request({ cmd, ...extra }, timeoutMs);

  const platform = {
    dirs: {
      pictures: path.join(home, 'Pictures'),
      downloads: path.join(home, 'Downloads')
    },

    async init() {
      const caps = {
        volume: false,
        brightness: false,
        media: false,
        input: false,
        clipboard: false,
        capture: false,
        upload: true,
        apps: true
      };
      const [sysOk, inputOk] = await Promise.all([
        sys.ensure().then(() => true, () => false),
        inp.ensure().then(() => true, () => false)
      ]);
      caps.input = inputOk;
      if (sysOk) {
        caps.clipboard = true;
        caps.capture = true;
        caps.volume = await ask('vol_get').then(() => true, () => false);
        caps.brightness = await ask('bri_get').then((v) => typeof v === 'number', () => false);
        caps.media = await ask('media_ok').then((v) => v === true, () => false);
      }
      return caps;
    },

    close() {
      timers.forEach(clearInterval);
      sys.close();
      inp.close();
    },

    async runAction(name, steps) {
      const command = windowsCommand(name, steps);
      if (!command) throw codedError('BAD_PARAMS');
      await runShell(command);
    },

    async getVolume() {
      return ask('vol_get');
    },

    async setVolume(value) {
      await ask('vol_set', { value });
    },

    async getBrightness() {
      return ask('bri_get');
    },

    async setBrightness(value) {
      await ask('bri_set', { value });
    },

    async getMedia() {
      return ask('media', {}, 20000);
    },

    input(event) {
      switch (event.type) {
        case 'move':
          inp.send(`M ${event.dx} ${event.dy}`);
          break;
        case 'click':
          inp.send(`C ${event.button} ${event.count}`);
          break;
        case 'down':
          inp.send(`D ${event.button}`);
          break;
        case 'up':
          inp.send(`U ${event.button}`);
          break;
        case 'scroll':
          inp.send(`S ${event.dx} ${event.dy}`);
          break;
        case 'zoom':
          inp.send(`Z ${event.dy}`);
          break;
        case 'key':
          inp.send(`K ${event.key}`);
          break;
        case 'text':
          inp.send(`T ${Buffer.from(event.text, 'utf8').toString('base64')}`);
          break;
        default:
      }
    },

    watchClipboard(callback) {
      let last = null;
      let pending = false;
      const timer = setInterval(async () => {
        if (pending) return;
        pending = true;
        try {
          const text = await ask('clip_get', {}, 5000);
          if (typeof text === 'string' && text !== last) {
            last = text;
            callback(text);
          }
        } catch (e) {
        } finally {
          pending = false;
        }
      }, 1000);
      timers.push(timer);
    },

    async setClipboardText(text) {
      await ask('clip_set', { b64: Buffer.from(text, 'utf8').toString('base64') });
    },

    async setClipboardImage(file) {
      await ask('clip_img', { path: file });
    },

    async paste() {
      inp.send('P');
      await sleep(200);
    },

    async screenshot(filePath) {
      const b64 = await ask('shot', { path: filePath }, 30000);
      return typeof b64 === 'string' && b64 ? `data:image/jpeg;base64,${b64}` : null;
    },

    async scanApps() {
      const rel = path.join('Microsoft', 'Windows', 'Start Menu', 'Programs');
      const roots = [process.env.ProgramData, process.env.APPDATA]
        .filter(Boolean)
        .map((base) => path.join(base, rel));
      const out = [];
      for (const root of roots) await walk(root, 0, out);
      let targets = null;
      try {
        targets = await ask('lnk_targets', { paths: out.map((a) => a.path) }, 45000);
      } catch (e) {
        targets = null;
      }
      const kept = targets && typeof targets === 'object' ? out.filter((a) => keepTarget(targets[a.path])) : out;
      out.length = 0;
      out.push(...kept);
      try {
        const uwp = await ask('uwp_apps', {}, 45000);
        const list = Array.isArray(uwp) ? uwp : uwp && uwp.name ? [uwp] : [];
        for (const a of list) {
          if (!a || !a.name || !a.id || SKIP_UWP.test(a.name)) continue;
          const key = `uwp:${a.id}`;
          uwpLogos.set(key, { logo: a.logo, bg: a.bg || '' });
          out.push({ name: a.name, path: key });
        }
      } catch (e) {
        return out;
      }
      return out;
    },

    async extractIcon(appPath, out) {
      const meta = uwpLogos.get(appPath);
      if (meta && meta.logo) {
        await ask('icon_plated', { src: meta.logo, out, bg: meta.bg }, 20000);
        return;
      }
      await ask('icon', { path: appPath, out }, 20000);
    },

    launchApp(appPath) {
      if (appPath.startsWith('uwp:')) return launch('explorer.exe', [`shell:AppsFolder\\${appPath.slice(4)}`]);
      return launch('explorer.exe', [appPath]);
    },

    openFolder(folder) {
      return launch('explorer.exe', [folder]);
    },

    openUrl(url) {
      return launch('explorer.exe', [url]);
    }
  };

  return platform;
}

module.exports = { create };
