export const MAX_PAGES = 12;
export const MAX_TILES = 64;

let counter = 0;

export function makeId(prefix) {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rand}`.slice(0, 40);
}

export function emptyLayout() {
  return { version: 1, pages: [{ id: 'p1', tiles: [] }] };
}

export function normalizeLayout(layout) {
  if (!layout || !Array.isArray(layout.pages) || layout.pages.length === 0) return emptyLayout();
  return {
    version: 1,
    pages: layout.pages.map((page, i) => ({
      id: String((page && page.id) || `p${i + 1}`),
      tiles: Array.isArray(page && page.tiles) ? page.tiles.filter((t) => t && t.id && t.kind && t.ref) : []
    }))
  };
}

export function rechunk(pages, density) {
  const used = new Set(pages.map((p) => p.id));
  const out = [];
  for (const page of pages) {
    if (page.tiles.length <= density) {
      out.push({ id: page.id, tiles: page.tiles });
      continue;
    }
    for (let start = 0, n = 0; start < page.tiles.length; start += density, n += 1) {
      let id = page.id;
      if (n > 0) {
        let k = n + 1;
        do {
          id = `${page.id.slice(0, 34)}_${k}`;
          k += 1;
        } while (used.has(id));
        used.add(id);
      }
      out.push({ id, tiles: page.tiles.slice(start, start + density) });
    }
  }
  return out.length ? out : [{ id: 'p1', tiles: [] }];
}

export function displayPages(layout, density) {
  return rechunk(normalizeLayout(layout).pages, density);
}

export function toLayout(pages, density) {
  const chunked = density ? rechunk(pages, density) : pages;
  if (chunked.length <= MAX_PAGES) {
    return { version: 1, pages: chunked.map((p) => ({ id: p.id, tiles: p.tiles.slice(0, MAX_TILES) })) };
  }
  const head = chunked.slice(0, MAX_PAGES - 1).map((p) => ({ id: p.id, tiles: p.tiles }));
  const last = chunked.slice(MAX_PAGES - 1);
  const merged = { id: last[0].id, tiles: last.flatMap((p) => p.tiles).slice(0, MAX_TILES) };
  return { version: 1, pages: [...head, merged] };
}

export function moveTileWithin(pages, pageIndex, from, to) {
  const page = pages[pageIndex];
  if (!page || from === to || from < 0 || from >= page.tiles.length) return pages;
  const target = Math.max(0, Math.min(page.tiles.length - 1, to));
  const tiles = page.tiles.slice();
  const [moved] = tiles.splice(from, 1);
  tiles.splice(target, 0, moved);
  return pages.map((p, i) => (i === pageIndex ? { ...p, tiles } : p));
}

export function moveTileToPage(pages, pageIndex, tileIndex, direction, density) {
  const targetIndex = pageIndex + direction;
  const source = pages[pageIndex];
  const target = pages[targetIndex];
  if (!source || !target || tileIndex < 0 || tileIndex >= source.tiles.length) return pages;
  if (density && target.tiles.length >= density) return pages;
  const tile = source.tiles[tileIndex];
  return pages.map((p, i) => {
    if (i === pageIndex) return { ...p, tiles: p.tiles.filter((_, k) => k !== tileIndex) };
    if (i === targetIndex) {
      return { ...p, tiles: direction > 0 ? [tile, ...p.tiles] : [...p.tiles, tile] };
    }
    return p;
  });
}

export function removeTile(pages, pageIndex, tileIndex) {
  return pages.map((p, i) => (i === pageIndex ? { ...p, tiles: p.tiles.filter((_, k) => k !== tileIndex) } : p));
}

export function addTile(pages, pageIndex, tile, density, idFactory = makeId) {
  const start = Math.max(0, Math.min(pages.length - 1, pageIndex));
  let target = start;
  if (density) {
    target = -1;
    for (let i = start; i < pages.length; i += 1) {
      if (pages[i].tiles.length < density) {
        target = i;
        break;
      }
    }
    if (target === -1) {
      if (pages.length < MAX_PAGES) {
        return [...pages, { id: idFactory('p'), tiles: [tile] }];
      }
      target = pages.length - 1;
    }
  }
  const next = pages.map((p, i) => (i === target ? { ...p, tiles: [...p.tiles, tile] } : p));
  return density ? rechunk(next, density) : next;
}

export function addPage(pages, idFactory = makeId) {
  if (pages.length >= MAX_PAGES) return pages;
  return [...pages, { id: idFactory('p'), tiles: [] }];
}

export function removePage(pages, pageIndex) {
  if (pages.length <= 1) return pages;
  return pages.filter((_, i) => i !== pageIndex);
}

export function newTile(kind, ref, label = null, idFactory = makeId) {
  return { id: idFactory('t'), kind, ref, label: label || null };
}

export function gridFor(density) {
  return { cols: 2, rows: Math.ceil(density / 2) };
}

export function basename(path) {
  const parts = String(path || '')
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/);
  return parts[parts.length - 1] || String(path || '');
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return String(url || '');
  }
}
