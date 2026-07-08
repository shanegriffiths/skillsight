/**
 * Directory discovery: union of the Claude project registry and a pruned,
 * depth-limited on-disk walk for runtime markers. Walking stops at a detected
 * project (no descent past it) and skips heavy/irrelevant trees.
 */
import { join, relative, sep } from 'node:path';
import type { HomeCtx } from './runtimes.js';
import { exists, isDir, readDirEntries, readJson } from './fsread.js';

const MAX_DEPTH = 5;

const PRUNE = new Set([
  'node_modules', '.git', 'Library', '.Trash', '.cache', 'dist', 'build',
  '.next', '.turbo', '.venv', 'venv', '__pycache__', 'target', '.gradle',
]);

const MARKERS = [
  '.claude', '.codex', '.agents', '.gemini', '.opencode',
  'opencode.json', 'opencode.jsonc', '.mcp.json', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md',
];

function hasMarker(dir: string): boolean {
  for (const m of MARKERS) if (exists(join(dir, m))) return true;
  // Cursor only counts when it carries config (not the harness-only skills dir)
  if (exists(join(dir, '.cursor', 'mcp.json'))) return true;
  return false;
}

function* walk(root: string, depth: number): Generator<string> {
  // The home root itself is not a "project" even though it holds config dirs.
  if (depth > 0 && hasMarker(root)) {
    yield root;
    return; // don't descend past a detected project
  }
  if (depth >= MAX_DEPTH) return;
  for (const e of readDirEntries(root)) {
    if (!e.isDir || e.isSymlink) continue;
    if (e.name.startsWith('.') || PRUNE.has(e.name)) continue;
    yield* walk(join(root, e.name), depth + 1);
  }
}

/**
 * Git worktrees (branchlet's `<repo>.worktree/<branch>` convention) live in a
 * sibling bucket beside the repo, not inside it — so the depth-limited walk,
 * which also stops at the first marker-bearing ancestor, never reaches them.
 * Given a discovered repo, yield each checkout in its worktree container. A
 * checkout carries a `.git` gitdir pointer; a stray dir in the bucket does not.
 */
function* worktreesBeside(repoDir: string): Generator<string> {
  const container = `${repoDir}.worktree`;
  if (!isDir(container)) return;
  for (const e of readDirEntries(container)) {
    if (!e.isDir) continue;
    const child = join(container, e.name);
    if (exists(join(child, '.git'))) yield child;
  }
}

/** Top-level grouping area for a folder (e.g. `Developer/Projects`). */
export function groupFor(dir: string, homeRoot: string): string {
  const rel = relative(homeRoot, dir);
  if (!rel || rel.startsWith('..')) return dir;
  const parts = rel.split(sep);
  return parts.length >= 2 ? parts.slice(0, 2).join('/') : (parts[0] ?? 'home');
}

export function discover(ctx: HomeCtx, opts: { walk: boolean }): string[] {
  const set = new Set<string>();

  // The home root and filesystem root are config homes, not projects — scanning
  // them re-lists the global skill dirs (~/.claude/skills, ~/.agents/skills, …)
  // as if they were project-scoped. Always exclude them.
  const excluded = new Set(['/', ctx.homeRoot]);

  const claudeJson = readJson<{ projects?: Record<string, unknown> }>(join(ctx.homeRoot, '.claude.json'));
  for (const p of Object.keys(claudeJson?.projects ?? {})) {
    if (!excluded.has(p) && isDir(p)) set.add(p);
  }

  if (opts.walk) {
    for (const d of walk(ctx.homeRoot, 0)) set.add(d);
  }

  // Worktrees sit beside their repo, out of the walk's reach — expand every
  // discovered repo's `<repo>.worktree/` bucket so its checkouts are folders too.
  for (const d of [...set]) {
    for (const c of worktreesBeside(d)) set.add(c);
  }

  return [...set].filter((d) => !excluded.has(d)).sort();
}
