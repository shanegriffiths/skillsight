/**
 * The Folders column list. Plain projects are flat leaves; a repo that has a
 * `<repo>.worktree/<branch>` container (Shane's convention) becomes a single
 * parent node with a nested `worktrees` group beneath it holding the checkouts:
 *
 *   ▾ my-repo            +2      ← the repo (its OWN delta; selectable)
 *       ▾ worktrees              ← grouping node (no count)
 *           feature-x    +1      ← a checkout (its own delta)
 *
 * Counts are never aggregated up — every row shows only its own delta. Pure: a
 * function of `folders[].path` + `homeRoot`; no engine or discovery coupling.
 */
import { basename, dirname, relative, sep } from 'node:path';
import type { FolderReport } from '../../types.js';
import { bucketTotal } from '../../resolve.js';
import { isHiddenPath } from '../hidden.js';
export { isHiddenPath };

export type SortMode = 'items' | 'name';

export interface FolderRow {
  /** Absolute path — stable row key (repoDir for a repo, container path for the worktrees node). */
  nodeId: string;
  /** Basename / repo name / the literal `worktrees`; full path for folders outside homeRoot. */
  label: string;
  /** Parent-dir hint, present only when two top-level rows share a label. */
  hint?: string;
  /** This row's OWN delta only — never a subtree sum. 0 renders blank. */
  count: number;
  /** 0 = top level, 1 = the worktrees group, 2 = a checkout. */
  depth: number;
  kind: 'project' | 'worktrees';
  /** True for an expandable node (a repo with worktrees, or the worktrees group). */
  hasChildren: boolean;
  collapsed: boolean;
  /** The discovered folder; null for the synthetic worktrees group or an undiscovered repo. */
  folder: FolderReport | null;
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

interface WorktreeInfo {
  /** The `<repo>.worktree` container (nodeId of the worktrees group). */
  containerPath: string;
  /** The repo dir this container belongs to (`.worktree` stripped). */
  repoDir: string;
  repoLabel: string;
  /** This checkout's label within the container. */
  childLabel: string;
}

/** If `path` sits inside a `*.worktree` container (a strict ancestor), describe it. */
function worktreeOf(homeRoot: string, path: string): WorktreeInfo | null {
  const rel = relPath(homeRoot, path);
  if (rel === null) return null;
  const segs = rel.split('/');
  for (let i = segs.length - 2; i >= 0; i--) {
    const seg = segs[i]!;
    if (seg.endsWith('.worktree')) {
      const stripped = seg.replace(/\.worktree$/, '');
      return {
        containerPath: `${homeRoot}/${segs.slice(0, i + 1).join('/')}`,
        repoDir: `${homeRoot}/${[...segs.slice(0, i), stripped].join('/')}`,
        repoLabel: stripped,
        childLabel: segs.slice(i + 1).join('/'),
      };
    }
  }
  return null;
}

interface Group {
  repoDir: string;
  repoLabel: string;
  containerPath: string;
  /** The discovered main checkout, if it too was found; null otherwise. */
  mainRepo: FolderReport | null;
  children: { nodeId: string; label: string; count: number; folder: FolderReport }[];
}

interface TopRow {
  nodeId: string;
  label: string;
  count: number;
  folder: FolderReport | null;
  hasChildren: boolean;
  containerPath: string;
  children: Group['children'];
  containerDir: string; // for the duplicate-label hint
}

export function buildFolderRows(
  folders: FolderReport[],
  homeRoot: string,
  opts: { sort: SortMode; showHidden: boolean; expanded?: ReadonlySet<string> },
): FolderRow[] {
  const expanded = opts.expanded ?? new Set<string>();

  const groups = new Map<string, Group>();
  const others: { folder: FolderReport; outside: boolean }[] = [];

  for (const f of folders) {
    const rel = relPath(homeRoot, f.path);
    if (rel !== null && !opts.showHidden && isHiddenPath(rel)) continue;

    const wt = rel === null ? null : worktreeOf(homeRoot, f.path);
    if (wt) {
      let g = groups.get(wt.repoDir);
      if (!g) {
        g = { repoDir: wt.repoDir, repoLabel: wt.repoLabel, containerPath: wt.containerPath, mainRepo: null, children: [] };
        groups.set(wt.repoDir, g);
      }
      g.children.push({ nodeId: f.path, label: wt.childLabel, count: ownDelta(f), folder: f });
    } else {
      others.push({ folder: f, outside: rel === null });
    }
  }

  // A discovered folder whose path is a group's repoDir is that repo's main
  // checkout — fold it in so it isn't also listed as a standalone sibling.
  const top: TopRow[] = [];
  for (const o of others) {
    const g = groups.get(o.folder.path);
    if (g) {
      g.mainRepo = o.folder;
      continue;
    }
    top.push({
      nodeId: o.folder.path,
      label: o.outside ? o.folder.path : basename(o.folder.path),
      count: ownDelta(o.folder),
      folder: o.folder,
      hasChildren: false,
      containerPath: '',
      children: [],
      containerDir: basename(dirname(o.folder.path)),
    });
  }
  for (const g of groups.values()) {
    top.push({
      nodeId: g.repoDir,
      label: g.repoLabel,
      count: g.mainRepo ? ownDelta(g.mainRepo) : 0,
      folder: g.mainRepo,
      hasChildren: true,
      containerPath: g.containerPath,
      children: g.children,
      containerDir: basename(dirname(g.repoDir)),
    });
  }

  // Disambiguate duplicate top-level labels with a dim parent-dir hint.
  const byLabel = new Map<string, TopRow[]>();
  for (const r of top) {
    const arr = byLabel.get(r.label);
    if (arr) arr.push(r);
    else byLabel.set(r.label, [r]);
  }
  const hintFor = (r: TopRow): string | undefined =>
    (byLabel.get(r.label)?.length ?? 0) > 1 ? r.containerDir : undefined;

  const byName = <T extends { label: string; count: number }>(a: T, b: T) => a.label.localeCompare(b.label);
  const cmp = <T extends { label: string; count: number }>(a: T, b: T) =>
    opts.sort === 'name' ? byName(a, b) : b.count - a.count || byName(a, b);

  top.sort(cmp);

  const out: FolderRow[] = [];
  for (const r of top) {
    const hint = hintFor(r);
    const repoExpanded = expanded.has(r.nodeId);
    out.push({
      nodeId: r.nodeId,
      label: r.label,
      ...(hint ? { hint } : {}),
      count: r.count,
      depth: 0,
      kind: 'project',
      hasChildren: r.hasChildren,
      collapsed: r.hasChildren && !repoExpanded,
      folder: r.folder,
    });
    if (!r.hasChildren || !repoExpanded) continue;

    const wtExpanded = expanded.has(r.containerPath);
    out.push({
      nodeId: r.containerPath,
      label: 'worktrees',
      count: 0,
      depth: 1,
      kind: 'worktrees',
      hasChildren: true,
      collapsed: !wtExpanded,
      folder: null,
    });
    if (!wtExpanded) continue;
    for (const c of [...r.children].sort(cmp)) {
      out.push({
        nodeId: c.nodeId,
        label: c.label,
        count: c.count,
        depth: 2,
        kind: 'project',
        hasChildren: false,
        collapsed: false,
        folder: c.folder,
      });
    }
  }
  return out;
}
