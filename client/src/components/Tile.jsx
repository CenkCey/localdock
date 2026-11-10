import { useState } from 'react';
import { AppWindow } from 'lucide-react';
import { useDockContext } from '../DockContext.js';
import { useLongPress } from '../hooks.js';
import { iconUrl } from '../protocol.js';
import { tileLabel, tileIcon, tileTone } from '../tileMeta.js';
import { tap } from '../haptics.js';

const SYSTEM_ICONS = new Set(['OPEN_CMD', 'OPEN_CALC', 'OPEN_TASKMGR']);

export function AppIcon({ appId }) {
  const { state } = useDockContext();
  const [broken, setBroken] = useState(false);
  if (broken || !state.httpBase || !state.httpKey) return <AppWindow size="100%" strokeWidth={2} />;
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

function Glyph({ tile }) {
  const Icon = tileIcon(tile);
  return (
    <span className={`glyph g-${tileTone(tile)}`}>
      <Icon strokeWidth={2} />
    </span>
  );
}

function SystemIcon({ tile }) {
  const { state } = useDockContext();
  const [broken, setBroken] = useState(false);
  if (broken || !state.httpBase || !state.httpKey) return <Glyph tile={tile} />;
  return (
    <img
      className="app-img"
      src={iconUrl(state.httpBase, state.httpKey, tile.ref)}
      alt=""
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
}

function Face({ tile }) {
  if (tile.kind === 'app') return <AppIcon appId={tile.ref} />;
  if (tile.kind === 'action' && SYSTEM_ICONS.has(tile.ref)) return <SystemIcon tile={tile} />;
  return <Glyph tile={tile} />;
}

export function TileFace({ tile }) {
  return (
    <span className="face">
      <span className="tile-icon">
        <Face tile={tile} />
      </span>
      <span className="tile-name">{tileLabel(tile)}</span>
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
  const className = ['tile', isBusy ? 'busy' : '', failed ? 'failed' : ''].filter(Boolean).join(' ');

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
