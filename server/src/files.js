const fs = require('fs');
const path = require('path');

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_NAME = 150;

function sanitizeName(raw) {
  let name = String(raw === undefined || raw === null ? '' : raw).normalize('NFC');
  name = name.replace(/\\/g, '/').split('/').pop();
  name = name.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '');
  name = name.trim().replace(/[. ]+$/, '');
  if (name === '' || /^\.+$/.test(name)) name = 'upload';
  const dot = name.indexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  if (RESERVED.test(stem.trim())) name = `_${name}`;
  if (name.length > MAX_NAME) {
    const ext = path.extname(name);
    const keepExt = ext.length <= 20 ? ext : '';
    name = name.slice(0, MAX_NAME - keepExt.length) + keepExt;
    name = name.replace(/[. ]+$/, '') || 'upload';
  }
  return name;
}

async function reserveFile(dir, name) {
  await fs.promises.mkdir(dir, { recursive: true });
  const ext = path.extname(name);
  const base = ext ? name.slice(0, -ext.length) : name;
  for (let i = 0; i < 10000; i += 1) {
    const candidate = i === 0 ? name : `${base} (${i})${ext}`;
    const filePath = path.join(dir, candidate);
    try {
      const handle = await fs.promises.open(filePath, 'wx');
      await handle.close();
      return { name: candidate, filePath };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  throw new Error('no free file name');
}

function stamp(date = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

module.exports = { sanitizeName, reserveFile, stamp };
