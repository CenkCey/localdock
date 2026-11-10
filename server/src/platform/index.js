const config = require('../config');

function createPlatform() {
  if (config.DEV) return require('./dev').create(config);
  if (config.IS_WINDOWS) return require('./windows').create(config);
  throw new Error('LocalDock server only runs on Windows.');
}

module.exports = { createPlatform };
