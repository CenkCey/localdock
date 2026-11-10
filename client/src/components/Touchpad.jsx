import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  ClipboardList,
  MousePointer2,
  Move,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Delete
} from 'lucide-react';
import { accelerate, createCoalescer, createScroller, splitText, PC_KEYS } from '../touchpad.js';
import { tap, tick } from '../haptics.js';

const SENTINEL = '​';
const ARROWS = { left: ArrowLeft, right: ArrowRight, up: ArrowUp, down: ArrowDown, backspace: Delete };

export default function Touchpad({ send, onClipboard, canClipboard }) {
  const [dragMode, setDragMode] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const inputRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef({ max: 0, moved: false, startedAt: 0 });
  const dragRef = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;

  const pad = useMemo(
    () => ({
      mover: createCoalescer((e) => sendRef.current(e)),
      scroller: createScroller((e) => sendRef.current(e))
    }),
    []
  );

  useEffect(
    () => () => {
      if (dragRef.current) sendRef.current({ type: 'up', button: 'left' });
    },
    []
  );

  function onPointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const map = pointers.current;
    if (map.size === 0) {
      gesture.current = { max: 0, moved: false, startedAt: performance.now() };
      pad.mover.reset();
      pad.scroller.reset();
    }
    map.set(event.pointerId, { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY });
    gesture.current.max = Math.max(gesture.current.max, map.size);
  }

  function onPointerMove(event) {
    const map = pointers.current;
    const p = map.get(event.pointerId);
    if (!p) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    if (Math.hypot(event.clientX - p.sx, event.clientY - p.sy) > 9) gesture.current.moved = true;
    if (map.size === 1 && gesture.current.max === 1) {
      const a = accelerate(dx, dy);
      pad.mover.add(a.dx, a.dy);
    } else if (map.size >= 2) {
      pad.scroller.add(dy / map.size);
    }
  }

  function onPointerEnd(event) {
    const map = pointers.current;
    if (!map.has(event.pointerId)) return;
    map.delete(event.pointerId);
    if (map.size > 0) return;
    pad.mover.flush();
    const g = gesture.current;
    const quick = performance.now() - g.startedAt < 320;
    if (event.type === 'pointerup' && !g.moved && quick && !dragRef.current) {
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

  return (
    <div className="touchpad">
      <div
        className="pad-surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        role="application"
        aria-label="Touchpad. Move one finger to move the cursor. Tap to click. Tap with two fingers to right click. Drag with two fingers to scroll."
      >
        <MousePointer2 size={34} strokeWidth={1.75} aria-hidden="true" />
        <p>One finger moves. Tap to click.</p>
        <p>Two fingers: tap to right click, drag to scroll.</p>
      </div>

      <div className="pad-buttons">
        <button
          className="key flat"
          onClick={() => {
            tap();
            send({ type: 'click', button: 'left', count: 1 });
          }}
        >
          <span className="cap tone-light">
            <span className="cap-label big">Left click</span>
          </span>
        </button>
        <button className="key flat" onClick={toggleDrag} aria-pressed={dragMode}>
          <span className={`cap ${dragMode ? 'tone-cobalt' : 'tone-light'}`}>
            <Move size={20} strokeWidth={2.25} />
            <span className="cap-label big">{dragMode ? 'Dragging' : 'Drag'}</span>
          </span>
        </button>
        <button
          className="key flat"
          onClick={() => {
            tap();
            send({ type: 'click', button: 'right', count: 1 });
          }}
        >
          <span className="cap tone-light">
            <span className="cap-label big">Right click</span>
          </span>
        </button>
      </div>

      <div className="pad-tools">
        <button className="tool" onClick={toggleKeyboard} aria-pressed={keyboard}>
          <Keyboard size={20} strokeWidth={2.25} />
          {keyboard ? 'Hide keyboard' : 'Keyboard'}
        </button>
        {canClipboard && (
          <button className="tool" onClick={onClipboard}>
            <ClipboardList size={20} strokeWidth={2.25} />
            Clipboard
          </button>
        )}
      </div>

      <div className="pc-keys">
        {PC_KEYS.map((k) => {
          const Icon = k.icon ? ARROWS[k.icon] : null;
          return (
            <button
              key={k.key}
              className="pc-key"
              onClick={() => {
                tick();
                send({ type: 'key', key: k.key });
              }}
              aria-label={k.label}
            >
              {Icon ? <Icon size={20} strokeWidth={2.5} /> : k.label}
            </button>
          );
        })}
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
