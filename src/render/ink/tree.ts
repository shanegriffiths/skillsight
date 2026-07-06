/**
 * Flat project list for the Folders column, with one exception: git-worktree
 * checkouts (Shane's `<repo>.worktree/<branch>` convention) collapse under a
 * synthetic, expandable container row so they don't scatter as bare basenames.
 * Everything else stays a flat leaf. Pure — a function of `folders[].path` +
 * `homeRoot`; no engine or discovery coupling.
 */
import { basename, dirname, relative, sep } from 'node:path';
import type { FolderReport } from '../../types.js';
import { bucketTotal } from '../../resolve.js';
import { isHiddenPath } from '../hidden.js';
export { isHiddenPath };

export type SortMode = 'items' | 'name';

export interface FolderRow {
  /** Absolute path — stable row key (container path for a worktree group). */
  nodeId: string;
  /** Basename / stripped container name; full path for folders outside homeRoot. */
  label: string;
  /** Parent-dir hint, present only when two top-level rows share a label. */
  hint?: string;
  /** Own delta for a project; aggregate over children for a worktree group. */
  count: number;
  /** 0 = top level, 1 = a worktree checkout under its container. */
  depth: number;
  kind: 'project' | 'worktree';
  /** True for a worktree container (expandable). */
  hasChildren: boolean;
  collapsed: boolean;
  /** The discovered folder; null for a synthetic worktree container. */
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
  containerPath: string;
  containerLabel: string;
  childLabel: string;
}

/**
 * If `path` sits inside a `*.worktree` container (a strict ancestor segment ends
 * in `.worktree`), describe that container and this checkout's label within it.
 */
function worktreeOf(homeRoot: string, path: string): WorktreeInfo | null {
  const rel = relPath(homeRoot, path);
  if (rel === null) return null;
  const segs = rel.split('/');
  // Strict ancestor only (stop before the final segment); nearest container wins.
  for (let i = segs.length - 2; i >= 0; i--) {
    if (segs[i]!.endsWith('.worktree')) {
      return {
        containerPath: `${homeRoot}/${segs.slice(0, i + 1).join('/')}`,
        containerLabel: segs[i]!.replace(/\.worktree$/, ''),
        childLabel: segs.slice(i + 1).join('/'),
      };
    }
  }
  return null;
}

interface TopRow {
  nodeId: string;
  label: string;
  count: number;
  kind: 'project' | 'worktree';
  folder: FolderReport | null;
  /** Sorted checkout children (worktree groups only). */
  children: { nodeId: string; label: string; count: number; folder: FolderReport }[];
  containerDir: string; // for the duplicate-label hint
}

export function buildFolderRows(
  folders: FolderReport[],
  homeRoot: string,
  opts: { sort: SortMode; showHidden: boolean; expanded?: ReadonlySet<string> },
): FolderRow[] {
  const expanded = opts.expanded ?? new Set<string>();

  const projects: TopRow[] = [];
  const groups = new Map<string, TopRow>();

  for (const f of folders) {
    const rel = relPath(homeRoot, f.path);
    if (rel !== null && !opts.showHidden && isHiddenPath(rel)) continue;

    const wt = rel === null ? null : worktreeOf(homeRoot, f.path);
    if (wt) {
      let group = groups.get(wt.containerPath);
      if (!group) {
        group = {
          nodeId: wt.containerPath,
          label: wt.containerLabel,
          count: 0,
          kind: 'worktree',
          folder: null,
          children: [],
          containerDir: basename(dirname(wt.containerPath)),
        };
        groups.set(wt.containerPath, group);
      }
      group.children.push({ nodeId: f.path, label: wt.childLabel, count: ownDelta(f), folder: f });
      group.count += ownDelta(f);
    } else {
      projects.push({
        nodeId: f.path,
        label: rel === null ? f.path : basename(f.path),
        count: ownDelta(f),
        kind: 'project',
        folder: f,
        children: [],
        containerDir: basename(dirname(f.path)),
      });
    }
  }

  const top = [...projects, ...groups.values()];

  // Disambiguate duplicate top-level labels with a dim parent-dir hint — but a
  // worktree group and a plain project of the same name aren't a collision (the
  // `·wt` tag + chevron already tell them apart), so key the hint by kind too.
  // This matters most for a repo sitting beside its own `<repo>.worktree`.
  const keyOf = (r: TopRow) => `${r.kind}:${r.label}`;
  const byKey = new Map<string, TopRow[]>();
  for (const r of top) {
    const arr = byKey.get(keyOf(r));
    if (arr) arr.push(r);
    else byKey.set(keyOf(r), [r]);
  }
  const hintFor = (r: TopRow): string | undefined =>
    (byKey.get(keyOf(r))?.length ?? 0) > 1 ? r.containerDir : undefined;

  const byName = <T extends { label: string; count: number }>(a: T, b: T) => a.label.localeCompare(b.label);
  const cmp = <T extends { label: string; count: number }>(a: T, b: T) =>
    opts.sort === 'name' ? byName(a, b) : b.count - a.count || byName(a, b);

  top.sort(cmp);

  const out: FolderRow[] = [];
  for (const r of top) {
    const hint = hintFor(r);
    const isGroup = r.kind === 'worktree';
    const isExpanded = expanded.has(r.nodeId);
    out.push({
      nodeId: r.nodeId,
      label: r.label,
      ...(hint ? { hint } : {}),
      count: r.count,
      depth: 0,
      kind: r.kind,
      hasChildren: isGroup,
      collapsed: isGroup && !isExpanded,
      folder: r.folder,
    });
    if (isGroup && isExpanded) {
      for (const c of [...r.children].sort(cmp)) {
        out.push({
          nodeId: c.nodeId,
          label: c.label,
          count: c.count,
          depth: 1,
          kind: 'project',
          hasChildren: false,
          collapsed: false,
          folder: c.folder,
        });
      }
    }
  }
  return out;
}
