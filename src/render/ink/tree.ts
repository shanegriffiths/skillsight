/**
 * Folder tree for the Folders column: turn the flat `inv.folders` into a
 * collapsible, sortable hierarchy. Pure — a function of `folders[].path` +
 * `homeRoot`; no engine or discovery coupling.
 *
 * Pipeline: hidden-filter → build trie (with synthetic intermediates) →
 * compress single-child synthetic chains → aggregate subtree counts →
 * sort siblings → flatten honoring the `collapsed` set.
 */
import { relative, sep } from 'node:path';
import type { FolderReport, Runtime } from '../../types.js';
import { bucketTotal } from '../../resolve.js';
import { isHiddenPath } from '../hidden.js';
export { isHiddenPath };

export type SortMode = 'items' | 'name';

export interface FolderRow {
  /** Absolute path of this node's deepest segment — stable expand/collapse key. */
  nodeId: string;
  /** Basename, or `a/b/c` for a compressed single-child chain. */
  label: string;
  /** Indent level (0 = root). */
  depth: number;
  /** Aggregate subtree delta (own + all descendants). */
  count: number;
  /** Union of `folder.runtimes` over this subtree, sorted asc (render intersects with the six). */
  runtimes: Runtime[];
  hasChildren: boolean;
  collapsed: boolean;
  /** The discovered folder, or null for a synthetic intermediate node. */
  folder: FolderReport | null;
}

/** project-scoped ∪ local item count — what a folder adds beyond the global layer. */
function ownDelta(f: FolderReport): number {
  return bucketTotal(f.projectScoped) + bucketTotal(f.local);
}

interface TreeNode {
  path: string; // absolute path of this node's directory
  segments: string[]; // label segments (joined with '/' after compression)
  folder: FolderReport | null;
  children: Map<string, TreeNode>;
  count: number; // aggregate, filled post-order
  runtimes: Set<Runtime>; // aggregate, filled post-order
}

function relSegments(homeRoot: string, path: string): { outside: boolean; segs: string[] } {
  const rel = relative(homeRoot, path);
  if (!rel || rel.startsWith('..')) return { outside: true, segs: [path] };
  return { outside: false, segs: rel.split(sep) };
}

function buildTrie(folders: FolderReport[], homeRoot: string): Map<string, TreeNode> {
  const roots = new Map<string, TreeNode>();
  for (const f of folders) {
    const { outside, segs } = relSegments(homeRoot, f.path);
    let level = roots;
    let acc = outside ? '' : homeRoot;
    let node: TreeNode | undefined;
    for (const seg of segs) {
      acc = outside ? seg : `${acc}/${seg}`;
      node = level.get(seg);
      if (!node) {
        node = { path: acc, segments: [seg], folder: null, children: new Map(), count: 0, runtimes: new Set() };
        level.set(seg, node);
      }
      level = node.children;
    }
    if (node) node.folder = f; // terminal node is the discovered folder
  }
  return roots;
}

/** Merge runs of single-child *synthetic* nodes into their child; real nodes anchor. */
function compress(node: TreeNode): TreeNode {
  let n = node;
  while (n.folder === null && n.children.size === 1) {
    const child = [...n.children.values()][0]!;
    n = {
      path: child.path,
      segments: [...n.segments, ...child.segments],
      folder: child.folder,
      children: child.children,
      count: 0,
      runtimes: new Set(),
    };
  }
  const children = new Map<string, TreeNode>();
  for (const [k, c] of n.children) children.set(k, compress(c));
  return { ...n, children };
}

/** Post-order: count = ownDelta(self) + Σ count(children); runtimes = ∪ subtree folder.runtimes. */
function aggregate(node: TreeNode): { count: number; runtimes: Set<Runtime> } {
  let sum = node.folder ? ownDelta(node.folder) : 0;
  const runtimes = new Set<Runtime>(node.folder?.runtimes ?? []);
  for (const c of node.children.values()) {
    const r = aggregate(c);
    sum += r.count;
    for (const id of r.runtimes) runtimes.add(id);
  }
  node.count = sum;
  node.runtimes = runtimes;
  return { count: sum, runtimes };
}

const labelOf = (n: TreeNode) => n.segments.join('/');

function sortNodes(nodes: TreeNode[], sort: SortMode): TreeNode[] {
  const byName = (a: TreeNode, b: TreeNode) => labelOf(a).localeCompare(labelOf(b));
  if (sort === 'name') return [...nodes].sort(byName);
  return [...nodes].sort((a, b) => b.count - a.count || byName(a, b));
}

export function buildFolderRows(
  folders: FolderReport[],
  homeRoot: string,
  opts: { sort: SortMode; showHidden: boolean; collapsed: ReadonlySet<string> },
): FolderRow[] {
  const visible = folders.filter((f) => {
    const { outside, segs } = relSegments(homeRoot, f.path);
    if (outside) return true;
    return opts.showHidden || !isHiddenPath(segs.join('/'));
  });

  const roots = [...buildTrie(visible, homeRoot).values()].map(compress);
  roots.forEach(aggregate);

  const out: FolderRow[] = [];
  const emit = (nodes: TreeNode[], depth: number) => {
    for (const n of sortNodes(nodes, opts.sort)) {
      const hasChildren = n.children.size > 0;
      const collapsed = opts.collapsed.has(n.path);
      out.push({
        nodeId: n.path,
        label: labelOf(n),
        depth,
        count: n.count,
        hasChildren,
        collapsed,
        folder: n.folder,
        runtimes: [...n.runtimes].sort(),
      });
      if (hasChildren && !collapsed) emit([...n.children.values()], depth + 1);
    }
  };
  emit(roots, 0);
  return out;
}
