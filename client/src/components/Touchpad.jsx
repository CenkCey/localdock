import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  ClipboardList,
  ChevronLeft,
  Command,
  PenLine,
  SlidersHorizontal,
  Mouse,
  Move,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import PadField from './PadField.jsx';
import { accelerate, createCoalescer, createScroller, createZoomer, splitText } from '../touchpad.js';
import { tap, tick } from '../haptics.js';

const SENTINEL = '​';
const LEFT_KEYS = [
  { key: 'esc', label: 'Esc' },
  { key: 'tab', label: 'Tab' },
  { key: 'delete', label: 'Del' },
  { key: 'backspace', label: '⌫' },
  { key: 'enter', label: 'Enter' }
];
const RIGHT_KEYS = [
  { key: 'home', label: 'Home' },
  { key: 'end', label: 'End' },
  { key: 'pageup', label: 'PgUp' },
  { key: 'up', icon: ArrowUp, label: 'Up' },
  { key: 'pagedown', label: 'PgDn' },
  { key: 'left', icon: ArrowLeft, label: 'Left' },
  { key: 'down', icon: ArrowDown, label: 'Down' },
  { key: 'right', icon: ArrowRight, label: 'Right' }
];

export default function Touchpad({ send, onClipboard, canClipboard, onBack, onSign }) {
  const [dragMode, setDragMode] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [keys, setKeys] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [touching, setTouching] = useState(false);
  const [speed, setSpeed] = useState(1.4);
  const inputRef = useRef(null);
  const fieldRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef({ max: 0, moved: false, startedAt: 0, dist: 0, pinch: 0, scroll: 0, mode: '' });
  const dragRef = useRef(false);
  const sendRef = useRef(send);
  const speedRef = useRef(1.4);
  sendRef.current = send;
  speedRef.current = speed;

  const pad = useMemo(
    () => ({
      mover: createCoalescer((e) => sendRef.current(e)),
      scroller: createScroller((e) => sendRef.current(e)),
      zoomer: createZoomer((e) => sendRef.current(e))
    }),
    []
  );

  useEffect(
    () => () => {
      if (dragRef.current) sendRef.current({ type: 'up', button: 'left' });
    },
    []
  );

  function local(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pairDistance() {
    const list = Array.from(pointers.current.values());
    if (list.length < 2) return 0;
    return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
  }

  function onPointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setSpeedOpen(false);
    const map = pointers.current;
    if (map.size === 0) {
      gesture.current = { max: 0, moved: false, startedAt: performance.now(), dist: 0, pinch: 0, scroll: 0, mode: '' };
      pad.mover.reset();
      pad.scroller.reset();
      pad.zoomer.reset();
      setTouching(true);
    }
    map.set(event.pointerId, { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY });
    gesture.current.max = Math.max(gesture.current.max, map.size);
    gesture.current.dist = pairDistance();
    const p = local(event);
    fieldRef.current.point(event.pointerId, p.x, p.y);
  }

  function onPointerMove(event) {
    const map = pointers.current;
    const p = map.get(event.pointerId);
    if (!p) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    const g = gesture.current;
    if (Math.hypot(event.clientX - p.sx, event.clientY - p.sy) > 9) g.moved = true;
    const at = local(event);
    fieldRef.current.point(event.pointerId, at.x, at.y);

    if (map.size === 1 && g.max === 1) {
      const a = accelerate(dx, dy);
      pad.mover.add(a.dx * speedRef.current, a.dy * speedRef.current);
      return;
    }
    if (map.size < 2) return;

    const dist = pairDistance();
    const change = dist - g.dist;
    g.dist = dist;
    g.pinch += Math.abs(change);
    g.scroll += Math.abs(dy) / 2;
    if (!g.mode && (g.pinch > 16 || g.scroll > 16)) g.mode = g.pinch > g.scroll * 1.2 ? 'pinch' : 'scroll';
    if (g.mode === 'pinch') {
      pad.zoomer.add(change);
      fieldRef.current.zoomBy(1 + change / 260);
    } else {
      const step = dy / map.size;
      pad.scroller.add(step);
      fieldRef.current.scrollBy(step);
    }
  }

  function onPointerEnd(event) {
    const map = pointers.current;
    if (!map.has(event.pointerId)) return;
    map.delete(event.pointerId);
    fieldRef.current.release(event.pointerId);
    if (map.size > 0) return;
    setTouching(false);
    pad.mover.flush();
    const g = gesture.current;
    const quick = performance.now() - g.startedAt < 320;
    if (event.type === 'pointerup' && !g.moved && quick && !dragRef.current) {
      const at = local(event);
      fieldRef.current.ripple(at.x, at.y);
      if (g.max === 1) {
        send({ type: 'click', button: 'left', count: 1 });
        tick();
      } else if (g.max === 2) {
        send({ type: 'click', button: 'right', count: 1 });
        tap();
      }
    }
  }

  function toggleDrag() {
    tap();
    const next = !dragRef.current;
    dragRef.current = next;
    setDragMode(next);
    send({ type: next ? 'down' : 'up', button: 'left' });
  }

  function toggleKeyboard() {
    tap();
    const el = inputRef.current;
    if (!el) return;
    if (document.activeElement === el) el.blur();
    else el.focus();
  }

  function resetInput(el) {
    el.value = SENTINEL;
    try {
      el.setSelectionRange(1, 1);
    } catch {
      return;
    }
  }

  function onInput(event) {
    const el = event.currentTarget;
    const native = event.nativeEvent;
    if (native.isComposing) return;
    const type = native.inputType || '';
    if (type.startsWith('delete') || el.value === '') {
      send({ type: 'key', key: 'backspace' });
    } else if (type === 'insertLineBreak' || type === 'insertParagraph') {
      send({ type: 'key', key: 'enter' });
    } else {
      const text = el.value.split(SENTINEL).join('');
      splitText(text).forEach((part) => send({ type: 'text', text: part }));
    }
    resetInput(el);
  }

  function onCompositionEnd(event) {
    const el = event.currentTarget;
    const text = el.value.split(SENTINEL).join('');
    if (text) splitText(text).forEach((part) => send({ type: 'text', text: part }));
    resetInput(el);
  }

  function onKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      send({ type: 'key', key: 'enter' });
    }
  }

  function pcKey(k) {
    const Icon = k.icon;
    return (
      <button
        key={k.key}
        className="pad-key"
        onClick={() => {
          tick();
          send({ type: 'key', key: k.key });
        }}
        aria-label={k.label}
      >
        {Icon ? <Icon size={18} strokeWidth={2.5} /> : k.label}
      </button>
    );
  }

  return (
    <div className={touching ? 'touchpad touching' : 'touchpad'}>
      <div
        className="pad-surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        role="application"
        aria-label="Touchpad. Move one finger to move the cursor. Tap to click. Tap with two fingers to right click. Drag with two fingers to scroll. Pinch with two fingers to zoom."
      >
        <PadField ref={fieldRef} drag={dragMode} />
      </div>

      <div className="pad-top">
        <button className="pad-ic" onClick={onBack} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </button>
        <button
          className={keys ? 'pad-pill on' : 'pad-pill'}
          onClick={() => {
            tick();
            setKeys((v) => !v);
          }}
          aria-pressed={keys}
        >
          <Command size={16} strokeWidth={2.25} />
          PC keys
        </button>
        <span className="pad-status">Tap to click · Two fingers to scroll · Pinch to zoom</span>
        <button className="pad-ic" onClick={onSign} aria-label="Signature">
          <PenLine size={20} strokeWidth={2.25} />
        </button>
        <button className={keyboard ? 'pad-ic on' : 'pad-ic'} onClick={toggleKeyboard} aria-label="Keyboard" aria-pressed={keyboard}>
          <Keyboard size={20} strokeWidth={2.25} />
        </button>
        {canClipboard && (
          <button className="pad-ic" onClick={onClipboard} aria-label="Clipboard">
            <ClipboardList size={20} strokeWidth={2.25} />
          </button>
        )}
        <button
          className={speedOpen ? 'pad-ic on' : 'pad-ic'}
          onClick={() => {
            tick();
            setSpeedOpen((v) => !v);
          }}
          aria-label="Pointer speed"
          aria-expanded={speedOpen}
        >
          <SlidersHorizontal size={20} strokeWidth={2.25} />
        </button>
      </div>

      {speedOpen && (
        <div className="pad-pop" role="dialog" aria-label="Pointer speed">
          <div className="pad-pop-head">
            <span>Pointer speed</span>
            <span>{speed.toFixed(1)}x</span>
          </div>
          <input type="range" min="0.6" max="3" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          <div className="pad-pop-foot">
            <span>Precise</span>
            <span>Fast</span>
          </div>
        </div>
      )}

      {keys && (
        <>
          <div className="pad-keys left">{LEFT_KEYS.map(pcKey)}</div>
          <div className="pad-keys right">{RIGHT_KEYS.map(pcKey)}</div>
        </>
      )}

      <div className="pad-bottom">
        <button
          className="pad-corner"
          onClick={() => {
            tap();
            send({ type: 'click', button: 'left', count: 1 });
          }}
        >
          <Mouse size={20} strokeWidth={2.25} />
          Left click
        </button>
        <button className={dragMode ? 'pad-drag on' : 'pad-drag'} onClick={toggleDrag} aria-pressed={dragMode}>
          <Move size={18} strokeWidth={2.25} />
          {dragMode ? 'Dragging' : 'Drag'}
        </button>
        <button
          className="pad-corner right"
          onClick={() => {
            tap();
            send({ type: 'click', button: 'right', count: 1 });
          }}
        >
          Right click
          <Mouse size={20} strokeWidth={2.25} />
        </button>
      </div>

      <input
        ref={inputRef}
        className="hidden-input"
        type="text"
        defaultValue={SENTINEL}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck="false"
        enterKeyHint="enter"
        aria-label="Keyboard input for the PC"
        onInput={onInput}
        onKeyDown={onKeyDown}
        onCompositionEnd={onCompositionEnd}
        onFocus={(e) => {
          setKeyboard(true);
          resetInput(e.currentTarget);
        }}
        onBlur={() => setKeyboard(false)}
      />
    </div>
  );
}
