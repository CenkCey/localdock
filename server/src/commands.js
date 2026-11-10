const fs = require('fs');
const path = require('path');
const { runExclusive } = require('./lock');
const { normalizeHttpUrl } = require('./url');

const OK = { ok: true };
const BAD = { ok: false, error: 'BAD_PARAMS' };
const NOT_SUPPORTED = { ok: false, error: 'NOT_SUPPORTED' };
const NOT_FOUND = { ok: false, error: 'NOT_FOUND' };
const TOO_LARGE = { ok: false, error: 'TOO_LARGE' };

const MAX_SEND = 10000;
const MAX_SIGNATURE = 2 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const APP_RE = /^app_[0-9a-f]{6,10}$/;

function createCommands(ctx) {
  const { platform, caps, lock, executor, state, apps, layout, clipboard, capture, hub } = ctx;
  const exclusive = (task) => runExclusive(lock, task);

  async function setLevel(cap, payload, apply) {
    if (!caps[cap]) return NOT_SUPPORTED;
    const v = payload.value;
    if (!Number.isInteger(v) || v < 0 || v > 100) return BAD;
    const result = await exclusive(async () => {
      await apply(v);
      return OK;
    });
    if (result.ok) await state.refresh();
    return result;
  }

  async function launchFolder(ref) {
    if (typeof ref !== 'string' || ref.length < 1 || ref.length > 500 || /[\u0000-\u001f]/.test(ref)) return BAD;
    if (!path.isAbsolute(ref)) return BAD;
    let stat;
    try {
      stat = await fs.promises.stat(ref);
    } catch (e) {
      return NOT_FOUND;
    }
    if (!stat.isDirectory()) return NOT_FOUND;
    return exclusive(async () => {
      await platform.openFolder(ref);
      return OK;
    });
  }

  return {
    async EXEC_CMD(socket, p) {
      if (typeof p.action !== 'string') return BAD;
      const result = await executor.execute(p.action, p.params);
      if (result.ok) state.refresh().catch(() => {});
      return result;
    },

    SET_VOLUME: (socket, p) => setLevel('volume', p, (v) => platform.setVolume(v)),

    SET_BRIGHTNESS: (socket, p) => setLevel('brightness', p, (v) => platform.setBrightness(v)),

    async STATE_GET(socket) {
      await state.pushTo(socket);
      return OK;
    },

    async LAYOUT_GET(socket) {
      socket.emit('LAYOUT', { layout: layout.get() });
      return OK;
    },

    async LAYOUT_SET(socket, p) {
      await apps.ready();
      const checked = layout.validate(p.layout);
      if (!checked.ok) return BAD;
      layout.set(checked.layout);
      hub.broadcast('LAYOUT', { layout: checked.layout }, socket.id);
      return OK;
    },

    async APPS_GET(socket, p) {
      if (p.refresh !== undefined && typeof p.refresh !== 'boolean') return BAD;
      if (p.refresh) await apps.rescan();
      else await apps.ready();
      socket.emit('APPS', { apps: apps.list() });
      return OK;
    },

    async LAUNCH(socket, p) {
      if (!caps.apps) return NOT_SUPPORTED;
      if (p.kind === 'app') {
        if (typeof p.ref !== 'string' || !APP_RE.test(p.ref)) return BAD;
        await apps.ready();
        const app = apps.get(p.ref);
        if (!app) return NOT_FOUND;
        return exclusive(async () => {
          await platform.launchApp(app.path);
          return OK;
        });
      }
      if (p.kind === 'folder') return launchFolder(p.ref);
      if (p.kind === 'url') {
        const href = normalizeHttpUrl(p.ref);
        if (!href) return BAD;
        return exclusive(async () => {
          await platform.openUrl(href);
          return OK;
        });
      }
      return BAD;
    },

    async CLIPBOARD_GET(socket) {
      socket.emit('CLIPBOARD', { items: clipboard.list() });
      return OK;
    },

    async CLIPBOARD_PASTE(socket, p) {
      if (!caps.clipboard) return NOT_SUPPORTED;
      if (typeof p.itemId !== 'string' || p.itemId.length > 40) return BAD;
      const item = clipboard.find(p.itemId);
      if (!item) return NOT_FOUND;
      return exclusive(async () => {
        await platform.setClipboardText(item.text);
        await platform.paste();
        return OK;
      });
    },

    async CLIPBOARD_SEND(socket, p) {
      if (!caps.clipboard) return NOT_SUPPORTED;
      if (typeof p.text !== 'string' || p.text.length === 0) return BAD;
      if (p.paste !== undefined && typeof p.paste !== 'boolean') return BAD;
      if (p.text.length > MAX_SEND) return TOO_LARGE;
      return exclusive(async () => {
        await platform.setClipboardText(p.text);
        if (p.paste) await platform.paste();
        return OK;
      });
    },

    async CAPTURE_SCREENSHOT() {
      if (!caps.capture) return NOT_SUPPORTED;
      return exclusive(async () => {
        const shot = await capture.screenshot();
        return { ok: true, file: shot.file, thumb: shot.thumb };
      });
    },

    async SIGNATURE_SEND(socket, p) {
      if (!caps.capture) return NOT_SUPPORTED;
      if (typeof p.png !== 'string' || p.png.length === 0) return BAD;
      if (p.insert !== undefined && typeof p.insert !== 'boolean') return BAD;
      if (Math.floor((p.png.length * 3) / 4) > MAX_SIGNATURE + 3) return TOO_LARGE;
      if (p.png.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(p.png)) return BAD;
      const buffer = Buffer.from(p.png, 'base64');
      if (buffer.length > MAX_SIGNATURE) return TOO_LARGE;
      if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, 8).equals(PNG_MAGIC)) return BAD;
      return exclusive(async () => {
        const saved = await capture.signature(buffer, p.insert === true);
        return { ok: true, file: saved.file };
      });
    }
  };
}

module.exports = { createCommands };
