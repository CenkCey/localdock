import { useState } from 'react';
import { AppWindow } from 'lucide-react';
import { useDockContext } from '../DockContext.js';
import { useLongPress } from '../hooks.js';
import { iconUrl } from '../protocol.js';
import { tileLabel, tileIcon, tileTone } from '../tileMeta.js';
import { tap } from '../haptics.js';

export function AppIcon({ appId, size = '100%' }) {
  const { state } = useDockContext();
  const [broken, setBroken] = useState(false);
  if (broken || !state.httpBase || !state.httpKey) return <AppWindow size={size} strokeWidth={2} />;
  return (
    <img
      className="app-img"
      src={iconUrl(state.httpBase, state.httpKey, appId)}
      alt=""
      draggable={false}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

export function TileFace({ tile }) {
  const Icon = tileIcon(tile);
  const label = tileLabel(tile);
  return (
    <span className={`cap tone-${tileTone(tile)}${tile.kind === 'app' ? ' app' : ''}`}>
      <span className="tile-icon">
        {tile.kind === 'app' ? <AppIcon appId={tile.ref} /> : <Icon size="100%" strokeWidth={2} />}
      </span>
      <span className="cap-label">{label}</span>
    </span>
  );
}

export default function Tile({ tile, index, onEdit }) {
  const dock = useDockContext();
  const { busy, message } = dock;
  const press = useLongPress(() => {
    tap();
    onEdit();
  });
  const isBusy = Boolean(busy) && busy.key === tile.id;
  const failed = Boolean(message) && message.bad && message.key === tile.id && !busy;
  const className = ['key', 'tile', isBusy ? 'busy' : '', failed ? 'failed' : ''].filter(Boolean).join(' ');

  return (
    <button
      className={className}
      style={{ '--i': index }}
      {...press.handlers}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        if (press.consumed()) return;
        tap();
        dock.pressTile(tile);
      }}
      disabled={Boolean(busy)}
      aria-label={tileLabel(tile)}
    >
      <TileFace tile={tile} />
    </button>
  );
}
