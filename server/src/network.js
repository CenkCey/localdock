const os = require('os');

function isPrivate(address) {
  return (
    address.startsWith('192.168.') ||
    address.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

function getLocalIPv4() {
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal) {
        candidates.push({ name, address: info.address });
      }
    }
  }
  const physical = candidates.filter(
    (c) => isPrivate(c.address) && !/vethernet|virtualbox|vmware|wsl|docker|hyper-v|loopback/i.test(c.name)
  );
  const pick = physical[0] || candidates.find((c) => isPrivate(c.address)) || candidates[0];
  return pick ? pick.address : null;
}

module.exports = { getLocalIPv4 };
