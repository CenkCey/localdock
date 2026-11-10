import { useState } from 'react';
import { Send } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { useDockContext } from '../DockContext.js';
import { useTask } from '../hooks.js';
import { errorText } from '../protocol.js';
import { tap } from '../haptics.js';

function ago(at) {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

export default function ClipboardSheet({ onClose }) {
  const dock = useDockContext();
  const items = dock.live.clipboard || [];
  const [text, setText] = useState('');
  const [paste, setPaste] = useState(true);
  const [note, setNote] = useState('');
  const task = useTask();

  async function pasteItem(item) {
    tap();
    setNote('');
    const result = await task.run(() => dock.request('CLIPBOARD_PASTE', { itemId: item.id }));
    setNote(result.ok ? 'Pasted into the window you have open on the PC.' : errorText(result.error));
  }

  async function sendText(event) {
    event.preventDefault();
    if (!text.trim()) return;
    tap();
    setNote('');
    const result = await task.run(() => dock.request('CLIPBOARD_SEND', { text, paste }));
    if (result.ok) setText('');
    setNote(result.ok ? (paste ? 'Sent and pasted on the PC.' : 'Copied to the PC clipboard.') : errorText(result.error));
  }

  return (
    <Sheet title="Clipboard" onClose={onClose} tall>
      <h3 className="field-title">On the PC</h3>
      {items.length === 0 ? (
        <p className="empty">Nothing copied on the PC yet. Copy some text there and it appears here.</p>
      ) : (
        <ul className="list clip-list">
          {items.map((item) => (
            <li key={item.id}>
              <button className="row clip" onClick={() => pasteItem(item)} disabled={task.busy}>
                <span className="clip-text">{item.text}</span>
                <span className="clip-meta">{ago(item.at)} · tap to paste</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="form" onSubmit={sendText}>
        <label className="field-label" htmlFor="clip-text">
          Send text from this phone
        </label>
        <textarea
          id="clip-text"
          className="text-input area"
          rows={3}
          maxLength={10000}
          placeholder="Type or paste text"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="switch-row compact">
          <span className="field-label">Paste into the open window</span>
          <button
            type="button"
            role="switch"
            aria-checked={paste}
            aria-label="Paste into the open window"
            className={paste ? 'switch on' : 'switch'}
            onClick={() => setPaste((p) => !p)}
          >
            <span />
          </button>
        </div>
        <button className="primary-btn" type="submit" disabled={!text.trim() || task.busy}>
          <Send size={18} strokeWidth={2.5} />
          Send to PC
        </button>
      </form>
      {note && (
        <p className={note.startsWith('Pasted') || note.startsWith('Sent') || note.startsWith('Copied') ? 'result' : 'result bad'} role="status">
          {note}
        </p>
      )}
    </Sheet>
  );
}
