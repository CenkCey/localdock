const crypto = require('crypto');

function createHub() {
  const sockets = new Map();
  const keys = new Map();
  const meta = new Map();

  return {
    add(socket) {
      const key = crypto.randomBytes(16).toString('hex');
      sockets.set(socket.id, socket);
      keys.set(socket.id, key);
      meta.set(socket.id, { ip: String(socket.handshake.address || '').replace(/^::ffff:/, ''), since: Date.now() });
      return key;
    },
    remove(socket) {
      sockets.delete(socket.id);
      keys.delete(socket.id);
      meta.delete(socket.id);
    },
    list() {
      return [...meta.values()];
    },
    disconnectAll() {
      for (const socket of [...sockets.values()]) socket.disconnect(true);
    },
    size() {
      return sockets.size;
    },
    broadcast(event, payload, exceptId) {
      for (const [id, socket] of sockets) {
        if (id !== exceptId) socket.emit(event, payload);
      }
    },
    validKey(candidate) {
      if (typeof candidate !== 'string' || candidate.length !== 32) return false;
      const given = Buffer.from(candidate);
      let found = false;
      for (const key of keys.values()) {
        if (crypto.timingSafeEqual(given, Buffer.from(key))) found = true;
      }
      return found;
    }
  };
}

module.exports = { createHub };
