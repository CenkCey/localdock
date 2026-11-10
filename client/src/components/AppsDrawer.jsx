import { useEffect, useMemo, useState } from 'react';
import { Palette, Pencil, Monitor, Plus, Check, RefreshCw, Search, ChevronLeft, LogOut, X } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { AppIcon } from './Tile.jsx';
import { useDockContext } from '../DockContext.js';
import { newTile, normalizeLayout } from '../layout.js';
import { isValidHttpUrl } from '../protocol.js';
import { describeAction, groupActions } from '../actionsMeta.js';
import { tick, tap } from '../haptics.js';

const TABS = [
  { id: 'apps', label: 'Apps' },
  { id: 'folders', label: 'Folders' },
  { id: 'controls', label: 'Controls' },
  { id: 'links', label: 'Links' }
];

function Card({ icon: Icon, title, hint, onClick }) {
  return (
    <button
      className="dcard"
      onClick={() => {
        tick();
        onClick();
      }}
    >
      <span className="dcard-ic">
        <Icon size={26} strokeWidth={2.25} />
      </span>
      <span>
        <span className="dcard-title">{title}</span>
        <span className="dcard-hint">{hint}</span>
      </span>
    </button>
  );
}

export default function AppsDrawer({ onAdd, onClose, onEdit, onAppearance, onSwitch }) {
  const dock = useDockContext();
  const { state, live, request } = dock;
  const [view, setView] = useState('menu');
  const [tab, setTab] = useState('apps');
  const [query, setQuery] = useState('');
  const [path, setPath] = useState('');
  const [url, setUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const canApps = Boolean(state.caps && state.caps.apps);

  useEffect(() => {
    if (view !== 'add' || tab !== 'apps' || !canApps || live.apps) return;
    setLoading(true);
    request('APPS_GET', { refresh: false }).then(() => setLoading(false));
  }, [view, tab, canApps, live.apps, request]);

  const placed = useMemo(() => {
    const set = new Set();
    normalizeLayout(live.layout).pages.forEach((p) => p.tiles.forEach((t) => set.add(`${t.kind}:${t.ref}`)));
    return set;
  }, [live.layout]);

  const filtered = useMemo(() => {
    const list = live.apps || [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((a) => a.name.toLowerCase().includes(q)) : list;
  }, [live.apps, query]);

  const groups = useMemo(() => groupActions(state.actions), [state.actions]);

  async function toggle(kind, ref, name) {
    tap();
    if (placed.has(`${kind}:${ref}`)) {
      const layout = normalizeLayout(live.layout);
      const next = {
        version: 1,
        pages: layout.pages.map((p) => ({ id: p.id, tiles: p.tiles.filter((t) => !(t.kind === kind && t.ref === ref)) }))
      };
      const result = await dock.saveLayout(next);
      setNotice(result.ok ? `Removed ${name}.` : 'Could not update the dock.');
      return;
    }
    const result = await onAdd(newTile(kind, ref, kind === 'app' ? name : undefined));
    setNotice(result.ok ? `Added ${name} to page ${result.page}.` : result.text);
    return result;
  }

  async function refresh() {
    setLoading(true);
    await request('APPS_GET', { refresh: true }, 15000);
    setLoading(false);
  }

  const validPath = path.trim().length > 0 && path.trim().length <= 500;
  const validUrl = isValidHttpUrl(url) && url.trim().length <= 500;

  if (view === 'menu') {
    return (
      <Sheet title="LocalDock" onClose={onClose}>
        <div className="dcards">
          <Card icon={Plus} title="Add to dock" hint="Apps, folders, controls and links" onClick={() => setView('add')} />
          <Card icon={Palette} title="Appearance" hint="Background, glass, layout" onClick={onAppearance} />
          <Card icon={Pencil} title="Edit dock" hint="Reorder, remove, pages" onClick={onEdit} />
          <Card icon={Monitor} title="Switch PC" hint={state.name || state.address} onClick={onSwitch} />
        </div>
        <div className="dfoot">
          <span className="dfoot-name">{state.name || state.address}</span>
          <span className="dfoot-state">
            <span className="dot-ok" />
            Connected
          </span>
          <button
            className="bar-btn"
            onClick={() => {
              tap();
              dock.disconnect();
            }}
          >
            <LogOut size={16} strokeWidth={2.5} />
            Disconnect
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Add to dock" onClose={onClose} tall bare>
      <div className="picker-head">
        <button
          className="back-btn"
          onClick={() => {
            tick();
            setNotice('');
            setView('menu');
          }}
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'tab on' : 'tab'}
              onClick={() => {
                tick();
                setTab(t.id);
                setNotice('');
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'apps' && canApps ? (
          <div className="search">
            <Search size={18} strokeWidth={2.25} />
            <input
              type="search"
              inputMode="search"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              placeholder="Search apps"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search apps"
            />
            <button className="icon-btn" onClick={refresh} aria-label="Rescan apps on the PC" disabled={loading}>
              <RefreshCw size={16} strokeWidth={2.25} className={loading ? 'spin' : ''} />
            </button>
          </div>
        ) : (
          <span className="edit-spacer" />
        )}
        <button className="close" onClick={onClose} aria-label="Close">
          <X size={20} strokeWidth={2.25} />
        </button>
      </div>

      {tab === 'apps' && (
        <>
          <ul className="list">
            {filtered.map((a) => (
              <li key={a.id}>
                <button className={placed.has(`app:${a.id}`) ? 'row on' : 'row'} onClick={() => toggle('app', a.id, a.name)}>
                  <span className="row-icon">
                    <AppIcon appId={a.id} />
                  </span>
                  <span className="row-text">{a.name}</span>
                  <span className="row-check">{placed.has(`app:${a.id}`) && <Check size={15} strokeWidth={3.5} />}</span>
                </button>
              </li>
            ))}
          </ul>
          {live.apps && filtered.length === 0 && <p className="empty">No apps match "{query}".</p>}
          {!live.apps && loading && <p className="empty">Loading apps from the PC</p>}
          {!canApps && <p className="empty">This PC does not share its app list.</p>}
        </>
      )}

      {tab === 'folders' && (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!validPath) return;
            const result = await toggle('folder', path.trim(), 'the folder');
            if (result && result.ok) setPath('');
          }}
        >
          <label className="field-label" htmlFor="folder-path">
            Folder path on the PC
          </label>
          <input
            id="folder-path"
            className="text-input"
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder="C:\Users\you\Documents"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <p className="field-note">The tile opens this folder in Explorer on the PC.</p>
          <button className="primary-btn" type="submit" disabled={!validPath}>
            Add folder
          </button>
        </form>
      )}

      {tab === 'controls' &&
        groups.map((g) => (
          <section key={g.id} className="field-group">
            <h3 className="group-title">{g.title}</h3>
            <ul className="list">
              {g.items.map((id) => {
                const meta = describeAction(id);
                const Icon = meta.icon;
                const on = placed.has(`action:${id}`);
                return (
                  <li key={id}>
                    <button className={on ? 'row on' : 'row'} onClick={() => toggle('action', id, meta.label)}>
                      <span className="row-icon glyph">
                        <Icon size={22} strokeWidth={2.25} />
                      </span>
                      <span className="row-text">{meta.label}</span>
                      <span className="row-check">{on && <Check size={15} strokeWidth={3.5} />}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      {tab === 'links' && (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!validUrl) return;
            const result = await toggle('url', url.trim(), 'the link');
            if (result && result.ok) setUrl('');
          }}
        >
          <label className="field-label" htmlFor="link-url">
            Web address
          </label>
          <input
            id="link-url"
            className="text-input"
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="field-note">
            {url && !validUrl ? 'Enter an address that starts with http:// or https://' : 'The tile opens this page in the default browser on the PC.'}
          </p>
          <button className="primary-btn" type="submit" disabled={!validUrl}>
            Add link
          </button>
        </form>
      )}

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </Sheet>
  );
}
