import { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, RefreshCw, Trash2 } from 'lucide-react';
import { fetchHello } from '../protocol.js';
import { tap, tick } from '../haptics.js';

export function usePcStatus(pcs, updatePc) {
  const [status, setStatus] = useState({});
  const pcsRef = useRef(pcs);
  pcsRef.current = pcs;
  const key = pcs.map((p) => p.address).join('|');

  const refresh = useCallback(async () => {
    const list = pcsRef.current;
    setStatus(Object.fromEntries(list.map((p) => [p.address, 'checking'])));
    await Promise.all(
      list.map(async (pc) => {
        const hello = await fetchHello(pc.address);
        setStatus((prev) => ({ ...prev, [pc.address]: hello ? 'available' : 'missing' }));
        if (hello) updatePc(pc.address, { name: hello.name, platform: hello.platform });
      })
    );
  }, [updatePc]);

  useEffect(() => {
    refresh();
  }, [key, refresh]);

  return { status, refresh };
}

const STATUS_TEXT = {
  available: 'Available',
  missing: 'Not found',
  checking: 'Checking',
  current: 'Current PC'
};

function platformLabel(platform) {
  if (!platform) return '';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export default function PcList({ pcs, current, connectingTo, status, onRefresh, onConnect, onForget }) {
  return (
    <div className="pcs">
      <div className="pcs-head">
        <h2 className="pcs-title">Saved PCs</h2>
        <button className="bar-btn" onClick={() => { tick(); onRefresh(); }}>
          <RefreshCw size={16} strokeWidth={2.5} />
          Refresh
        </button>
      </div>
      {pcs.length === 0 && <p className="empty">No PCs yet. Enter the address shown in the server terminal.</p>}
      <ul className="pc-list">
        {pcs.map((pc) => {
          const isCurrent = current === pc.address;
          const label = isCurrent ? 'current' : status[pc.address] || 'checking';
          return (
            <li key={pc.address} className="pc-item">
              <button
                className="pc-main"
                onClick={() => {
                  tap();
                  onConnect(pc.address);
                }}
                disabled={Boolean(connectingTo)}
                aria-label={`${pc.name || pc.address}, ${STATUS_TEXT[label]}`}
              >
                <span className={`pc-icon ${label}`}>
                  <Monitor size={22} strokeWidth={2.25} />
                </span>
                <span className="pc-text">
                  <span className="pc-name">{pc.name || pc.address}</span>
                  <span className="pc-meta">
                    {pc.name ? `${pc.address}` : ''}
                    {pc.name && pc.platform ? ' · ' : ''}
                    {platformLabel(pc.platform)}
                  </span>
                </span>
                <span className={`pc-status ${label}`}>{connectingTo === pc.address ? 'Connecting' : STATUS_TEXT[label]}</span>
              </button>
              <button className="pc-forget" onClick={() => onForget(pc.address)} aria-label={`Forget ${pc.name || pc.address}`}>
                <Trash2 size={18} strokeWidth={2.25} />
                <span>Forget</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
