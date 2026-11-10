import { io } from 'socket.io-client';
import { parseAddress, isValidPin, DEFAULT_PIN_LENGTH } from './protocol.js';

const PUSH_EVENTS = ['STATE', 'LAYOUT', 'APPS', 'CLIPBOARD'];
const DEFAULT_TIMEOUT = 8000;

export function createDockClient({ onStatus }) {
  let socket = null;
  let seq = 0;
  let status = 'idle';
  let target = null;
  let caps = {};
  let httpKeyValue = null;
  let pinLength = DEFAULT_PIN_LENGTH;
  let tokenPending = false;
  let badTokenSeen = false;
  const pending = new Map();
  const listeners = new Map();
  const cache = new Map();

  function set(next, extra = {}) {
    status = next;
    onStatus({
      status: next,
      error: null,
      attemptsLeft: null,
      token: null,
      badToken: false,
      pinLength,
      ...extra
    });
  }

  function dispatch(event, payload) {
    const set_ = listeners.get(event);
    if (set_) set_.forEach((fn) => fn(payload));
  }

  function failPending(error) {
    pending.forEach((entry, id) => {
      clearTimeout(entry.timer);
      entry.resolve({ id, ok: false, error });
    });
    pending.clear();
  }

  function teardown() {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    failPending('DISCONNECTED');
    cache.clear();
    caps = {};
    httpKeyValue = null;
    tokenPending = false;
    badTokenSeen = false;
  }

  function connect(address, token) {
    teardown();
    target = parseAddress(address);
    if (!target) {
      set('error', { error: 'INVALID_ADDRESS', actions: [], caps: {} });
      return;
    }
    set('connecting', { address: `${target.host}:${target.port}`, actions: [], caps: {}, name: '' });
    const s = io(target.url, { transports: ['websocket'], reconnection: false, timeout: 5000 });
    socket = s;

    s.on('connect', () => {
      if (socket !== s || !token) return;
      tokenPending = true;
      s.emit('AUTH', { token });
    });

    s.on('connect_error', () => {
      if (socket !== s) return;
      teardown();
      set('error', { error: 'UNREACHABLE' });
    });

    s.on('PIN_REQ', (payload) => {
      if (socket !== s) return;
      if (payload && Number(payload.pinLength) > 0) pinLength = Number(payload.pinLength);
      if (tokenPending) return;
      set('pin', {
        attemptsLeft: payload && payload.attemptsLeft,
        badToken: badTokenSeen,
        name: (payload && payload.name) || ''
      });
    });

    s.on('AUTH_RESULT', (result) => {
      if (socket !== s || !result) return;
      if (result.ok) {
        tokenPending = false;
        caps = result.caps || {};
        httpKeyValue = result.httpKey || null;
        set('ready', {
          actions: result.actions || [],
          caps,
          name: result.name || '',
          token: result.token || null,
          httpBase: target.url,
          httpKey: httpKeyValue
        });
        return;
      }
      if (result.error === 'BAD_TOKEN') {
        tokenPending = false;
        badTokenSeen = true;
        set('pin', { badToken: true });
        return;
      }
      if (result.error === 'TOO_MANY_ATTEMPTS') {
        teardown();
        set('error', { error: 'TOO_MANY_ATTEMPTS' });
        return;
      }
      set('pin', { error: result.error, attemptsLeft: result.attemptsLeft, errorAt: Date.now() });
    });

    s.on('EXEC_RESULT', (result) => {
      if (!result) return;
      const entry = pending.get(result.id);
      if (!entry) return;
      pending.delete(result.id);
      clearTimeout(entry.timer);
      entry.resolve({ ...result, error: result.error || null });
    });

    PUSH_EVENTS.forEach((event) => {
      s.on(event, (payload) => {
        if (socket !== s) return;
        cache.set(event, payload);
        dispatch(event, payload);
      });
    });

    s.on('disconnect', () => {
      if (socket !== s) return;
      teardown();
      set('error', { error: 'DISCONNECTED' });
    });
  }

  function submitPin(pin) {
    if (!socket || status !== 'pin' || !isValidPin(pin, pinLength)) return false;
    socket.emit('AUTH', { pin });
    return true;
  }

  function request(event, payload = {}, timeout = DEFAULT_TIMEOUT) {
    if (!socket || status !== 'ready') {
      return Promise.resolve({ ok: false, error: 'NOT_CONNECTED' });
    }
    seq += 1;
    const id = `c${seq}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ id, ok: false, error: 'TIMEOUT' });
      }, timeout);
      pending.set(id, { resolve, timer });
      socket.emit(event, { ...payload, id });
    });
  }

  function exec(action, params) {
    return request('EXEC_CMD', params ? { action, params } : { action });
  }

  function sendInput(payload) {
    if (!socket || status !== 'ready' || !caps.input) return false;
    socket.emit('INPUT', payload);
    return true;
  }

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  }

  function last(event) {
    return cache.get(event);
  }

  function disconnect() {
    teardown();
    set('idle', { actions: [], caps: {}, name: '' });
  }

  return {
    connect,
    submitPin,
    request,
    exec,
    sendInput,
    on,
    last,
    disconnect,
    httpBase: () => (target ? target.url : null),
    httpKey: () => httpKeyValue,
    getStatus: () => status
  };
}
