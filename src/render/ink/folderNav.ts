import type { Key } from 'ink';
import type { ItemRow } from './rows.js';
import type { FolderRow } from './tree.js';
import { groupKey } from './rows.js';

export type Focus = 'folders' | 'items' | 'globals' | 'detail';
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
  /** Expanded plugin-group ids in the project items column. */
  expanded: Set<string>;
  /** Expanded worktree-container nodeIds in the folder column (empty = all collapsed). */
  folderExpanded: Set<string>;
  /** Is the inherited-globals table expanded (shown) beneath the project items. */
  globalsOpen: boolean;
  /** Selection in the globals section: -1 on the header, >= 0 within the globals rows. */
  globalItem: number;
  /** Expanded plugin-group ids in the globals column. */
  globalExpanded: Set<string>;
  detailItem: number | null;
  /** Which list the open detail belongs to, so `Esc` returns to the right table. */
  detailFrom: 'items' | 'globals';
}

export interface NavContext {
  /** The visible folder rows (after hidden-filter, sort, and worktree flattening). */
  folderRows: FolderRow[];
  /** Item rows for the currently selected folder (its delta). */
  rows: ItemRow[];
  /** Inherited global rows for the selected folder; absent/[] when there are none. */
  globalRows?: ItemRow[];
}

export function initialNav(): NavState {
  return {
    focus: 'folders',
    folder: 0,
    item: 0,
    expanded: new Set(),
    folderExpanded: new Set(),
    globalsOpen: false,
    globalItem: -1,
    globalExpanded: new Set(),
    detailItem: null,
    detailFrom: 'items',
  };
}

function clamp(i: number, len: number): number {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(i, len - 1));
}

function toggle(set: Set<string>, id: string, on?: boolean): Set<string> {
  const next = new Set(set);
  const want = on ?? !next.has(id);
  if (want) next.add(id);
  else next.delete(id);
  return next;
}

function withFolderExpanded(state: NavState, nodeId: string, on: boolean): NavState {
  return { ...state, folderExpanded: toggle(state.folderExpanded, nodeId, on) };
}

/** Nearest preceding row shallower than `from` (its tree parent); the index itself if none. */
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

/**
 * The shared row-list step, driving both the `items` and `globals` tables. Pure
 * over (rows, index, expanded, action); the caller maps the edge results to the
 * focus-specific destinations (folders / header / another section).
 */
type ListStep =
  | { kind: 'move'; index: number }
  | { kind: 'expand'; expanded: Set<string>; index?: number }
  | { kind: 'open'; index: number }
  | { kind: 'topEdge' } // `up` pressed while already on the first row
  | { kind: 'bottomEdge' } // `down` pressed while already on the last row
  | { kind: 'back' }; // `left` / `escape` out of the list

function listStep(rows: ItemRow[], index: number, expanded: Set<string>, action: NavAction): ListStep {
  const i = clamp(index, rows.length);
  const row = rows[i];
  switch (action) {
    case 'down':
      return i >= rows.length - 1 ? { kind: 'bottomEdge' } : { kind: 'move', index: i + 1 };
    case 'up':
      return i <= 0 ? { kind: 'topEdge' } : { kind: 'move', index: i - 1 };
    case 'enter':
      if (!row) return { kind: 'move', index: i };
      if (row.expandState !== undefined) return { kind: 'expand', expanded: toggle(expanded, groupKey(row)) };
      return { kind: 'open', index: i };
    case 'right':
      if (!row) return { kind: 'move', index: i };
      if (row.expandState === 'collapsed') return { kind: 'expand', expanded: toggle(expanded, groupKey(row), true) };
      if (row.expandState === 'expanded') return { kind: 'move', index: i };
      return { kind: 'open', index: i };
    case 'left':
      if (row?.expandState === 'expanded') return { kind: 'expand', expanded: toggle(expanded, groupKey(row), false) };
      if (row?.depth === 1) {
        const pi = parentHeaderIndex(rows, i);
        const parent = rows[pi];
        if (parent) return { kind: 'expand', expanded: toggle(expanded, groupKey(parent), false), index: pi };
      }
      return { kind: 'back' };
    case 'escape':
      return { kind: 'back' };
    default:
      return { kind: 'move', index: i };
  }
}

