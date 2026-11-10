import { Monitor, TriangleAlert, ChevronDown } from 'lucide-react';
import { useDockContext } from '../DockContext.js';
import { useSwipe } from '../hooks.js';
import { tick } from '../haptics.js';
import MediaCover from './MediaCover.jsx';

export default function Island({ onOpen }) {
  const dock = useDockContext();
  const { state, live, busy, message } = dock;
  const media = live.state && live.state.media;
  const showMedia = Boolean(media && media.title && media.status !== 'stopped');
  const playing = showMedia && media.status === 'playing';
  const swipe = useSwipe({ onDown: onOpen });

  let title = showMedia ? media.title : state.name || state.address;
  let sub = showMedia ? media.artist || (playing ? 'Playing' : 'Paused') : state.name ? state.address : 'Connected';
  let bad = false;
  if (busy) {
    title = `Sending ${busy.label}`;
    sub = state.name || state.address;
  } else if (message) {
    title = message.text;
    sub = state.name || state.address;
    bad = message.bad;
  }

  const thumb = showMedia && media.thumb;

  return (
    <div className="island-wrap">
      <div className={`island${bad ? ' bad' : ''}${busy ? ' busy' : ''}`} {...swipe.handlers}>
        {showMedia ? (
          <span className="island-art" aria-hidden="true">
            <MediaCover src={thumb} size={22} />
          </span>
        ) : (
          <span className="island-art plain" aria-hidden="true">
            {bad ? <TriangleAlert size={22} strokeWidth={2.5} /> : <Monitor size={22} strokeWidth={2.25} />}
          </span>
        )}
        <button
          className="island-main"
          onClick={() => {
            if (swipe.swiped()) return;
            tick();
            onOpen();
          }}
          aria-label="Open quick controls"
        >
          <span className="island-title" aria-live="polite">
            {title}
          </span>
          <span className="island-sub">{sub}</span>
        </button>
        <ChevronDown className="island-chev" size={20} strokeWidth={2.5} aria-hidden="true" />
      </div>
    </div>
  );
}
