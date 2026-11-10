const os = require('os');
const path = require('path');

const DEV = process.env.LOCALDOCK_DEV === '1';
const IS_WINDOWS = process.platform === 'win32';

function resolveDataDir() {
  if (process.env.LOCALDOCK_DATA) return path.resolve(process.env.LOCALDOCK_DATA);
  if (IS_WINDOWS && !DEV && process.env.APPDATA) return path.join(process.env.APPDATA, 'LocalDock');
  return path.join(__dirname, '..', 'data');
}

module.exports = {
  DEV,
  IS_WINDOWS,
  VERSION: '2.0.0',
  PORT: Number(process.env.PORT) || 3000,
  HOST: '0.0.0.0',
  PIN_LENGTH: 6,
  NAME: os.hostname(),
  DATA_DIR: resolveDataDir()
};
