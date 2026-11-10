import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { TileFace } from './Tile.jsx';
import {
  addPage,
  removePage,
  removeTile,
  moveTileWithin,
  moveTileToPage,
  gridFor,
  MAX_PAGES
} from '../layout.js';
import { tileLabel } from '../tileMeta.js';
import { tap, tick } from '../haptics.js';

export default function EditDock({ initial, startPage, density, onDone, onCancel, saving, error }) {
  const [pages, setPages] = useState(initial);
  const [pageIndex, setPageIndex] = useState(Math.min(startPage, initial.length - 1));
  const [armed, setArmed] = useState(false);
  const [drag, setDrag] = useState(null);
  const gridRef = useRef(null);
  const dragRef = useRef(null);
  const pagesRef = useRef(pages);
  const pageRef = useRef(pageIndex);
  const grid = gridFor(density);

  pagesRef.current = pages;
  pageRef.current = pageIndex;

  useEffect(() => {
    setArmed(false);
  }, [pageIndex]);

  const latest = useRef({});
  const stable = useRef({
    move: (event) => latest.current.move(event),
    up: (event) => latest.current.up(event)
  }).current;

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', stable.move);
      window.removeEventListener('pointerup', stable.up);
      window.removeEventListener('pointercancel', stable.up);
    },
    [stable]
  );

  const current = pages[pageIndex];

  function centerOf(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function onMove(event) {
    const d = dragRef.current;
    if (!d || event.pointerId !== d.pointerId) return;
    let index = d.index;
    const hit = d.rects.findIndex(
      (r) => event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom
    );
    if (hit !== -1 && hit !== d.index) {
      const from = d.index;
      setPages((prev) => moveTileWithin(prev, pageRef.current, from, hit));
      d.index = hit;
      index = hit;
      tick();
    }
    const c = centerOf(d.rects[index]);
    setDrag({ id: d.id, x: event.clientX - d.grabX - c.x, y: event.clientY - d.grabY - c.y });
  }

  function onUp(event) {
    const d = dragRef.current;
    if (!d || event.pointerId !== d.pointerId) return;
    dragRef.current = null;
    window.removeEventListener('pointermove', stable.move);
    window.removeEventListener('pointerup', stable.up);
    window.removeEventListener('pointercancel', stable.up);
    setDrag(null);
  }

  latest.current = { move: onMove, up: onUp };

  function startDrag(event, index, tile) {
    if (event.button !== undefined && event.button !== 0) return;
    if (dragRef.current) return;
    const cells = Array.from(gridRef.current.querySelectorAll('[data-cell]'));
    const rects = cells.map((el) => el.getBoundingClientRect());
    const c = centerOf(rects[index]);
    dragRef.current = {
      id: tile.id,
      index,
      rects,
      pointerId: event.pointerId,
      grabX: event.clientX - c.x,
      grabY: event.clientY - c.y
    };
    setDrag({ id: tile.id, x: 0, y: 0 });
    tap();
    window.addEventListener('pointermove', stable.move);
    window.addEventListener('pointerup', stable.up);
    window.addEventListener('pointercancel', stable.up);
  }

  function go(delta) {
    setPageIndex((i) => Math.max(0, Math.min(pages.length - 1, i + delta)));
  }

  function moveAcross(tileIndex, direction) {
    tick();
    setPages((prev) => moveTileToPage(prev, pageIndex, tileIndex, direction, density));
  }

  function canMove(direction) {
    const target = pages[pageIndex + direction];
    return Boolean(target) && target.tiles.length < density;
  }

  function add() {
    tap();
    const next = addPage(pages);
    if (next.length !== pages.length) {
      setPages(next);
      setPageIndex(next.length - 1);
    }
  }

  function removeCurrentPage() {
    if (pages.length <= 1) return;
    if (current.tiles.length > 0 && !armed) {
      setArmed(true);
      return;
    }
    tap();
    setPages(removePage(pages, pageIndex));
    setPageIndex(Math.max(0, pageIndex - 1));
    setArmed(false);
  }

  return (
    <div className="edit">
      <div className="edit-bar">
        <button className="bar-btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <h2 className="edit-title">Edit dock</h2>
        <button className="bar-btn primary" onClick={() => onDone(pages)} disabled={saving}>
          {saving ? 'Saving' : 'Done'}
        </button>
      </div>

      <div className="edit-pages">
        <button className="round" onClick={() => go(-1)} disabled={pageIndex === 0} aria-label="Previous page">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </button>
        <span className="edit-page-label">
          Page {pageIndex + 1} of {pages.length}
        </span>
        <button
          className="round"
          onClick={() => go(1)}
          disabled={pageIndex === pages.length - 1}
          aria-label="Next page"
        >
          <ChevronRight size={22} strokeWidth={2.5} />
        </button>
        <span className="edit-spacer" />
        <button className="bar-btn" onClick={add} disabled={pages.length >= MAX_PAGES}>
          <Plus size={18} strokeWidth={2.5} />
          Add page
        </button>
        <button className="bar-btn danger" onClick={removeCurrentPage} disabled={pages.length <= 1}>
          <Trash2 size={18} strokeWidth={2.5} />
          {armed ? `Remove with ${current.tiles.length} tiles?` : 'Remove page'}
        </button>
      </div>

      {error && (
        <p className="edit-error" role="alert">
          {error}
        </p>
      )}

      <div className="edit-stage">
        <div ref={gridRef} className="page-grid editing" data-density={density} style={{ '--rows': grid.rows, '--cols': grid.cols }}>
          {current.tiles.length === 0 && (
            <p className="page-empty">This page is empty. Move tiles here with the arrows, or add some from the menu after saving.</p>
          )}
          {current.tiles.map((tile, i) => {
            const dragging = drag && drag.id === tile.id;
            return (
              <div
                key={tile.id}
                data-cell
                className={`key tile editing${dragging ? ' dragging' : ''}`}
                style={{
                  '--i': i,
                  transform: dragging ? `translate(${drag.x}px, ${drag.y}px) scale(1.05)` : undefined
                }}
                onPointerDown={(event) => startDrag(event, i, tile)}
                role="group"
                aria-label={tileLabel(tile)}
              >
                <TileFace tile={tile} />
                <button
                  className="badge remove"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    tap();
                    setPages((prev) => removeTile(prev, pageIndex, i));
                  }}
                  aria-label={`Remove ${tileLabel(tile)} from the dock`}
                >
                  <span>
                    <X size={16} strokeWidth={3} />
                  </span>
                </button>
                <button
                  className="badge prev"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => moveAcross(i, -1)}
                  disabled={!canMove(-1)}
                  aria-label="Move to previous page"
                >
                  <span>
                    <ChevronLeft size={18} strokeWidth={3} />
                  </span>
                </button>
                <button
                  className="badge next"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => moveAcross(i, 1)}
                  disabled={!canMove(1)}
                  aria-label="Move to next page"
                >
                  <span>
                    <ChevronRight size={18} strokeWidth={3} />
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="edit-hint">Drag a tile to reorder it. Removing a tile does not uninstall anything.</p>
    </div>
  );
}
