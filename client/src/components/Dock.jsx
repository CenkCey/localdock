import { useEffect, useMemo, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import Island from './Island.jsx';
import DockPages from './DockPages.jsx';
import EditDock from './EditDock.jsx';
import QuickDrawer from './QuickDrawer.jsx';
import AppsDrawer from './AppsDrawer.jsx';
import AppearanceSheet from './AppearanceSheet.jsx';
import SwitchPc from './SwitchPc.jsx';
import TouchSign from './TouchSign.jsx';
import ClipboardSheet from './ClipboardSheet.jsx';
import CaptureSheet from './CaptureSheet.jsx';
import FilesSheet from './FilesSheet.jsx';
import PowerSheet from './PowerSheet.jsx';
import { useDockContext } from '../DockContext.js';
import { useSwipe } from '../hooks.js';
import { displayPages, addTile, toLayout } from '../layout.js';
import { errorText } from '../protocol.js';
import { tick } from '../haptics.js';

export default function Dock() {
  const dock = useDockContext();
  const { live, settings, updateSettings } = dock;
  const density = settings.density;
  const [page, setPage] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [panel, setPanel] = useState(null);
  const [clipOver, setClipOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [slow, setSlow] = useState(false);

  const pages = useMemo(() => (live.layout ? displayPages(live.layout, density) : null), [live.layout, density]);
  const current = pages ? Math.min(page, pages.length - 1) : 0;

  useEffect(() => {
    if (pages) return undefined;
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [pages]);

  const handleSwipe = useSwipe({ onUp: () => setPanel('apps') });

  function openPanel(id) {
    setDrawer(false);
    setPanel(id);
  }

  async function addToDock(tile) {
    const next = addTile(pages, current, tile, density);
    const result = await dock.saveLayout(toLayout(next, density));
    if (!result.ok) return { ok: false, text: errorText(result.error) };
    const where = next.findIndex((p) => p.tiles.some((t) => t.id === tile.id));
    return { ok: true, page: where + 1 };
  }

  async function finishEdit(edited) {
    setSaving(true);
    setSaveError('');
    const result = await dock.saveLayout(toLayout(edited, density));
    setSaving(false);
    if (!result.ok) {
      setSaveError(`${errorText(result.error)} Your changes were not saved.`);
      return;
    }
    setEditing(false);
  }

  function startEdit() {
    setSaveError('');
    setDrawer(false);
    setPanel(null);
    setEditing(true);
  }

  const closePanel = () => setPanel(null);

  return (
    <main className="dock">
      <Island onOpen={() => setDrawer(true)} />

      {!pages ? (
        <div className="loading">
          <p>{slow ? 'The PC has not sent your dock yet.' : 'Loading your dock'}</p>
          {slow && (
            <button className="primary-btn" onClick={() => dock.request('LAYOUT_GET')}>
              Try again
            </button>
          )}
        </div>
      ) : editing ? (
        <EditDock
          initial={pages}
          startPage={current}
          density={density}
          saving={saving}
          error={saveError}
          onDone={finishEdit}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <DockPages pages={pages} page={current} density={density} onPage={setPage} onEdit={startEdit} />
          <button
            className="handle"
            {...handleSwipe.handlers}
            onClick={() => {
              if (handleSwipe.swiped()) return;
              tick();
              setPanel('apps');
            }}
            aria-label="Open apps and settings"
          >
            <ChevronUp size={20} strokeWidth={2.75} />
            <span className="handle-bar" />
          </button>
        </>
      )}

      {drawer && <QuickDrawer onClose={() => setDrawer(false)} onOpenPanel={openPanel} />}
      {panel === 'apps' && (
        <AppsDrawer
          onAdd={addToDock}
          onClose={closePanel}
          onEdit={startEdit}
          onAppearance={() => setPanel('appearance')}
          onSwitch={() => setPanel('switch')}
        />
      )}
      {panel === 'appearance' && <AppearanceSheet settings={settings} onChange={updateSettings} onClose={closePanel} />}
      {panel === 'switch' && <SwitchPc dock={dock} onClose={closePanel} />}
      {panel === 'files' && <FilesSheet onClose={closePanel} />}
      {panel === 'capture' && <CaptureSheet onClose={closePanel} />}
      {panel === 'power' && <PowerSheet onClose={closePanel} />}
      {panel === 'touch' && <TouchSign onClose={closePanel} onClipboard={() => setClipOver(true)} />}
      {(panel === 'clipboard' || clipOver) && (
        <ClipboardSheet
          onClose={() => {
            setClipOver(false);
            if (panel === 'clipboard') setPanel(null);
          }}
        />
      )}
    </main>
  );
}
