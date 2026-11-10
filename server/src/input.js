const BUTTONS = ['left', 'right', 'middle'];
const KEYS = [
  'esc', 'tab', 'delete', 'backspace', 'enter', 'space', 'up', 'down', 'left', 'right',
  'home', 'end', 'pageup', 'pagedown'
];
const MAX_TEXT = 200;
const RATE_PER_SECOND = 120;

function clamp(value, limit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(-limit, Math.min(limit, Math.round(value)));
}

function optionalClamp(value, limit) {
  return value === undefined ? 0 : clamp(value, limit);
}

function normalize(p) {
  if (p === null || typeof p !== 'object' || Array.isArray(p) || typeof p.type !== 'string') return null;
  switch (p.type) {
    case 'move': {
      const dx = clamp(p.dx, 200);
      const dy = clamp(p.dy, 200);
      return dx === null || dy === null ? null : { type: 'move', dx, dy };
    }
    case 'click': {
      const count = p.count === undefined ? 1 : p.count;
      if (!BUTTONS.includes(p.button) || (count !== 1 && count !== 2)) return null;
      return { type: 'click', button: p.button, count };
    }
    case 'down':
    case 'up':
      return BUTTONS.includes(p.button) ? { type: p.type, button: p.button } : null;
    case 'scroll': {
      const dy = optionalClamp(p.dy, 20);
      const dx = optionalClamp(p.dx, 20);
      return dx === null || dy === null || (dx === 0 && dy === 0) ? null : { type: 'scroll', dx, dy };
    }
    case 'zoom': {
      const dy = clamp(p.dy, 10);
      return dy === null || dy === 0 ? null : { type: 'zoom', dy };
    }
    case 'key':
      return KEYS.includes(p.key) ? { type: 'key', key: p.key } : null;
    case 'text': {
      if (typeof p.text !== 'string') return null;
      const text = p.text.replace(/[\u0000-\u001f\u007f]/g, '');
      if (text === '' || Array.from(text).length > MAX_TEXT) return null;
      return { type: 'text', text };
    }
    default:
      return null;
  }
}

function createInput({ platform, caps }) {
  const windows = new Map();

  return {
    handle(socket, payload) {
      if (!caps.input) return;
      const now = Date.now();
      let w = windows.get(socket.id);
      if (!w || now - w.start >= 1000) {
        w = { start: now, count: 0 };
        windows.set(socket.id, w);
      }
      w.count += 1;
      if (w.count > RATE_PER_SECOND) return;
      const event = normalize(payload);
      if (event) platform.input(event);
    },
    forget(socket) {
      windows.delete(socket.id);
    }
  };
}

module.exports = { createInput, normalize };
