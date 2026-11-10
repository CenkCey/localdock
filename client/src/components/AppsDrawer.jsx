import { useEffect, useMemo, useState } from 'react';
import {
  AppWindow,
  Palette,
  Pencil,
  Monitor,
  ChevronRight,
  ChevronLeft,
  Folder,
  Link2,
  Zap,
  RefreshCw,
  Search
} from 'lucide-react';
import Sheet from './Sheet.jsx';
import { AppIcon } from './Tile.jsx';
import { useDockContext } from '../DockContext.js';
import { newTile } from '../layout.js';
import { isValidHttpUrl } from '../protocol.js';
import { describeAction, groupActions } from '../actionsMeta.js';
import { tick, tap } from '../haptics.js';

function MenuRow({ icon: Icon, label, hint, onClick }) {
  return (
    <button
      className="menu-row"
      onClick={() => {
        tick();
        onClick();
      }}
    >
      <span className="menu-icon">
        <Icon size={22} strokeWidth={2.25} />
      </span>
      <span className="menu-text">
        <span className="menu-label">{label}</span>
        {hint && <span className="menu-hint">{hint}</span>}
      </span>
      <ChevronRight size={20} strokeWidth={2.5} />
    </button>
  );
}

export default function AppsDrawer({ onAdd, onClose, onEdit, onAppearance, onSwitch }) {
  const dock = useDockContext();
  const { state, live, request } = dock;
  const [view, setView] = useState('menu');
  const [query, setQuery] = useState('');
  const [path, setPath] = useState('');
  const [url, setUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const canApps = Boolean(state.caps && state.caps.apps);

  useEffect(() => {
    if (view !== 'apps' || !canApps || live.apps) return;
    setLoading(true);
    request('APPS_GET', { refresh: false }).then(() => setLoading(false));
  }, [view, canApps, live.apps, request]);

  const filtered = useMemo(() => {
    const list = live.apps || [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((a) => a.name.toLowerCase().includes(q)) : list;
  }, [live.apps, query]);

  const groups = useMemo(() => groupActions(state.actions), [state.actions]);

  async function add(tile, name) {
    tap();
    const result = await onAdd(tile);
    setNotice(result.ok ? `Added ${name} to page ${result.page}.` : result.text);
    return result;
  }

  async function refresh() {
    setLoading(true);
    await request('APPS_GET', { refresh: true }, 15000);
    setLoading(false);
  }

  function back() {
    tick();
    setNotice('');
    setView(view === 'apps' ? 'menu' : 'apps');
  }

  const title = { menu: 'Menu', apps: 'Apps', folder: 'Add folder', link: 'Add link', action: 'Add action' }[view];
  const subView = view === 'folder' || view === 'link' || view === 'action';
  const validPath = path.trim().length > 0 && path.trim().length <= 500;
  const validUrl = isValidHttpUrl(url) && url.trim().length <= 500;

  return (
    <Sheet title={title} onClose={onClose} tall>
      {view !== 'menu' && (
        <button className="back-btn" onClick={back}>
          <ChevronLeft size={20} strokeWidth={2.5} />
          {subView ? 'Apps' : 'Menu'}
        </button>
      )}

      {view === 'menu' && (
        <div className="menu">
          <MenuRow icon={AppWindow} label="Apps" hint="Add PC apps, folders, links and actions" onClick={() => setView('apps')} />
          <MenuRow icon={Palette} label="Appearance" hint="Theme, background, icons per page" onClick={onAppearance} />
          <MenuRow icon={Pencil} label="Edit dock" hint="Reorder, remove and arrange pages" onClick={onEdit} />
          <MenuRow icon={Monitor} label="Switch PC" hint={state.name || state.address} onClick={onSwitch} />
        </div>
      )}

      {view === 'apps' && (
        <>
          <div className="add-kinds">
            <button className="chip-btn" onClick={() => setView('folder')}>
              <Folder size={18} strokeWidth={2.25} />
              Folder
            </button>
            <button className="chip-btn" onClick={() => setView('link')}>
              <Link2 size={18} strokeWidth={2.25} />
              Link
            </button>
            <button className="chip-btn" onClick={() => setView('action')}>
              <Zap size={18} strokeWidth={2.25} />
              Action
            </button>
          </div>
          {canApps && (
            <>
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
                  <RefreshCw size={18} strokeWidth={2.25} className={loading ? 'spin' : ''} />
                </button>
              </div>
              <ul className="list">
                {filtered.map((a) => (
                  <li key={a.id}>
                    <button className="row" onClick={() => add(newTile('app', a.id, a.name), a.name)}>
                      <span className="row-icon">
                        <AppIcon appId={a.id} />
                      </span>
                      <span className="row-text">{a.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {live.apps && filtered.length === 0 && <p className="empty">No apps match "{query}".</p>}
              {!live.apps && loading && <p className="empty">Loading apps from the PC</p>}
            </>
          )}
        </>
      )}

      {view === 'folder' && (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!validPath) return;
            const value = path.trim();
            const result = await add(newTile('folder', value), 'the folder');
            if (result.ok) setPath('');
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

      {view === 'link' && (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!validUrl) return;
            const result = await add(newTile('url', url.trim()), 'the link');
            if (result.ok) setUrl('');
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

      {view === 'action' && (
        <div className="action-groups">
          {groups.map((g) => (
            <section key={g.id}>
              <h3 className="field-title">{g.title}</h3>
              <ul className="list">
                {g.items.map((id) => {
                  const meta = describeAction(id);
                  const Icon = meta.icon;
                  return (
                    <li key={id}>
                      <button className="row" onClick={() => add(newTile('action', id), meta.label)}>
                        <span className="row-icon glyph">
                          <Icon size={22} strokeWidth={2.25} />
                        </span>
                        <span className="row-text">{meta.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </Sheet>
  );
}
