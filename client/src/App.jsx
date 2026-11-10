import { useDock } from './useDock.js';
import { useSettings } from './useSettings.js';
import { DockContext } from './DockContext.js';
import ConnectScreen from './components/ConnectScreen.jsx';
import PinModal from './components/PinModal.jsx';
import Dock from './components/Dock.jsx';
import SceneBackground from './components/SceneBackground.jsx';
import RotatePrompt from './components/RotatePrompt.jsx';
import { errorText } from './protocol.js';

export default function App() {
  const dock = useDock();
  const [settings, updateSettings] = useSettings();
  const { state } = dock;
  const value = { ...dock, settings, updateSettings };

  return (
    <DockContext.Provider value={value}>
      <div
        className="app"
        data-labels={settings.labels ? 'on' : 'off'}
        data-immersive={settings.immersive ? 'on' : 'off'}
        data-glass={settings.glass}
      >
        <SceneBackground scene={settings.scene} />
        {state.status === 'ready' ? <Dock /> : <ConnectScreen dock={dock} />}
        {state.status === 'pin' && (
          <PinModal
            address={state.address}
            name={state.name}
            pinLength={state.pinLength}
            error={state.error}
            errorAt={state.errorAt}
            attemptsLeft={state.attemptsLeft}
            notice={state.badToken ? errorText('BAD_TOKEN') : null}
            onSubmit={dock.submitPin}
            onCancel={dock.disconnect}
          />
        )}
        <RotatePrompt />
      </div>
    </DockContext.Provider>
  );
}
