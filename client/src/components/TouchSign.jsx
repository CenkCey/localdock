import { useState } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import Touchpad from './Touchpad.jsx';
import Signature from './Signature.jsx';
import { useDockContext } from '../DockContext.js';
import { tick } from '../haptics.js';

export default function TouchSign({ onClose, onClipboard }) {
  const dock = useDockContext();
  const caps = dock.state.caps || {};
  const [tab, setTab] = useState('touch');

  if (tab === 'touch') {
    return (
      <div className="fullscreen pad-full" role="dialog" aria-modal="true" aria-label="Touchpad">
        {caps.input ? (
          <Touchpad
            send={dock.sendInput}
            onClipboard={onClipboard}
            canClipboard={Boolean(caps.clipboard)}
            onBack={onClose}
            onSign={() => {
              tick();
              setTab('sign');
            }}
          />
        ) : (
          <div className="pad-off">
            <button className="pad-ic" onClick={onClose} aria-label="Back">
              <ChevronLeft size={22} strokeWidth={2.5} />
            </button>
            <p className="empty">The touchpad is not available. The PC's input service did not start. Restart the LocalDock server on the PC and reconnect.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fullscreen" role="dialog" aria-modal="true" aria-label="Signature">
      <div className="fs-bar">
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={false}
            className="tab"
            onClick={() => {
              tick();
              setTab('touch');
            }}
          >
            Touchpad
          </button>
          <button role="tab" aria-selected className="tab on">
            Signature
          </button>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">
          <X size={22} strokeWidth={2.25} />
        </button>
      </div>
      <div className="fs-body">
        <Signature />
      </div>
    </div>
  );
}
