import type { Key } from 'ink';
import type { ItemRow } from './rows.js';
import type { FolderRow } from './tree.js';
import { groupKey } from './rows.js';

export type Focus = 'folders' | 'items' | 'detail';
export type NavAction = 'up' | 'down' | 'enter' | 'right' | 'left' | 'escape';

export type NavKey = Pick<Key, 'upArrow' | 'downArrow' | 'leftArrow' | 'rightArrow' | 'return' | 'escape'>;

/** Keypress → NavAction mapping (pure; lives here so it's testable next to the reducer). */
export function toAction(input: string, key: NavKey): NavAction | null {
  if (key.downArrow || input === 'j') return 'down';
  if (key.upArrow || input === 'k') return 'up';
  if (key.return) return 'enter';
  if (key.rightArrow) return 'right';
  if (key.leftArrow) return 'left';
  if (key.escape) return 'escape';
  return null;
}

export interface NavState {
  focus: Focus;
  folder: number;
  item: number;
  /** Expanded plugin-group ids in the items column. */
  expanded: Set<string>;
  /** Expanded worktree-container nodeIds in the folder column (empty = all collapsed). */
  folderExpanded: Set<string>;
  detailItem: number | null;
}

export interface NavContext {
  /** The visible folder rows (after hidden-filter, sort, and worktree flattening). */
  folderRows: FolderRow[];
  /** Item rows for the currently selected folder. */
  rows: ItemRow[];
}

export function initialNav(): NavState {
  return { focus: 'folders', folder: 0, item: 0, expanded: new Set(), folderExpanded: new Set(), detailItem: null };
}

function clamp(i: number, len: number): number {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(i, len - 1));
}

function withExpanded(state: NavState, id: string, on: boolean): NavState {
  const expanded = new Set(state.expanded);
  if (on) expanded.add(id);
  else expanded.delete(id);
  return { ...state, expanded };
}

function withFolderExpanded(state: NavState, nodeId: string, on: boolean): NavState {
  const folderExpanded = new Set(state.folderExpanded);
  if (on) folderExpanded.add(nodeId);
  else folderExpanded.delete(nodeId);
  return { ...state, folderExpanded };
}

/** Nearest preceding top-level (depth 0) worktree container row; the index itself if none. */
function folderParentIndex(rows: FolderRow[], from: number): number {
  for (let i = from - 1; i >= 0; i--) {
    if (rows[i]?.depth === 0 && rows[i]?.hasChildren) return i;
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
        if (row.hasChildren) return row.collapsed ? withFolderExpanded(s, row.nodeId, true) : s;
        if (row.folder && ctx.rows.length > 0) return { ...s, focus: 'items', item: 0 };
        return s;
      }
      case 'enter': {
        if (!row) return s;
        if (row.hasChildren) return withFolderExpanded(s, row.nodeId, row.collapsed);
        if (row.folder && ctx.rows.length > 0) return { ...s, focus: 'items', item: 0 };
        return s;
      }
      case 'left': {
        if (!row) return s;
        if (row.hasChildren && !row.collapsed) return withFolderExpanded(s, row.nodeId, false);
        if (row.depth === 1) {
          const pi = folderParentIndex(ctx.folderRows, folder);
          if (pi !== folder) return { ...s, folder: pi };
        }
        return s;
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
        if (row.expandState !== undefined) return withExpanded(s, groupKey(row), !s.expanded.has(groupKey(row)));
        return { ...s, focus: 'detail', detailItem: item };
      }
      case 'right': {
        if (!row) return s;
        if (row.expandState === 'collapsed') return withExpanded(s, groupKey(row), true);
        if (row.expandState === 'expanded') return s;
        return { ...s, focus: 'detail', detailItem: item };
      }
      case 'left': {
        if (row?.expandState === 'expanded') return withExpanded(s, groupKey(row), false);
        if (row?.depth === 1) {
          const pi = parentHeaderIndex(ctx.rows, item);
          const parent = ctx.rows[pi];
          if (parent) return { ...withExpanded(s, groupKey(parent), false), item: pi };
        }
        return { ...s, focus: 'folders' };
      }
      case 'escape':
        return { ...s, focus: 'folders' };
      default:
        return s;
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
