import { describe, it, expect } from 'vitest';
import { folderNav, initialNav, type NavContext, type NavState } from '../src/render/ink/folderNav.js';
import type { ItemRow } from '../src/render/ink/rows.js';

function leaf(name: string): ItemRow {
  // `folderNav` never reads `record`; omit it (the field is optional).
  return { kind: 'skill', name, used: 1, source: 'o/r', sourceDim: false };
}
function header(name: string, open: boolean): ItemRow {
  return { kind: 'plugin', name, used: 2, source: null, sourceDim: false, expandState: open ? 'expanded' : 'collapsed' };
}
function child(name: string): ItemRow {
  return { ...leaf(name), depth: 1 };
}

const ctxOf = (rows: ItemRow[], over: Partial<NavContext> = {}): NavContext => ({
  folderCount: 3,
  folderHasItems: rows.length > 0,
  rows,
  ...over,
});

describe('folderNav — folders focus', () => {
  it('moves the folder cursor and clamps', () => {
    const ctx = ctxOf([]);
    let s = initialNav();
    s = folderNav(s, 'down', ctx);
    expect(s.folder).toBe(1);
    s = folderNav({ ...s, folder: 2 }, 'down', ctx);
    expect(s.folder).toBe(2); // clamped at folderCount-1
    expect(folderNav(initialNav(), 'up', ctx).folder).toBe(0);
  });

  it('Enter moves into items only when the folder has items', () => {
    const rows = [leaf('a')];
    const into = folderNav(initialNav(), 'enter', ctxOf(rows));
    expect(into).toMatchObject({ focus: 'items', item: 0 });
    const stay = folderNav(initialNav(), 'enter', ctxOf([], { folderHasItems: false }));
    expect(stay.focus).toBe('folders');
  });

  it('left and escape are no-ops at the folder column', () => {
    expect(folderNav(initialNav(), 'left', ctxOf([])).focus).toBe('folders');
    expect(folderNav(initialNav(), 'escape', ctxOf([])).focus).toBe('folders');
  });
});

describe('folderNav — items focus', () => {
  const items = (rows: ItemRow[], item = 0): NavState => ({ focus: 'items', folder: 0, item, expanded: new Set(), detailItem: null });

  it('Enter on a collapsed header expands it; on an expanded header collapses it', () => {
    const rows = [header('gsap', false)];
    const opened = folderNav(items(rows), 'enter', ctxOf(rows));
    expect(opened.expanded.has('gsap')).toBe(true);
    const rows2 = [header('gsap', true)];
    const closed = folderNav({ ...items(rows2), expanded: new Set(['gsap']) }, 'enter', ctxOf(rows2));
    expect(closed.expanded.has('gsap')).toBe(false);
  });

  it('Enter on a leaf opens its detail', () => {
    const rows = [leaf('a')];
    const s = folderNav(items(rows), 'enter', ctxOf(rows));
    expect(s).toMatchObject({ focus: 'detail', detailItem: 0 });
  });

  it('Right expands a collapsed header, opens a leaf, no-ops an expanded header', () => {
    const collapsed = [header('g', false)];
    expect(folderNav(items(collapsed), 'right', ctxOf(collapsed)).expanded.has('g')).toBe(true);
    const leafRows = [leaf('a')];
    expect(folderNav(items(leafRows), 'right', ctxOf(leafRows)).focus).toBe('detail');
    const expanded = [header('g', true)];
    const s = folderNav({ ...items(expanded), expanded: new Set(['g']) }, 'right', ctxOf(expanded));
    expect(s.focus).toBe('items');
    expect(s.expanded.has('g')).toBe(true);
  });

  it('Left collapses an expanded header in place', () => {
    const rows = [header('g', true)];
    const s = folderNav({ ...items(rows), expanded: new Set(['g']) }, 'left', ctxOf(rows));
    expect(s.expanded.has('g')).toBe(false);
    expect(s.focus).toBe('items');
  });

  it('Left on a child collapses its parent and moves selection to the header', () => {
    const rows = [header('g', true), child('a'), child('b')];
    const s = folderNav({ ...items(rows, 2), expanded: new Set(['g']) }, 'left', ctxOf(rows));
    expect(s.expanded.has('g')).toBe(false);
    expect(s.item).toBe(0);
    expect(s.focus).toBe('items');
  });

  it('Left on a standalone leaf with nothing expanded returns to folders', () => {
    const rows = [leaf('a')];
    expect(folderNav(items(rows), 'left', ctxOf(rows)).focus).toBe('folders');
  });

  it('Escape returns to folders; Down/Up clamp within the row list', () => {
    const rows = [leaf('a'), leaf('b')];
    expect(folderNav(items(rows), 'escape', ctxOf(rows)).focus).toBe('folders');
    expect(folderNav(items(rows, 1), 'down', ctxOf(rows)).item).toBe(1); // clamped
    expect(folderNav(items(rows, 0), 'up', ctxOf(rows)).item).toBe(0);
  });
});

describe('folderNav — detail focus', () => {
  const detail: NavState = { focus: 'detail', folder: 0, item: 1, expanded: new Set(), detailItem: 1 };

  it('Escape and Left return to items and clear the detail target', () => {
    expect(folderNav(detail, 'escape', ctxOf([leaf('a'), leaf('b')]))).toMatchObject({ focus: 'items', detailItem: null });
    expect(folderNav(detail, 'left', ctxOf([leaf('a'), leaf('b')]))).toMatchObject({ focus: 'items', detailItem: null });
  });

  it('Up/Down are no-ops in detail', () => {
    expect(folderNav(detail, 'down', ctxOf([])).focus).toBe('detail');
  });
});
