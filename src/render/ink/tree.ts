/**
 * The Folders column list. Plain projects are flat leaves; a repo that has git
 * worktrees becomes a single parent node with a nested `worktrees` group
 * beneath it holding the checkouts:
 *
 *   ▾ my-repo            +2      ← the repo (its OWN delta; selectable)
 *       ▾ worktrees              ← grouping node (no count)
 *           feature-x    +1      ← a checkout (its own delta)
 *
 * Grouping is driven by each folder's git identity (`FolderReport.git`), not a
 * path convention — a checkout groups under its `mainCheckout` repo wherever it
 * physically lives (branchlet siblings, herdr's `~/.herdr`, a repo's own
 * `.claude/…`). Counts are never aggregated up — every row shows only its own
 * delta. Pure: a function of `folders[].{path,git}` + `homeRoot`; no fs.
 */
import { basename, dirname, relative, sep } from 'node:path';
import type { FolderReport } from '../../types.js';
import { bucketTotal } from '../../resolve.js';
import { isHiddenPath } from '../hidden.js';
export { isHiddenPath };

export type SortMode = 'items' | 'name';

/**
 * Synthetic, path-free id for a repo's `worktrees` group node. A tab can never
 * appear in a filesystem path, so this never collides with a real folder's
 * nodeId — even the `<repo>.worktree` bucket dir.
 */
export function worktreesNodeId(repoDir: string): string {
  return `${repoDir}\tworktrees`;
}

export interface FolderRow {
  /** Stable row key: a folder path for real rows, {@link worktreesNodeId} for the group node. */
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

interface Group {
  repoDir: string;
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
  repoDir: string;
  children: Group['children'];
  containerDir: string; // for the duplicate-label hint
}

/** Label a folder by basename, or by full path when it sits outside homeRoot. */
function labelOf(homeRoot: string, path: string): string {
  return relPath(homeRoot, path) === null ? path : basename(path);
}

export function buildFolderRows(
  folders: FolderReport[],
  homeRoot: string,
  opts: { sort: SortMode; showHidden: boolean; expanded?: ReadonlySet<string> },
): FolderRow[] {
  const expanded = opts.expanded ?? new Set<string>();

  const groups = new Map<string, Group>();
  const groupFor = (repoDir: string): Group => {
    let g = groups.get(repoDir);
    if (!g) { g = { repoDir, mainRepo: null, children: [] }; groups.set(repoDir, g); }
    return g;
  };
  const plain: { folder: FolderReport; outside: boolean }[] = [];

  for (const f of folders) {
    // A worktree checkout groups under its repo wherever it lives on disk, and
    // is exempt from the hidden filter — its path may sit under `~/.herdr` or a
    // repo's own `.claude/…`, but it belongs to a visible repo.
    if (f.git?.isWorktree && f.git.mainCheckout) {
      groupFor(f.git.mainCheckout).children.push({
        nodeId: f.path, label: basename(f.path), count: ownDelta(f), folder: f,
      });
      continue;
    }
    const rel = relPath(homeRoot, f.path);
    if (rel !== null && !opts.showHidden && isHiddenPath(rel)) continue; // hidden filter (non-checkouts)
    if (basename(f.path).endsWith('.worktree')) continue; // a git worktree bucket dir, never a project
    plain.push({ folder: f, outside: rel === null });
  }

  // A discovered folder whose path is a group's repoDir is that repo's main
  // checkout — fold it in so it isn't also listed as a standalone sibling.
  const top: TopRow[] = [];
  for (const o of plain) {
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
      repoDir: '',
      children: [],
      containerDir: basename(dirname(o.folder.path)),
    });
  }
  for (const g of groups.values()) {
    top.push({
      nodeId: g.repoDir,
      label: labelOf(homeRoot, g.repoDir),
      count: g.mainRepo ? ownDelta(g.mainRepo) : 0,
      folder: g.mainRepo,
      hasChildren: true,
      repoDir: g.repoDir,
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

    const wtNode = worktreesNodeId(r.repoDir);
    const wtExpanded = expanded.has(wtNode);
    out.push({
      nodeId: wtNode,
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