/** Leave the globals section back to the project items (or folders when empty). */
function backToItems(state: NavState, ctx: NavContext): NavState {
  return ctx.rows.length > 0
    ? { ...state, focus: 'items', item: clamp(state.item, ctx.rows.length) }
    : { ...state, focus: 'folders' };
}

export function folderNav(state: NavState, action: NavAction, ctx: NavContext): NavState {
  const globalRows = ctx.globalRows ?? [];

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
        // Drill the tree first (expand a collapsed node); once open, a real
        // project row opens its item table.
        if (row.hasChildren && row.collapsed) return withFolderExpanded(s, row.nodeId, true);
        if (row.folder && ctx.rows.length > 0) return { ...s, focus: 'items', item: 0 };
        return s;
      }
      case 'enter': {
        if (!row) return s;
        // Enter favours opening a real project; grouping nodes toggle instead.
        if (row.folder && ctx.rows.length > 0) return { ...s, focus: 'items', item: 0 };
        if (row.hasChildren) return withFolderExpanded(s, row.nodeId, row.collapsed);
        return s;
      }
      case 'left': {
        if (!row) return s;
        if (row.hasChildren && !row.collapsed) return withFolderExpanded(s, row.nodeId, false);
        if (row.depth > 0) {
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
    const step = listStep(ctx.rows, item, state.expanded, action);
    switch (step.kind) {
      case 'move':
        return { ...s, item: step.index };
      case 'expand':
        return { ...s, expanded: step.expanded, ...(step.index !== undefined ? { item: step.index } : {}) };
      case 'open':
        return { ...s, focus: 'detail', detailItem: step.index, detailFrom: 'items' };
      case 'topEdge':
        return s; // stay on the first row
      case 'bottomEdge':
        // Fall through into the inherited-globals section when it has content.
        return globalRows.length > 0 ? { ...s, focus: 'globals', globalItem: -1 } : s;
      case 'back':
        return { ...s, focus: 'folders' };
    }
  }

  if (state.focus === 'globals') {
    // globalItem === -1 is the collapsible header; >= 0 indexes the globals rows.
    if (state.globalItem < 0) {
      switch (action) {
        case 'right':
          return { ...state, globalsOpen: true };
        case 'enter':
          return { ...state, globalsOpen: !state.globalsOpen };
        case 'down':
          return state.globalsOpen && globalRows.length > 0 ? { ...state, globalItem: 0 } : state;
        case 'left':
          return state.globalsOpen ? { ...state, globalsOpen: false } : backToItems(state, ctx);
        case 'up':
        case 'escape':
          return backToItems(state, ctx);
        default:
          return state;
      }
    }
    const gi = clamp(state.globalItem, globalRows.length);
    const s = { ...state, globalItem: gi };
    const step = listStep(globalRows, gi, state.globalExpanded, action);
    switch (step.kind) {
      case 'move':
        return { ...s, globalItem: step.index };
      case 'expand':
        return { ...s, globalExpanded: step.expanded, ...(step.index !== undefined ? { globalItem: step.index } : {}) };
      case 'open':
        return { ...s, focus: 'detail', detailItem: step.index, detailFrom: 'globals' };
      case 'topEdge':
      case 'back':
        return { ...s, globalItem: -1 }; // back to the header
      case 'bottomEdge':
        return s; // stay on the last row
    }
  }

  // focus === 'detail'
  switch (action) {
    case 'escape':
    case 'left':
      return { ...state, focus: state.detailFrom, detailItem: null };
    default:
      return state;
  }
}
