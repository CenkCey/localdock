import { useRef, useState } from 'react';
import { FolderUp, CircleCheck, CircleAlert } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { useDockContext } from '../DockContext.js';
import { uploadFile, formatSize } from '../upload.js';
import { tap } from '../haptics.js';

export default function FilesSheet({ onClose }) {
  const dock = useDockContext();
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef(null);

  function patch(id, change) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }

  async function onPick(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0 || running) return;
    const batch = files.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'waiting',
      error: ''
    }));
    setItems(batch.map(({ file, ...rest }) => rest));
    setRunning(true);
    for (const entry of batch) {
      patch(entry.id, { status: 'sending' });
      try {
        const out = await uploadFile(dock.state.httpBase, dock.state.httpKey, entry.file, (progress) =>
          patch(entry.id, { progress })
        );
        patch(entry.id, { status: 'done', progress: 1, saved: out.file });
      } catch (error) {
        patch(entry.id, { status: 'failed', error: error.message });
      }
    }
    setRunning(false);
  }

  const finished = items.length > 0 && !running;
  const okCount = items.filter((i) => i.status === 'done').length;

  return (
    <Sheet title="Files & Media" onClose={onClose} tall>
      <button
        className="key wide"
        onClick={() => {
          tap();
          if (inputRef.current) inputRef.current.click();
        }}
        disabled={running}
      >
        <span className="cap tone-cobalt">
          <FolderUp size={26} strokeWidth={2.25} />
          <span className="wide-label">{running ? 'Sending' : 'Choose files'}</span>
        </span>
      </button>
      <input
        ref={inputRef}
        className="file-input"
        type="file"
        multiple
        accept="*/*"
        onChange={onPick}
        aria-label="Choose files to send to the PC"
        tabIndex={-1}
      />
      <p className="field-note">Send photos, videos and files from this phone to the PC.</p>

      {items.length > 0 && (
        <ul className="uploads">
          {items.map((item) => (
            <li key={item.id} className={`upload ${item.status}`}>
              <div className="upload-head">
                <span className="upload-name">{item.name}</span>
                <span className="upload-size">{formatSize(item.size)}</span>
              </div>
              <div className="bar" role="progressbar" aria-label={`Sending ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}>
                <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </div>
              <p className="upload-line">
                {item.status === 'waiting' && 'Waiting'}
                {item.status === 'sending' && `Sending ${Math.round(item.progress * 100)}%`}
                {item.status === 'done' && (
                  <>
                    <CircleCheck size={16} strokeWidth={2.5} /> Sent
                  </>
                )}
                {item.status === 'failed' && (
                  <>
                    <CircleAlert size={16} strokeWidth={2.5} /> {item.error}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {finished && okCount > 0 && (
        <p className="result" role="status">
          {okCount === items.length ? 'Saved to Downloads\\LocalDock' : `${okCount} of ${items.length} saved to Downloads\\LocalDock`}
        </p>
      )}
    </Sheet>
  );
}
