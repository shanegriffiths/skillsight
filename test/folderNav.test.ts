import { describe, it, expect } from 'vitest';
import { folderNav, initialNav, toAction, type NavContext, type NavKey, type NavState } from '../src/render/ink/folderNav.js';
import type { ItemRow } from '../src/render/ink/rows.js';
import type { FolderRow } from '../src/render/ink/tree.js';
import type { FolderReport } from '../src/types.js';

function leaf(name: string): ItemRow {
  // `folderNav` never reads `record`; omit it (the field is optional).
  return { kind: 'skill', name, used: 1, source: 'o/r', sourceDim: false };
}
function header(name: string, open: boolean, groupId?: string): ItemRow {
  return {
    kind: 'plugin',
    name,
    used: 2,
    source: null,
    sourceDim: false,
    expandState: open ? 'expanded' : 'collapsed',
    ...(groupId ? { groupId } : {}),
  };
}
function child(name: string): ItemRow {
  return { ...leaf(name), depth: 1 };
}

const fakeFolder = {} as FolderReport; // folderNav only checks presence of the row's folder

/** A flat project leaf by default; override to make a worktree group / child. */
function fRow(label: string, over: Partial<FolderRow> = {}): FolderRow {
  return {
    nodeId: label,
    label,
    count: 1,
    depth: 0,
    kind: 'project',
    hasChildren: false,
    collapsed: false,
    folder: fakeFolder,
    ...over,
  };
}
const group = (label: string, over: Partial<FolderRow> = {}): FolderRow =>
  fRow(label, { nodeId: label, kind: 'worktree', hasChildren: true, folder: null, collapsed: true, ...over });

const ctxOf = (rows: ItemRow[], over: Partial<NavContext> = {}): NavContext => ({
  folderRows: [fRow('f0'), fRow('f1'), fRow('f2')],
  rows,
  ...over,
});

describe('folderNav — folders focus (flat projects)', () => {
  it('moves the folder cursor and clamps', () => {
    const ctx = ctxOf([]);
    let s = initialNav();
    s = folderNav(s, 'down', ctx);
    expect(s.folder).toBe(1);
    s = folderNav({ ...s, folder: 2 }, 'down', ctx);
    expect(s.folder).toBe(2); // clamped at folderCount-1
    expect(folderNav(initialNav(), 'up', ctx).folder).toBe(0);
  });

  it('Enter and Right move into items only when the folder has items', () => {
    const rows = [leaf('a')];
    expect(folderNav(initialNav(), 'enter', ctxOf(rows))).toMatchObject({ focus: 'items', item: 0 });
    expect(folderNav(initialNav(), 'right', ctxOf(rows))).toMatchObject({ focus: 'items', item: 0 });
    expect(folderNav(initialNav(), 'enter', ctxOf([])).focus).toBe('folders'); // no items → stays
    expect(folderNav(initialNav(), 'right', ctxOf([])).focus).toBe('folders');
  });

  it('left and escape are no-ops at a plain project row', () => {
    expect(folderNav(initialNav(), 'left', ctxOf([])).focus).toBe('folders');
    expect(folderNav(initialNav(), 'escape', ctxOf([])).focus).toBe('folders');
  });
});

describe('folderNav — folders focus (worktree groups)', () => {
  const at = (folder: number, over: Partial<NavState> = {}): NavState => ({ ...initialNav(), folder, ...over });

  it('Right expands a collapsed container instead of opening items', () => {
    const ctx: NavContext = { folderRows: [group('repo')], rows: [] };
    const s = folderNav(at(0), 'right', ctx);
    expect(s.focus).toBe('folders');
    expect(s.folderExpanded.has('repo')).toBe(true);
  });

  it('Right is a no-op on an already-expanded container', () => {
    const ctx: NavContext = { folderRows: [group('repo', { collapsed: false })], rows: [] };
    const s = folderNav(at(0, { folderExpanded: new Set(['repo']) }), 'right', ctx);
    expect(s.folderExpanded.has('repo')).toBe(true);
    expect(s.focus).toBe('folders');
  });

  it('Enter toggles the container both ways', () => {
    const collapsed: NavContext = { folderRows: [group('repo')], rows: [] };
    const opened = folderNav(at(0), 'enter', collapsed);
    expect(opened.folderExpanded.has('repo')).toBe(true);

    const expanded: NavContext = { folderRows: [group('repo', { collapsed: false })], rows: [] };
    const closed = folderNav(at(0, { folderExpanded: new Set(['repo']) }), 'enter', expanded);
    expect(closed.folderExpanded.has('repo')).toBe(false);
  });

  it('Left collapses an expanded container in place', () => {
    const ctx: NavContext = { folderRows: [group('repo', { collapsed: false })], rows: [] };
    const s = folderNav(at(0, { folderExpanded: new Set(['repo']) }), 'left', ctx);
    expect(s.folderExpanded.has('repo')).toBe(false);
  });

  it('Left on a checkout child jumps to its container row', () => {
    const ctx: NavContext = {
      folderRows: [
        group('repo', { collapsed: false }),
        fRow('case-study', { depth: 1 }),
        fRow('animation', { depth: 1 }),
      ],
      rows: [],
    };
    expect(folderNav(at(2), 'left', ctx).folder).toBe(0);
  });

  it('Enter/Right on a checkout child (a leaf with items) opens its items', () => {
    const ctx: NavContext = {
      folderRows: [group('repo', { collapsed: false }), fRow('case-study', { depth: 1 })],
      rows: [leaf('a')],
    };
    expect(folderNav(at(1), 'enter', ctx)).toMatchObject({ focus: 'items', item: 0 });
  });
});

