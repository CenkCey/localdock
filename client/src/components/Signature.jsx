import { useEffect, useRef, useState } from 'react';
import { Undo2, Trash2, Save, ClipboardPaste } from 'lucide-react';
import { useDockContext } from '../DockContext.js';
import { useTask } from '../hooks.js';
import { errorText } from '../protocol.js';
import { tap, tick } from '../haptics.js';

const WIDTH = 1600;
const HEIGHT = 600;
const INKS = [
  { id: 'black', label: 'Black', color: '#111111' },
  { id: 'blue', label: 'Blue', color: '#1d3fd1' }
];

function paint(canvas, strokes) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  strokes.forEach((stroke) => {
    const pts = stroke.points;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i += 1) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  });
}

export default function Signature() {
  const dock = useDockContext();
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const active = useRef(null);
  const [ink, setInk] = useState('black');
  const [count, setCount] = useState(0);
  const task = useTask();
  const [done, setDone] = useState('');

  useEffect(() => {
    paint(canvasRef.current, strokes.current);
  }, []);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * WIDTH) / rect.width,
      y: ((event.clientY - rect.top) * HEIGHT) / rect.height
    };
  }

  function onPointerDown(event) {
    if (active.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const color = INKS.find((i) => i.id === ink).color;
    const stroke = { color, points: [point(event)] };
    active.current = { id: event.pointerId, stroke };
    strokes.current = [...strokes.current, stroke];
    setDone('');
    paint(canvasRef.current, strokes.current);
    setCount(strokes.current.length);
  }

  function onPointerMove(event) {
    const a = active.current;
    if (!a || a.id !== event.pointerId) return;
    const events = event.nativeEvent.getCoalescedEvents ? event.nativeEvent.getCoalescedEvents() : [];
    const list = events.length ? events : [event.nativeEvent];
    const rect = canvasRef.current.getBoundingClientRect();
    list.forEach((e) => {
      a.stroke.points.push({
        x: ((e.clientX - rect.left) * WIDTH) / rect.width,
        y: ((e.clientY - rect.top) * HEIGHT) / rect.height
      });
    });
    paint(canvasRef.current, strokes.current);
  }

  function onPointerEnd(event) {
    if (active.current && active.current.id === event.pointerId) active.current = null;
  }

  function undo() {
    tick();
    strokes.current = strokes.current.slice(0, -1);
    paint(canvasRef.current, strokes.current);
    setCount(strokes.current.length);
    setDone('');
  }

  function clear() {
    tick();
    strokes.current = [];
    paint(canvasRef.current, strokes.current);
    setCount(0);
    setDone('');
  }

  async function send(insert) {
    tap();
    const png = canvasRef.current.toDataURL('image/png').split(',')[1];
    const result = await task.run(() => dock.request('SIGNATURE_SEND', { png, insert }, 20000));
    setDone(
      result.ok
        ? insert
          ? 'Inserted into the PC window and saved to Pictures\\LocalDock\\Signatures.'
          : `Saved to Pictures\\LocalDock\\Signatures as ${result.file || 'signature.png'}.`
        : errorText(result.error)
    );
  }

  const empty = count === 0;

  return (
    <div className="signature">
      <div className="sign-wrap">
        <canvas
          ref={canvasRef}
          className="sign-canvas"
          width={WIDTH}
          height={HEIGHT}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          role="img"
          aria-label="Signature area. Draw with your finger."
        />
        {empty && <p className="sign-hint">Make your mark.</p>}
      </div>

      <div className="sign-side">
      <div className="inks" role="radiogroup" aria-label="Ink colour">
        {INKS.map((i) => (
          <button
            key={i.id}
            role="radio"
            aria-checked={ink === i.id}
            className={ink === i.id ? 'ink on' : 'ink'}
            onClick={() => {
              tick();
              setInk(i.id);
            }}
          >
            <span style={{ background: i.color }} />
            {i.label}
          </button>
        ))}
      </div>

      <div className="sign-tools">
        <button className="tool" onClick={undo} disabled={empty}>
          <Undo2 size={20} strokeWidth={2.25} />
          Undo
        </button>
        <button className="tool" onClick={clear} disabled={empty}>
          <Trash2 size={20} strokeWidth={2.25} />
          Clear
        </button>
      </div>

      <div className="sign-send">
        <button className="primary-btn" onClick={() => send(false)} disabled={empty || task.busy}>
          <Save size={18} strokeWidth={2.5} />
          Save to PC
        </button>
        <button className="primary-btn alt" onClick={() => send(true)} disabled={empty || task.busy}>
          <ClipboardPaste size={18} strokeWidth={2.5} />
          Insert into PC
        </button>
      </div>
      <p className={done && !done.startsWith('Saved') && !done.startsWith('Inserted') ? 'result bad' : 'result'} role="status">
        {task.busy ? 'Sending to the PC' : done || 'Insert pastes the signature into the window you have open on the PC.'}
      </p>
      </div>
    </div>
  );
}
