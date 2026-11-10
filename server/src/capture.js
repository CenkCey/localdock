const fs = require('fs');
const path = require('path');
const { reserveFile, stamp } = require('./files');

function createCapture({ platform }) {
  const root = () => path.join(platform.dirs.pictures, 'LocalDock');

  async function screenshot() {
    const slot = await reserveFile(root(), `screenshot-${stamp()}.png`);
    try {
      const thumb = await platform.screenshot(slot.filePath);
      return { file: slot.name, thumb };
    } catch (e) {
      fs.rm(slot.filePath, { force: true }, () => {});
      throw e;
    }
  }

  async function signature(buffer, insert) {
    const slot = await reserveFile(path.join(root(), 'Signatures'), `signature-${stamp()}.png`);
    try {
      await fs.promises.writeFile(slot.filePath, buffer);
      if (insert) {
        await platform.setClipboardImage(slot.filePath);
        await platform.paste();
      }
    } catch (e) {
      fs.rm(slot.filePath, { force: true }, () => {});
      throw e;
    }
    return { file: slot.name };
  }

  return { screenshot, signature };
}

module.exports = { createCapture };
