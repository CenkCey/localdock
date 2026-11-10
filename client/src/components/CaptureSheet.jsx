import { useState } from 'react';
import { Camera, Video } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { useDockContext } from '../DockContext.js';
import { useTask } from '../hooks.js';
import { errorText } from '../protocol.js';
import { tap } from '../haptics.js';

export default function CaptureSheet({ onClose }) {
  const dock = useDockContext();
  const task = useTask();
  const [shot, setShot] = useState(null);
  const [error, setError] = useState('');

  async function capture() {
    tap();
    setError('');
    const result = await task.run(() => dock.request('CAPTURE_SCREENSHOT', {}, 20000));
    if (result.ok) setShot({ file: result.file, thumb: result.thumb });
    else setError(errorText(result.error));
  }

  return (
    <Sheet title="Capture" onClose={onClose}>
      <div className="action-grid">
        <button className="action-card" onClick={capture} disabled={task.busy}>
          <span className="action-ic">
            <Camera size={24} strokeWidth={2.25} />
          </span>
          <span>
            <span className="action-title">{task.busy ? 'Capturing' : 'Screenshot'}</span>
            <span className="action-hint">Full resolution PNG of the PC screen</span>
          </span>
        </button>
        <button className="action-card" disabled aria-disabled="true">
          <span className="action-ic">
            <Video size={24} strokeWidth={2.25} />
          </span>
          <span>
            <span className="action-title">Start recording</span>
            <span className="action-hint">Screen recording arrives with a server update</span>
          </span>
        </button>
      </div>
      {error && (
        <p className="result bad" role="alert">
          {error}
        </p>
      )}
      {shot && (
        <figure className="shot">
          {shot.thumb && <img src={shot.thumb} alt="Preview of the screenshot" />}
          <figcaption role="status">Saved to Pictures\LocalDock as {shot.file}</figcaption>
        </figure>
      )}
    </Sheet>
  );
}
