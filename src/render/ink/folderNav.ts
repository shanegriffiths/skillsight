import type { ItemRow } from './rows.js';
import type { FolderRow } from './tree.js';

export type Focus = 'folders' | 'items' | 'detail';
export type NavAction = 'up' | 'down' | 'enter' | 'right' | 'left' | 'escape';

export interface NavState {
  focus: Focus;
  folder: number;
  item: number;
  /** Expanded plugin-group ids in the items column. */
  expanded: Set<string>;
  /** Collapsed folder-tree nodeIds (empty = all expanded). */
  folderCollapsed: Set<string>;
  detailItem: number | null;
}

export interface NavContext {
  /** The visible folder-tree rows (after hidden-filter, sort, and collapse). */
  folderRows: FolderRow[];
  /** Item rows for the currently selected folder. */
  rows: ItemRow[];
}

export function initialNav(): NavState {
  return { focus: 'folders', folder: 0, item: 0, expanded: new Set(), folderCollapsed: new Set(), detailItem: null };
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

function withFolderCollapsed(state: NavState, nodeId: string, collapsed: boolean): NavState {
  const folderCollapsed = new Set(state.folderCollapsed);
  if (collapsed) folderCollapsed.add(nodeId);
  else folderCollapsed.delete(nodeId);
  return { ...state, folderCollapsed };
}

/** Nearest preceding folder row with a smaller depth; the index itself if none. */
function folderParentIndex(rows: FolderRow[], from: number): number {
  const depth = rows[from]?.depth ?? 0;
  for (let i = from - 1; i >= 0; i--) {
    if ((rows[i]?.depth ?? 0) < depth) return i;
  }
  return from;
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
    const folder = clamp(state.folder, ctx.folderRows.length);
    const s = { ...state, folder };
    const row = ctx.folderRows[folder];
    switch (action) {
      case 'down':
        return { ...s, folder: clamp(folder + 1, ctx.folderRows.length) };
      case 'up':
        return { ...s, folder: clamp(folder - 1, ctx.folderRows.length) };
      case 'right': {
        if (!row) return s;
        if (row.hasChildren && s.folderCollapsed.has(row.nodeId)) return withFolderCollapsed(s, row.nodeId, false);
        if (row.folder && ctx.rows.length > 0) return { ...s, focus: 'items', item: 0 };
        return s;
      }
      case 'enter': {
        if (!row) return s;
        if (row.folder && ctx.rows.length > 0) return { ...s, focus: 'items', item: 0 };
        if (row.hasChildren) return withFolderCollapsed(s, row.nodeId, !s.folderCollapsed.has(row.nodeId));
        return s;
      }
      case 'left': {
        if (!row) return s;
        if (row.hasChildren && !s.folderCollapsed.has(row.nodeId)) return withFolderCollapsed(s, row.nodeId, true);
        const pi = folderParentIndex(ctx.folderRows, folder);
        return pi !== folder ? { ...s, folder: pi } : s;
      }
      default:
        return s;
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
