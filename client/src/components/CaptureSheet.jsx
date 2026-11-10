import { useState } from 'react';
import { Camera } from 'lucide-react';
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
      <button className="key wide" onClick={capture} disabled={task.busy}>
        <span className="cap tone-cobalt">
          <Camera size={26} strokeWidth={2.25} />
          <span className="wide-label">{task.busy ? 'Capturing' : 'Screenshot'}</span>
        </span>
      </button>
      <p className="field-note">Takes a full screenshot of the PC screen.</p>
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
