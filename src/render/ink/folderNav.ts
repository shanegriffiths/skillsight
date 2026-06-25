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
    const row = ctx.rows[state.item];
    switch (action) {
      case 'down':
        return { ...state, item: clamp(state.item + 1, ctx.rows.length) };
      case 'up':
        return { ...state, item: clamp(state.item - 1, ctx.rows.length) };
      case 'enter': {
        if (!row) return state;
        if (row.expandState !== undefined) return withExpanded(state, row.name, !state.expanded.has(row.name));
        return { ...state, focus: 'detail', detailItem: state.item };
      }
      case 'right': {
        if (!row) return state;
        if (row.expandState === 'collapsed') return withExpanded(state, row.name, true);
        if (row.expandState === 'expanded') return state;
        return { ...state, focus: 'detail', detailItem: state.item };
      }
      case 'left': {
        if (row?.expandState === 'expanded') return withExpanded(state, row.name, false);
        if (row?.depth === 1) {
          const pi = parentHeaderIndex(ctx.rows, state.item);
          const parent = ctx.rows[pi];
          if (parent) return { ...withExpanded(state, parent.name, false), item: pi };
        }
        return { ...state, focus: 'folders' };
      }
      case 'escape':
        return { ...state, focus: 'folders' };
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