describe('folderNav — items focus', () => {
  const items = (rows: ItemRow[], item = 0): NavState => ({ focus: 'items', folder: 0, item, expanded: new Set(), folderExpanded: new Set(), detailItem: null });

  it('Enter on a collapsed header expands it; on an expanded header collapses it', () => {
    const rows = [header('gsap', false)];
    const opened = folderNav(items(rows), 'enter', ctxOf(rows));
    expect(opened.expanded.has('gsap')).toBe(true);
    const rows2 = [header('gsap', true)];
    const closed = folderNav({ ...items(rows2), expanded: new Set(['gsap']) }, 'enter', ctxOf(rows2));
    expect(closed.expanded.has('gsap')).toBe(false);
  });

  it('expansion is keyed by groupId when present, not the display name', () => {
    const rows = [header('gsap', false, 'gsap@marketplace')];
    const opened = folderNav(items(rows), 'enter', ctxOf(rows));
    expect(opened.expanded.has('gsap@marketplace')).toBe(true);
    expect(opened.expanded.has('gsap')).toBe(false);
  });

  it('Enter on a leaf opens its detail', () => {
    const rows = [leaf('a')];
    const s = folderNav(items(rows), 'enter', ctxOf(rows));
    expect(s).toMatchObject({ focus: 'detail', detailItem: 0 });
  });

  it('Left on a child collapses its parent (by groupId) and moves selection to the header', () => {
    const rows = [header('g', true, 'g@mp'), child('a'), child('b')];
    const s = folderNav({ ...items(rows, 2), expanded: new Set(['g@mp']) }, 'left', ctxOf(rows));
    expect(s.expanded.has('g@mp')).toBe(false);
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

  it('clamps a stale out-of-range item index (e.g. after a live rescan shrinks rows)', () => {
    const rows = [leaf('a'), leaf('b')]; // length 2; stored item 9 is stale
    expect(folderNav(items(rows, 9), 'down', ctxOf(rows)).item).toBe(1);
    expect(folderNav(items(rows, 9), 'up', ctxOf(rows)).item).toBe(0);
    expect(folderNav(items(rows, 9), 'enter', ctxOf(rows))).toMatchObject({ focus: 'detail', detailItem: 1 });
  });
});

describe('folderNav — detail focus', () => {
  const detail: NavState = { focus: 'detail', folder: 0, item: 1, expanded: new Set(), folderExpanded: new Set(), detailItem: 1 };

  it('Escape and Left return to items and clear the detail target', () => {
    expect(folderNav(detail, 'escape', ctxOf([leaf('a'), leaf('b')]))).toMatchObject({ focus: 'items', detailItem: null });
    expect(folderNav(detail, 'left', ctxOf([leaf('a'), leaf('b')]))).toMatchObject({ focus: 'items', detailItem: null });
  });

  it('Up/Down are no-ops in detail', () => {
    expect(folderNav(detail, 'down', ctxOf([])).focus).toBe('detail');
  });
});

const keyOf = (over: Partial<NavKey> = {}): NavKey => ({
  upArrow: false, downArrow: false, leftArrow: false, rightArrow: false, return: false, escape: false,
  ...over,
});

describe('toAction', () => {
  it('maps arrows, vim keys, return, and escape', () => {
    expect(toAction('', keyOf({ downArrow: true }))).toBe('down');
    expect(toAction('j', keyOf())).toBe('down');
    expect(toAction('', keyOf({ upArrow: true }))).toBe('up');
    expect(toAction('k', keyOf())).toBe('up');
    expect(toAction('', keyOf({ return: true }))).toBe('enter');
    expect(toAction('', keyOf({ rightArrow: true }))).toBe('right');
    expect(toAction('', keyOf({ leftArrow: true }))).toBe('left');
    expect(toAction('', keyOf({ escape: true }))).toBe('escape');
    expect(toAction('x', keyOf())).toBeNull();
  });
});

describe('items focus is defensive against unknown actions', () => {
  it('clamps and returns state for an unhandled action (no fall-through to the detail switch)', () => {
    const state = { ...initialNav(), focus: 'items' as const, item: 3 };
    const ctx = { folderRows: [], rows: [] };
    expect(folderNav(state, 'bogus' as never, ctx)).toEqual({ ...state, item: 0 });
  });
});
