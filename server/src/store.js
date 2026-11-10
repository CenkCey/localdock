const fs = require('fs');
const path = require('path');

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const iconsDir = path.join(dir, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  return {
    dir,
    iconsDir,
    read(name, fallback) {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      } catch (e) {
        return fallback;
      }
    },
    write(name, data) {
      const file = path.join(dir, name);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, file);
    }
  };
}

module.exports = { createStore };
