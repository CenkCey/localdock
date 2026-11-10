import { useState } from 'react';
import { Wifi } from 'lucide-react';
import PcList, { usePcStatus } from './PcList.jsx';
import AddressField from './AddressField.jsx';
import { errorText, normalizeAddress } from '../protocol.js';
import { tap } from '../haptics.js';

export default function ConnectScreen({ dock }) {
  const { state, pcs } = dock;
  const connecting = state.status === 'connecting';
  const [address, setAddress] = useState(() => (pcs.length ? pcs[0].address : ''));
  const { status, refresh } = usePcStatus(pcs, dock.updatePc);
  const error = state.status === 'error' ? state.error : null;

  function submit(event) {
    event.preventDefault();
    if (connecting || !address.trim()) return;
    tap();
    dock.connect(address);
  }

  const line = error
    ? errorText(error)
    : connecting
      ? `Connecting to ${state.address}`
      : address.trim() && !normalizeAddress(address)
        ? 'Check the address'
        : 'PC address';

  return (
    <main className="connect">
      <header className="brand">
        <h1 className="brand-title">LocalDock</h1>
        <p className="brand-sub">Tap a key. Your PC does it.</p>
      </header>

      <div className="connect-scroll">
        <PcList
          pcs={pcs}
          current={null}
          connectingTo={connecting ? state.address : null}
          status={status}
          onRefresh={refresh}
          onConnect={(a) => {
            setAddress(a);
            dock.connect(a);
          }}
          onForget={dock.forgetPc}
        />
      </div>

      <form className="connect-form" onSubmit={submit}>
        <AddressField id="connect-address" value={address} onChange={setAddress} status={line} bad={Boolean(error)} />
        <button className="key wide" type="submit" disabled={connecting || !address.trim()}>
          <span className="cap tone-cobalt">
            <Wifi size={26} strokeWidth={2.25} />
            <span className="wide-label">{connecting ? 'Connecting' : 'Connect'}</span>
          </span>
        </button>
      </form>
    </main>
  );
}
