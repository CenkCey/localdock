export const MOVE_INTERVAL = 16;
export const SCROLL_STEP = 28;

export function accelerate(dx, dy) {
  const magnitude = Math.hypot(dx, dy);
  const factor = magnitude < 2 ? 1 : 1 + Math.min(1.4, (magnitude - 2) * 0.07);
  return { dx: dx * factor, dy: dy * factor };
}

function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

export function createCoalescer(send, schedule = (fn, ms) => setTimeout(fn, ms), interval = MOVE_INTERVAL) {
  let ax = 0;
  let ay = 0;
  let pending = false;

  function flush() {
    pending = false;
    const sx = Math.trunc(ax);
    const sy = Math.trunc(ay);
    if (sx === 0 && sy === 0) return;
    ax -= sx;
    ay -= sy;
    send({ type: 'move', dx: clamp(sx, 200), dy: clamp(sy, 200) });
  }

  function add(dx, dy) {
    ax += dx;
    ay += dy;
    if (!pending) {
      pending = true;
      schedule(flush, interval);
    }
  }

  function reset() {
    ax = 0;
    ay = 0;
  }

  return { add, flush, reset };
}

export function createScroller(send, step = SCROLL_STEP) {
  let acc = 0;

  function add(fingerDy) {
    acc -= fingerDy / step;
    const notches = Math.trunc(acc);
    if (notches === 0) return;
    acc -= notches;
    send({ type: 'scroll', dx: 0, dy: clamp(notches, 20) });
  }

  function reset() {
    acc = 0;
  }

  return { add, reset };
}

export function splitText(text, size = 200) {
  const chars = Array.from(text);
  const parts = [];
  for (let i = 0; i < chars.length; i += size) parts.push(chars.slice(i, i + size).join(''));
  return parts;
}

export const PC_KEYS = [
  { key: 'esc', label: 'Esc' },
  { key: 'tab', label: 'Tab' },
  { key: 'delete', label: 'Del' },
  { key: 'backspace', label: 'Backspace', icon: 'backspace' },
  { key: 'enter', label: 'Enter' },
  { key: 'left', label: 'Left', icon: 'left' },
  { key: 'up', label: 'Up', icon: 'up' },
  { key: 'down', label: 'Down', icon: 'down' },
  { key: 'right', label: 'Right', icon: 'right' }
];

export function createZoomer(send, step = 30) {
  let acc = 0;

  function add(delta) {
    acc += delta / step;
    const notches = Math.trunc(acc);
    if (notches === 0) return;
    acc -= notches;
    send({ type: 'zoom', dy: clamp(-notches, 10) });
  }

  function reset() {
    acc = 0;
  }

  return { add, reset };
}
