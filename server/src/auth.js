const crypto = require('crypto');

const MAX_ATTEMPTS = 5;
const IP_MAX_FAILS = 10;
const IP_WINDOW_MS = 5 * 60 * 1000;
const IP_BLOCK_MS = 60 * 1000;
const MAX_TOKENS = 100;
const MAX_TRACKED_IPS = 1000;

function generatePin() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createLockout(now = Date.now) {
  const entries = new Map();

  function entry(ip) {
    let e = entries.get(ip);
    if (!e) {
      if (entries.size >= MAX_TRACKED_IPS) entries.delete(entries.keys().next().value);
      e = { fails: [], blockedUntil: 0 };
      entries.set(ip, e);
    }
    return e;
  }

  return {
    blocked(ip) {
      const e = entries.get(ip);
      return Boolean(e) && e.blockedUntil > now();
    },
    fail(ip) {
      const e = entry(ip);
      const t = now();
      e.fails = e.fails.filter((x) => t - x < IP_WINDOW_MS);
      e.fails.push(t);
      if (e.fails.length >= IP_MAX_FAILS) {
        e.blockedUntil = t + IP_BLOCK_MS;
        e.fails = [];
      }
      return e.blockedUntil > t;
    },
    clear(ip) {
      entries.delete(ip);
    }
  };
}

function createAuth({ store, pin, now }) {
  const lockout = createLockout(now);

  function loadHashes() {
    const data = store.read('trusted.json', { tokens: [] });
    return Array.isArray(data.tokens) ? data.tokens.filter((t) => t && typeof t.hash === 'string') : [];
  }

  return {
    maxAttempts: MAX_ATTEMPTS,
    lockout,
    checkPin(candidate) {
      return typeof candidate === 'string' && /^\d{6}$/.test(candidate) && safeEqual(candidate, pin);
    },
    isTokenShape(candidate) {
      return typeof candidate === 'string' && /^[0-9a-f]{64}$/.test(candidate);
    },
    checkToken(candidate) {
      if (!this.isTokenShape(candidate)) return false;
      const hash = hashToken(candidate);
      let found = false;
      for (const t of loadHashes()) {
        if (safeEqual(t.hash, hash)) found = true;
      }
      return found;
    },
    trustedCount() {
      return loadHashes().length;
    },
    revokeAll() {
      store.write('trusted.json', { tokens: [] });
    },
    issueToken() {
      const token = crypto.randomBytes(32).toString('hex');
      const tokens = loadHashes();
      tokens.push({ hash: hashToken(token), created: Date.now() });
      store.write('trusted.json', { tokens: tokens.slice(-MAX_TOKENS) });
      return token;
    }
  };
}

module.exports = { generatePin, createAuth, createLockout, safeEqual, hashToken, MAX_ATTEMPTS };
