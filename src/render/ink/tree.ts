/**
 * Flat project list for the Folders column: one row per discovered folder,
 * no parent rows, no synthetic intermediates. Pure — a function of
 * `folders[].path` + `homeRoot`; no engine or discovery coupling.
 *
 * Pipeline: hidden-filter → map to rows (basename labels) → disambiguate
 * duplicate labels with a dim parent hint → sort.
 */
import { basename, dirname, relative, sep } from 'node:path';
import type { FolderReport } from '../../types.js';
import { bucketTotal } from '../../resolve.js';
import { isHiddenPath } from '../hidden.js';
export { isHiddenPath };

export type SortMode = 'items' | 'name';

export interface FolderRow {
  /** Absolute path — stable row key. */
  nodeId: string;
  /** Directory basename; full path for folders outside homeRoot. */
  label: string;
  /** Parent-dir hint, present only when two visible rows share a label. */
  hint?: string;
  /** project-scoped ∪ local item count — what the folder adds beyond the global layer. */
  count: number;
  folder: FolderReport;
}

/** project-scoped ∪ local item count — what a folder adds beyond the global layer. */
function ownDelta(f: FolderReport): number {
  return bucketTotal(f.projectScoped) + bucketTotal(f.local);
}

/** Path relative to homeRoot with `/` separators, or null when outside it. */
function relPath(homeRoot: string, path: string): string | null {
  const rel = relative(homeRoot, path);
  if (!rel || rel.startsWith('..')) return null;
  return rel.split(sep).join('/');
}

export function buildFolderRows(
  folders: FolderReport[],
  homeRoot: string,
  opts: { sort: SortMode; showHidden: boolean },
): FolderRow[] {
  const rows: FolderRow[] = [];
  for (const f of folders) {
    const rel = relPath(homeRoot, f.path);
    if (rel !== null && !opts.showHidden && isHiddenPath(rel)) continue;
    rows.push({
      nodeId: f.path,
      label: rel === null ? f.path : basename(f.path),
      count: ownDelta(f),
      folder: f,
    });
  }

  const byLabel = new Map<string, FolderRow[]>();
  for (const r of rows) {
    const arr = byLabel.get(r.label);
    if (arr) arr.push(r);
    else byLabel.set(r.label, [r]);
  }
  for (const dupes of byLabel.values()) {
    if (dupes.length < 2) continue;
    for (const r of dupes) r.hint = basename(dirname(r.folder.path));
  }

  const byName = (a: FolderRow, b: FolderRow) => a.label.localeCompare(b.label);
  return rows.sort(opts.sort === 'name' ? byName : (a, b) => b.count - a.count || byName(a, b));
}
