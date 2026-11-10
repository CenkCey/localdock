import { useEffect, useRef, useState } from 'react';

export default function Slider({ label, value, onSend, interval = 100 }) {
  const [local, setLocal] = useState(null);
  const lastSent = useRef(0);
  const trailing = useRef(null);
  const settle = useRef(null);
  const latest = useRef(0);
  const dragging = useRef(false);

  useEffect(
    () => () => {
      clearTimeout(trailing.current);
      clearTimeout(settle.current);
    },
    []
  );

  function send(v) {
    lastSent.current = Date.now();
    onSend(v);
  }

  function push(v) {
    latest.current = v;
    const wait = interval - (Date.now() - lastSent.current);
    if (wait <= 0) {
      clearTimeout(trailing.current);
      trailing.current = null;
      send(v);
      return;
    }
    if (!trailing.current) {
      trailing.current = setTimeout(() => {
        trailing.current = null;
        send(latest.current);
      }, wait);
    }
  }

  function armSettle() {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      clearTimeout(trailing.current);
      trailing.current = null;
      send(latest.current);
      setLocal(null);
    }, 700);
  }

  function onChange(event) {
    const v = Number(event.target.value);
    setLocal(v);
    push(v);
    if (!dragging.current) armSettle();
  }

  const shown = local === null ? value : local;
  const percent = Math.max(0, Math.min(100, shown));

  return (
    <div className="slider" style={{ '--pct': `${percent}%` }}>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={percent}
        onChange={onChange}
        onPointerDown={() => {
          dragging.current = true;
          clearTimeout(settle.current);
        }}
        onPointerUp={() => {
          dragging.current = false;
          armSettle();
        }}
        onPointerCancel={() => {
          dragging.current = false;
          armSettle();
        }}
        aria-label={label}
      />
      <output className="slider-value">{Math.round(percent)}</output>
    </div>
  );
}
