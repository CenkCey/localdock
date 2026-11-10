import { useState } from 'react';
import { Plus, LogOut } from 'lucide-react';
import Sheet from './Sheet.jsx';
import PcList, { usePcStatus } from './PcList.jsx';
import AddressField from './AddressField.jsx';
import { normalizeAddress } from '../protocol.js';
import { tap } from '../haptics.js';

export default function SwitchPc({ dock, onClose }) {
  const { pcs, state } = dock;
  const [address, setAddress] = useState('');
  const { status, refresh } = usePcStatus(pcs, dock.updatePc);
  const valid = Boolean(normalizeAddress(address));

  function add(event) {
    event.preventDefault();
    if (!valid) return;
    tap();
    dock.addPc(address);
    setAddress('');
  }

  return (
    <Sheet title="Switch PC" onClose={onClose} tall>
      <PcList
        pcs={pcs}
        current={state.address}
        connectingTo={null}
        status={status}
        onRefresh={refresh}
        onConnect={(a) => {
          if (a === state.address) {
            onClose();
            return;
          }
          onClose();
          dock.connect(a);
        }}
        onForget={dock.forgetPc}
      />
      <form className="form add-pc" onSubmit={add}>
        <AddressField
          id="add-address"
          value={address}
          onChange={setAddress}
          status={address.trim() && !valid ? 'Check the address' : 'Add a PC by address'}
          bad={false}
        />
        <button className="primary-btn" type="submit" disabled={!valid}>
          <Plus size={18} strokeWidth={2.5} />
          Add PC
        </button>
      </form>
      <button
        className="danger-btn"
        onClick={() => {
          tap();
          dock.disconnect();
        }}
      >
        <LogOut size={18} strokeWidth={2.5} />
        Disconnect
      </button>
    </Sheet>
  );
}
