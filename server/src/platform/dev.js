const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { solidPng, TINY_JPEG } = require('./png');

const APP_NAMES = [
  'Visual Studio Code', 'Google Chrome', 'Mozilla Firefox', 'Spotify', 'Discord', 'Steam',
  'Notepad++', 'VLC media player', 'Slack', 'OBS Studio', 'Paint', 'Windows Terminal', 'Zoom', 'Blender'
];

const TRACKS = [
  { title: 'Golden Hour Drive', artist: 'The Sample Tapes' },
  { title: 'Night Signal', artist: 'Low Orbit' },
  { title: 'Paper Planes', artist: 'Harbor Lights' }
];

function create(config) {
  const tmp = path.join(config.DATA_DIR, 'tmp');
  const delay = Number(process.env.LOCALDOCK_DEV_DELAY_MS) || 0;
  const noBrightness = process.env.LOCALDOCK_DEV_NO_BRIGHTNESS === '1';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const fake = { volume: 30, muted: false, brightness: 70, track: 0, status: 'playing' };
  const log = { input: [], actions: [], launched: [], pastes: 0, clipboard: null, clipboardImage: null };
  let watcher = null;

  function mediaState() {
    const t = TRACKS[fake.track];
    return { status: fake.status, title: t.title, artist: t.artist, thumb: TINY_JPEG };
  }

  const platform = {
    dirs: {
      pictures: path.join(tmp, 'Pictures'),
      downloads: path.join(tmp, 'Downloads')
    },

    async init() {
      fs.mkdirSync(platform.dirs.pictures, { recursive: true });
      fs.mkdirSync(platform.dirs.downloads, { recursive: true });
      return {
        volume: true,
        brightness: !noBrightness,
        media: true,
        input: true,
        clipboard: true,
        capture: true,
        upload: true,
        apps: true
      };
    },

    close() {},

    async runAction(name, steps) {
      if (delay) await sleep(delay);
      log.actions.push({ name, steps });
      if (name === 'VOLUME_UP') fake.volume = Math.min(100, fake.volume + steps * 2);
      if (name === 'VOLUME_DOWN') fake.volume = Math.max(0, fake.volume - steps * 2);
      if (name === 'VOLUME_MUTE') fake.muted = !fake.muted;
      if (name === 'MEDIA_PLAY_PAUSE') fake.status = fake.status === 'playing' ? 'paused' : 'playing';
      if (name === 'MEDIA_NEXT') fake.track = (fake.track + 1) % TRACKS.length;
      if (name === 'MEDIA_PREV') fake.track = (fake.track + TRACKS.length - 1) % TRACKS.length;
    },

    async getVolume() {
      return { volume: fake.volume, muted: fake.muted };
    },

    async setVolume(value) {
      fake.volume = value;
      if (value > 0) fake.muted = false;
    },

    async getBrightness() {
      return noBrightness ? null : fake.brightness;
    },

    async setBrightness(value) {
      fake.brightness = value;
    },

    async getMedia() {
      return mediaState();
    },

    input(event) {
      log.input.push(event);
    },

    watchClipboard(callback) {
      watcher = callback;
    },

    simulateCopy(text) {
      if (watcher) watcher(text);
    },

    async setClipboardText(text) {
      log.clipboard = text;
      if (watcher) watcher(text);
    },

    async setClipboardImage(file) {
      log.clipboardImage = path.basename(file);
    },

    async paste() {
      log.pastes += 1;
    },

    async screenshot(filePath) {
      await fs.promises.writeFile(filePath, solidPng(64, 36, [40, 90, 160]));
      return TINY_JPEG;
    },

    async scanApps() {
      return APP_NAMES.map((name) => ({
        name,
        path: `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\${name}.lnk`
      }));
    },

    async extractIcon(appPath, out) {
      const h = crypto.createHash('sha1').update(appPath).digest();
      await fs.promises.writeFile(out, solidPng(64, 64, [h[0], h[1], h[2]]));
    },

    async launchApp(appPath) {
      log.launched.push({ kind: 'app', ref: appPath });
    },

    async openFolder(folder) {
      log.launched.push({ kind: 'folder', ref: folder });
    },

    async openUrl(url) {
      log.launched.push({ kind: 'url', ref: url });
    },

    log() {
      return log;
    },

    setFake(values) {
      for (const key of ['volume', 'brightness']) {
        if (Number.isInteger(values[key])) fake[key] = values[key];
      }
    }
  };

  return platform;
}

module.exports = { create };
