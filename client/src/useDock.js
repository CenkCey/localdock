import { useCallback, useEffect, useRef, useState } from 'react';
import { createDockClient } from './dockClient.js';
import { errorText, normalizeAddress, DEFAULT_PIN_LENGTH } from './protocol.js';
import { loadPcs, savePcs, upsertPc, removePc, getToken, dropToken } from './settings.js';
import { normalizeLayout } from './layout.js';
import { tileLabel } from './tileMeta.js';
import { reject } from './haptics.js';

const INITIAL = {
  status: 'idle',
  address: '',
  name: '',
  actions: [],
  caps: {},
  error: null,
  attemptsLeft: null,
  errorAt: 0,
  pinLength: DEFAULT_PIN_LENGTH,
  httpBase: null,
  httpKey: null
};

export function useDock() {
  const [state, setState] = useState(INITIAL);
  const [pcs, setPcs] = useState(loadPcs);
  const [live, setLive] = useState({ state: null, layout: null, clipboard: [], apps: null });
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const clientRef = useRef(null);
  const addressRef = useRef('');
  const pcsRef = useRef(pcs);
  const busyRef = useRef(null);

  pcsRef.current = pcs;

  useEffect(() => {
    savePcs(pcs);
  }, [pcs]);

  if (!clientRef.current) {
    clientRef.current = createDockClient({
      onStatus: (next) => {
        setState((prev) => ({ ...prev, ...next }));
        const address = addressRef.current;
        if (next.badToken) setPcs((prev) => dropToken(prev, address));
        if (next.status === 'ready') {
          setPcs((prev) => {
            const patch = { address, name: next.name || '', lastSeen: Date.now() };
            if (next.token) patch.token = next.token;
            return upsertPc(prev, patch);
          });
        }
        if (next.status !== 'ready') {
          setLive({ state: null, layout: null, clipboard: [], apps: null });
        }
      }
    });
  }

  const client = clientRef.current;

  useEffect(() => {
    if (state.status !== 'ready' || !state.httpKey) return undefined;
    const take = (key, pick) => (payload) => setLive((prev) => ({ ...prev, [key]: pick(payload) }));
    const offs = [
      client.on('STATE', take('state', (p) => p)),
      client.on('LAYOUT', take('layout', (p) => normalizeLayout(p && p.layout))),
      client.on('CLIPBOARD', take('clipboard', (p) => (p && p.items) || [])),
      client.on('APPS', take('apps', (p) => (p && p.apps) || []))
    ];
    const seeded = {};
    if (client.last('STATE')) seeded.state = client.last('STATE');
    if (client.last('LAYOUT')) seeded.layout = normalizeLayout(client.last('LAYOUT').layout);
    if (Object.keys(seeded).length) setLive((prev) => ({ ...prev, ...seeded }));
    client.request('LAYOUT_GET');
    if (state.caps.clipboard) client.request('CLIPBOARD_GET');
    return () => offs.forEach((off) => off());
  }, [client, state.status, state.httpKey, state.caps.clipboard]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(null), message.bad ? 3200 : 1400);
    return () => clearTimeout(timer);
  }, [message]);

  const connect = useCallback(
    (address) => {
      const normalized = normalizeAddress(address) || String(address || '').trim();
      addressRef.current = normalized;
      setBusy(null);
      busyRef.current = null;
      setMessage(null);
      setPcs((prev) => (normalizeAddress(address) ? upsertPc(prev, { address: normalized }) : prev));
      client.connect(address, getToken(pcsRef.current, normalized));
    },
    [client]
  );

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      const s = client.getStatus();
      if (s === 'error' && addressRef.current && lastErrorRef.current === 'DISCONNECTED') {
        connect(addressRef.current);
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [client, connect]);

  const lastErrorRef = useRef(null);
  lastErrorRef.current = state.error;

  const submitPin = useCallback((pin) => client.submitPin(pin), [client]);

  const run = useCallback(async (key, label, fn) => {
    if (busyRef.current) return null;
    busyRef.current = { key, label };
    setBusy({ key, label });
    setMessage(null);
    const result = await fn();
    busyRef.current = null;
    setBusy(null);
    const bad = !result.ok;
    if (bad) reject();
    setMessage({ key, bad, text: bad ? errorText(result.error) : `${label} done`, at: Date.now() });
    return result;
  }, []);

  const pressTile = useCallback(
    (tile) =>
      run(tile.id, tileLabel(tile), () =>
        tile.kind === 'action'
          ? client.exec(tile.ref)
          : client.request('LAUNCH', { kind: tile.kind, ref: tile.ref })
      ),
    [client, run]
  );

  const saveLayout = useCallback(
    async (layout) => {
      const previous = live.layout;
      setLive((prev) => ({ ...prev, layout }));
      const result = await client.request('LAYOUT_SET', { layout });
      if (!result.ok) {
        setLive((prev) => ({ ...prev, layout: previous }));
        client.request('LAYOUT_GET');
      }
      return result;
    },
    [client, live.layout]
  );

  const flash = useCallback((text, bad = false) => setMessage({ key: null, bad, text, at: Date.now() }), []);

  const disconnect = useCallback(() => {
    setBusy(null);
    busyRef.current = null;
    setMessage(null);
    client.disconnect();
  }, [client]);

  const forgetPc = useCallback((address) => setPcs((prev) => removePc(prev, address)), []);
  const addPc = useCallback((address) => {
    const normalized = normalizeAddress(address);
    if (!normalized) return null;
    setPcs((prev) => upsertPc(prev, { address: normalized }));
    return normalized;
  }, []);
  const updatePc = useCallback((address, patch) => setPcs((prev) => (prev.some((p) => p.address === address) ? upsertPc(prev, { address, ...patch }) : prev)), []);

  return {
    client,
    state,
    pcs,
    live,
    busy,
    message,
    connect,
    submitPin,
    disconnect,
    run,
    pressTile,
    saveLayout,
    flash,
    forgetPc,
    addPc,
    updatePc,
    request: client.request,
    sendInput: client.sendInput
  };
}
