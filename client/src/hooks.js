import { useCallback, useEffect, useRef, useState } from 'react';

export function useSwipe({ onUp, onDown, threshold = 36 }) {
  const start = useRef(null);
  const didSwipe = useRef(false);

  const onPointerDown = useCallback((event) => {
    didSwipe.current = false;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }, []);

  const onPointerMove = useCallback(
    (event) => {
      const s = start.current;
      if (!s || s.id !== event.pointerId) return;
      const dy = event.clientY - s.y;
      const dx = event.clientX - s.x;
      if (Math.abs(dy) < threshold || Math.abs(dy) < Math.abs(dx)) return;
      start.current = null;
      didSwipe.current = true;
      if (dy < 0 && onUp) onUp();
      if (dy > 0 && onDown) onDown();
    },
    [onUp, onDown, threshold]
  );

  const onPointerEnd = useCallback(() => {
    start.current = null;
  }, []);

  const swiped = useCallback(() => didSwipe.current, []);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
    swiped
  };
}

export function useLongPress(onLong, ms = 500, tolerance = 10) {
  const timer = useRef(null);
  const origin = useRef(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (event) => {
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLong();
      }, ms);
    },
    [onLong, ms]
  );

  const onPointerMove = useCallback(
    (event) => {
      const o = origin.current;
      if (!o || !timer.current) return;
      if (Math.hypot(event.clientX - o.x, event.clientY - o.y) > tolerance) cancel();
    },
    [cancel, tolerance]
  );

  const consumed = useCallback(() => {
    const was = fired.current;
    fired.current = false;
    return was;
  }, []);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel },
    consumed
  };
}

export function useTask() {
  const [state, setState] = useState({ busy: false, result: null });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (fn) => {
    setState({ busy: true, result: null });
    const result = await fn();
    if (alive.current) setState({ busy: false, result });
    return result;
  }, []);

  const clear = useCallback(() => setState({ busy: false, result: null }), []);

  return { ...state, run, clear };
}
