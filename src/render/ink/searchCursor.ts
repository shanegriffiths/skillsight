/**
 * Cursor mapping when the `/` filter box closes. Esc restores the user's list
 * untouched, so a hit hidden inside a user-collapsed group lands on its group
 * header. Enter must OPEN the row, so the owning group / ancestor chain is
 * expanded (persisting into the user's expansion state) and the row's index in
 * the rebuilt list is returned. Pure; the views own the setState calls.
 */
import type { ItemRow } from './rows.js';
import { groupKey } from './rows.js';
import type { FolderRow } from './tree.js';
import { clampIndex } from './scroll.js';

/** Row identity across rebuilds: headers by group key, leaves by kind+name. */
export function itemIdentity(r: ItemRow): string {
  return r.expandState !== undefined ? `${r.kind}:g:${groupKey(r)}` : `${r.kind}:${r.name}`;
}

function findItem(rows: ItemRow[], id: string): number {
  return rows.findIndex((r) => itemIdentity(r) === id);
}

/** Nearest header at or before `from` — a filtered child always follows its header. */
function owningHeader(rows: ItemRow[], from: number): ItemRow | undefined {
  for (let i = from; i >= 0; i--) {
    if (rows[i]!.expandState !== undefined) return rows[i];
  }
  return undefined;
}

export function cursorAfterEscape(full: ItemRow[], filtered: ItemRow[], sel: number): number {
  const target = filtered[clampIndex(sel, filtered.length)];
  if (!target) return 0;
  const i = findItem(full, itemIdentity(target));
  if (i >= 0) return i;
  if (target.depth === 1) {
    const h = owningHeader(filtered, clampIndex(sel, filtered.length));
    if (h) {
      const hi = findItem(full, itemIdentity(h));
      if (hi >= 0) return hi;
    }
  }
  return 0;
}

export function revealTarget(
  build: (expanded: Set<string>) => ItemRow[],
  expanded: ReadonlySet<string>,
  filtered: ItemRow[],
  sel: number,
): { expanded: Set<string>; index: number } | null {
  const at = clampIndex(sel, filtered.length);
  const target = filtered[at];
  if (!target) return null;
  const next = new Set(expanded);
  if (target.expandState === undefined && target.depth === 1) {
    const h = owningHeader(filtered, at);
    if (h) next.add(groupKey(h));
  }
  const index = findItem(build(next), itemIdentity(target));
  return index >= 0 ? { expanded: next, index } : null;
}

/** The ancestor chain of `filtered[at]`: preceding rows of strictly decreasing depth. */
function folderAncestors(filtered: FolderRow[], at: number): FolderRow[] {
  const out: FolderRow[] = [];
  let depth = filtered[at]?.depth ?? 0;
  for (let j = at - 1; j >= 0 && depth > 0; j--) {
    const r = filtered[j]!;
    if (r.depth < depth) {
      out.push(r);
      depth = r.depth;
    }
  }
  return out;
}

export function folderCursorAfterEscape(full: FolderRow[], filtered: FolderRow[], sel: number): number {
  const at = clampIndex(sel, filtered.length);
  const target = filtered[at];
  if (!target) return 0;
  const i = full.findIndex((r) => r.nodeId === target.nodeId);
  if (i >= 0) return i;
  for (const a of folderAncestors(filtered, at)) {
    const ai = full.findIndex((r) => r.nodeId === a.nodeId);
    if (ai >= 0) return ai;
  }
  return 0;
}

export function revealFolderTarget(
  build: (expanded: ReadonlySet<string>) => FolderRow[],
  expanded: ReadonlySet<string>,
  filtered: FolderRow[],
  sel: number,
): { expanded: Set<string>; index: number } | null {
  const at = clampIndex(sel, filtered.length);
  const target = filtered[at];
  if (!target) return null;
  const next = new Set(expanded);
  for (const a of folderAncestors(filtered, at)) {
    if (a.hasChildren) next.add(a.nodeId);
  }
  const index = build(next).findIndex((r) => r.nodeId === target.nodeId);
  return index >= 0 ? { expanded: next, index } : null;
}
