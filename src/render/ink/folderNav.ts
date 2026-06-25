import type { ItemRow } from './rows.js';

export type Focus = 'folders' | 'items' | 'detail';
export type NavAction = 'up' | 'down' | 'enter' | 'right' | 'left' | 'escape';

export interface NavState {
  focus: Focus;
  folder: number;
  item: number;
  expanded: Set<string>;
  detailItem: number | null;
}

export interface NavContext {
  folderCount: number;
  folderHasItems: boolean;
  rows: ItemRow[];
}

export function initialNav(): NavState {
  return { focus: 'folders', folder: 0, item: 0, expanded: new Set(), detailItem: null };
}

function clamp(i: number, len: number): number {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(i, len - 1));
}

function withExpanded(state: NavState, name: string, on: boolean): NavState {
  const expanded = new Set(state.expanded);
  if (on) expanded.add(name);
  else expanded.delete(name);
  return { ...state, expanded };
}

/** Nearest preceding row that is a group header; falls back to the index itself. */
function parentHeaderIndex(rows: ItemRow[], from: number): number {
  for (let i = from; i >= 0; i--) {
    if (rows[i]?.expandState !== undefined) return i;
  }
  return from;
}

export function folderNav(state: NavState, action: NavAction, ctx: NavContext): NavState {
  if (state.focus === 'folders') {
    switch (action) {
      case 'down':
        return { ...state, folder: clamp(state.folder + 1, ctx.folderCount) };
      case 'up':
        return { ...state, folder: clamp(state.folder - 1, ctx.folderCount) };
      case 'enter':
      case 'right':
        return ctx.folderHasItems ? { ...state, focus: 'items', item: 0 } : state;
      default:
        return state;
    }
  }

  if (state.focus === 'items') {
    const item = clamp(state.item, ctx.rows.length);
    const s = { ...state, item };
    const row = ctx.rows[item];
    switch (action) {
      case 'down':
        return { ...s, item: clamp(item + 1, ctx.rows.length) };
      case 'up':
        return { ...s, item: clamp(item - 1, ctx.rows.length) };
      case 'enter': {
        if (!row) return s;
        if (row.expandState !== undefined) return withExpanded(s, row.name, !s.expanded.has(row.name));
        return { ...s, focus: 'detail', detailItem: item };
      }
      case 'right': {
        if (!row) return s;
        if (row.expandState === 'collapsed') return withExpanded(s, row.name, true);
        if (row.expandState === 'expanded') return s;
        return { ...s, focus: 'detail', detailItem: item };
      }
      case 'left': {
        if (row?.expandState === 'expanded') return withExpanded(s, row.name, false);
        if (row?.depth === 1) {
          const pi = parentHeaderIndex(ctx.rows, item);
          const parent = ctx.rows[pi];
          if (parent) return { ...withExpanded(s, parent.name, false), item: pi };
        }
        return { ...s, focus: 'folders' };
      }
      case 'escape':
        return { ...s, focus: 'folders' };
    }
  }

  // focus === 'detail'
  switch (action) {
    case 'escape':
    case 'left':
      return { ...state, focus: 'items', detailItem: null };
    default:
      return state;
  }
}
