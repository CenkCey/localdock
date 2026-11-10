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
      <div className="action-grid">
        {actions.includes('LOCK_PC') && (
          <button className="action-card" onClick={() => fire('LOCK_PC', 'The PC is locked.')} disabled={task.busy}>
            <span className="action-ic">
              <Lock size={24} strokeWidth={2.25} />
            </span>
            <span>
              <span className="action-title">Lock PC</span>
              <span className="action-hint">Show the sign-in screen</span>
            </span>
          </button>
        )}
        {actions.includes('SLEEP_PC') && (
          <button className="action-card red" onClick={() => setConfirm(true)} disabled={task.busy}>
            <span className="action-ic">
              <Moon size={24} strokeWidth={2.25} />
            </span>
            <span>
              <span className="action-title">Sleep PC</span>
              <span className="action-hint">Wake it at the PC to use the dock again</span>
            </span>
          </button>
        )}
      </div>
      {confirm && (
        <div className="confirm" role="alertdialog">
          <p>Put the PC to sleep? You will need to wake it at the PC before you can use this dock again.</p>
          <div className="confirm-actions">
            <button onClick={() => setConfirm(false)}>Cancel</button>
            <button className="red" onClick={() => fire('SLEEP_PC', 'The PC is going to sleep.')} disabled={task.busy}>
              Sleep PC
            </button>
          </div>
        </div>
      )}
      {note && (
        <p className="result" role="status">
          {note}
        </p>
      )}
    </Sheet>
  );
}
