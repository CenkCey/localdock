import { useState } from 'react';
import { X } from 'lucide-react';
import Touchpad from './Touchpad.jsx';
import Signature from './Signature.jsx';
import { useDockContext } from '../DockContext.js';
import { tick } from '../haptics.js';

export default function TouchSign({ onClose, onClipboard }) {
  const dock = useDockContext();
  const caps = dock.state.caps || {};
  const [tab, setTab] = useState(caps.input ? 'touch' : 'sign');

  return (
    <div className="fullscreen" role="dialog" aria-modal="true" aria-label="Touch and sign">
      <div className="fs-bar">
        <div className="tabs" role="tablist">
          {caps.input && (
            <button
              role="tab"
              aria-selected={tab === 'touch'}
              className={tab === 'touch' ? 'tab on' : 'tab'}
              onClick={() => {
                tick();
                setTab('touch');
              }}
            >
              Touchpad
            </button>
          )}
          <button
            role="tab"
            aria-selected={tab === 'sign'}
            className={tab === 'sign' ? 'tab on' : 'tab'}
            onClick={() => {
              tick();
              setTab('sign');
            }}
          >
            Signature
          </button>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">
          <X size={22} strokeWidth={2.25} />
        </button>
      </div>
      <div className="fs-body">
        {tab === 'touch' ? (
          <Touchpad send={dock.sendInput} onClipboard={onClipboard} canClipboard={Boolean(caps.clipboard)} />
        ) : (
          <Signature />
        )}
      </div>
    </div>
  );
}
