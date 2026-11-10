import { useEffect, useRef } from 'react';
import Tile from './Tile.jsx';
import { gridFor } from '../layout.js';
import { tick } from '../haptics.js';

export default function DockPages({ pages, page, density, onPage, onEdit }) {
  const ref = useRef(null);
  const frame = useRef(0);
  const grid = gridFor(density);

  useEffect(() => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    if (Math.round(el.scrollLeft / el.clientWidth) !== page) {
      const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left: page * el.clientWidth, behavior: calm ? 'auto' : 'smooth' });
    }
  }, [page, pages.length]);

  function onScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el || !el.clientWidth) return;
      const index = Math.round(el.scrollLeft / el.clientWidth);
      if (index !== page && index >= 0 && index < pages.length) onPage(index);
    });
  }

  return (
    <>
      <div className="pager" ref={ref} onScroll={onScroll} data-density={density}>
        {pages.map((p) => (
          <section
            key={p.id}
            className="pager-page"
            aria-label={`Page ${pages.indexOf(p) + 1} of ${pages.length}`}
          >
            <div className="page-grid" style={{ '--rows': grid.rows, '--cols': grid.cols }}>
              {p.tiles.length === 0 && <p className="page-empty">This page is empty. Open the menu below to add tiles.</p>}
              {p.tiles.map((tile, i) => (
                <Tile key={tile.id} tile={tile} index={i} onEdit={onEdit} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="dots" role="tablist" aria-label="Pages">
          {pages.map((p, i) => (
            <button
              key={p.id}
              className={i === page ? 'dot on' : 'dot'}
              role="tab"
              aria-selected={i === page}
              aria-label={`Page ${i + 1}`}
              onClick={() => {
                tick();
                onPage(i);
              }}
            >
              <span />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
