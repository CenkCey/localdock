import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useSwipe } from '../hooks.js';

export default function Sheet({ title, onClose, side = 'bottom', tall = false, children }) {
  const ref = useRef(null);
  const swipe = useSwipe(side === 'bottom' ? { onDown: onClose } : { onUp: onClose });

  useEffect(() => {
    if (ref.current) ref.current.focus({ preventScroll: true });
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const grabber = (
    <div className="grabber" {...swipe.handlers} aria-hidden="true">
      <span />
    </div>
  );

  return (
    <div
      className={`overlay overlay-${side}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={`sheet sheet-from-${side}${tall ? ' tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {side === 'bottom' && grabber}
        <div className="sheet-top">
          <h2 className="sheet-title">{title}</h2>
          <button className="close" onClick={onClose} aria-label="Close">
            <X size={22} strokeWidth={2.25} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {side === 'top' && grabber}
      </div>
    </div>
  );
}
