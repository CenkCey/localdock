import { useState } from 'react';
import { Lock, Moon } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { useDockContext } from '../DockContext.js';
import { useTask } from '../hooks.js';
import { errorText } from '../protocol.js';
import { tap, reject } from '../haptics.js';

export default function PowerSheet({ onClose }) {
  const dock = useDockContext();
  const task = useTask();
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const actions = dock.state.actions;

  async function fire(action, done) {
    tap();
    setConfirm(false);
    const result = await task.run(() => dock.client.exec(action));
    if (result.ok) setNote(done);
    else {
      reject();
      setNote(errorText(result.error));
    }
  }

  return (
    <Sheet title="Power" onClose={onClose}>
      {actions.includes('LOCK_PC') && (
        <button className="key wide" onClick={() => fire('LOCK_PC', 'The PC is locked.')} disabled={task.busy}>
          <span className="cap tone-ink">
            <Lock size={26} strokeWidth={2.25} />
            <span className="wide-label">Lock PC</span>
          </span>
        </button>
      )}
      {actions.includes('SLEEP_PC') &&
        (confirm ? (
          <div className="confirm">
            <p className="confirm-text">Put the PC to sleep? You will need to wake it at the PC before you can use this dock again.</p>
            <div className="confirm-actions">
              <button className="key flat" onClick={() => setConfirm(false)}>
                <span className="cap tone-light">
                  <span className="cap-label big">Cancel</span>
                </span>
              </button>
              <button className="key flat" onClick={() => fire('SLEEP_PC', 'The PC is going to sleep.')} disabled={task.busy}>
                <span className="cap tone-red">
                  <span className="cap-label big">Sleep PC</span>
                </span>
              </button>
            </div>
          </div>
        ) : (
          <button className="key wide" onClick={() => setConfirm(true)} disabled={task.busy}>
            <span className="cap tone-red">
              <Moon size={26} strokeWidth={2.25} />
              <span className="wide-label">Sleep PC</span>
            </span>
          </button>
        ))}
      {note && (
        <p className="result" role="status">
          {note}
        </p>
      )}
    </Sheet>
  );
}
