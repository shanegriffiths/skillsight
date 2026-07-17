/**
 * Pure core of the `/` find-as-you-type filter: case-insensitive substring
 * matching over display rows. Item lists must be passed FULLY EXPANDED (every
 * group open) so children of user-collapsed groups are findable; group
 * survival: a header stays when it matches (all children shown) or when a
 * child matches (only the hits shown). Folder trees keep the ancestors of any
 * match so the tree stays navigable. Never touches Inventory or chip filters.
 */
import type { Key } from 'ink';
import type { ItemRow } from './rows.js';
import { groupKey } from './rows.js';
import type { FolderRow } from './tree.js';

export function matchesItemRow(row: ItemRow, query: string): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  return row.name.toLowerCase().includes(q) || (row.source ?? '').toLowerCase().includes(q);
}

export function matchesFolderRow(row: FolderRow, query: string, homeRoot: string): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  // Strip the shared home prefix so a query like `shane` doesn't match every row.
  const path = row.nodeId.startsWith(homeRoot) ? row.nodeId.slice(homeRoot.length) : row.nodeId;
  return row.label.toLowerCase().includes(q) || path.toLowerCase().includes(q);
}

export function filterItemRows(rows: ItemRow[], query: string): ItemRow[] {
  if (!query) return rows;
  const out: ItemRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.expandState === undefined) {
      // depth-1 children are consumed with their header below.
      if (!row.depth && matchesItemRow(row, query)) out.push(row);
      continue;
    }
    const children: ItemRow[] = [];
    let j = i + 1;
    while (j < rows.length && rows[j]!.depth === 1) children.push(rows[j++]!);
    i = j - 1;
    if (matchesItemRow(row, query)) {
      out.push({ ...row, expandState: 'expanded' }, ...children);
    } else {
      const hits = children.filter((c) => matchesItemRow(c, query));
      if (hits.length) out.push({ ...row, expandState: 'expanded' }, ...hits);
    }
  }
  return out;
}

export function filterFolderRows(rows: FolderRow[], query: string, homeRoot: string): FolderRow[] {
  if (!query) return rows;
  const hit = rows.map((r) => matchesFolderRow(r, query, homeRoot));
  const keep = rows.map((r, i) => {
    if (hit[i]) return true;
    // An ancestor survives when any row in its subtree (deeper, contiguous) hits.
    for (let j = i + 1; j < rows.length && rows[j]!.depth > r.depth; j++) {
      if (hit[j]) return true;
    }
    return false;
  });
  return rows.filter((_, i) => keep[i]).map((r) => (r.hasChildren ? { ...r, collapsed: false } : r));
}

/** Every group-header id in a grouped list (headers render whether open or not). */
export function allItemGroupIds(rows: ItemRow[]): Set<string> {
  return new Set(rows.filter((r) => r.expandState !== undefined).map((r) => groupKey(r)));
}

/**
 * Fully expand a folder tree whose deeper expandable nodes only appear once
 * their parent is open (repo → worktrees → checkouts): re-run the builder
 * until the set of expandable ids stops growing (≤3 passes for depth 2).
 */
export function expandAllFolders(build: (expanded: ReadonlySet<string>) => FolderRow[]): FolderRow[] {
  let ids = new Set<string>();
  for (;;) {
    const rows = build(ids);
    const next = new Set([...ids, ...rows.filter((r) => r.hasChildren).map((r) => r.nodeId)]);
    if (next.size === ids.size) return rows;
    ids = next;
  }
}

const isItemLeaf = (r: ItemRow) => r.expandState === undefined;
const isFolderLeaf = (r: FolderRow) => r.kind === 'project';

export function itemMatchCount(filtered: ItemRow[], full: ItemRow[]): string {
  return `${filtered.filter(isItemLeaf).length}/${full.filter(isItemLeaf).length}`;
}

export function folderMatchCount(filtered: FolderRow[], full: FolderRow[], query: string, homeRoot: string): string {
  // Count DIRECT hits only — ancestors kept as tree context aren't matches.
  const hits = filtered.filter((r) => isFolderLeaf(r) && matchesFolderRow(r, query, homeRoot)).length;
  return `${hits}/${full.filter(isFolderLeaf).length}`;
}

export type SearchKey = Pick<
  Key,
  'escape' | 'return' | 'upArrow' | 'downArrow' | 'backspace' | 'delete' | 'ctrl' | 'meta' | 'tab'
>;

export type SearchAction =
  | { type: 'type'; text: string }
  | { type: 'backspace' }
  | { type: 'escape' }
  | { type: 'enter' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'none' };

/**
 * Keypress → search-box action. Everything printable is query text (including
 * `q`/`f`/digits — app keys are suspended while the box is open); Tab and
 * ctrl/meta chords are deliberate no-ops. Ink reports Backspace as `delete`
 * on some terminals, so both flags mean backspace.
 */
export function searchAction(input: string, key: SearchKey): SearchAction {
  if (key.escape) return { type: 'escape' };
  if (key.return) return { type: 'enter' };
  if (key.upArrow) return { type: 'up' };
  if (key.downArrow) return { type: 'down' };
  if (key.backspace || key.delete) return { type: 'backspace' };
  if (key.ctrl || key.meta || key.tab) return { type: 'none' };
  const text = [...input].filter((ch) => ch >= ' ' && ch !== '').join('');
  return text ? { type: 'type', text } : { type: 'none' };
}
