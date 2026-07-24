/**
 * Pure-fs git worktree linking — never spawns the git binary.
 *
 * A `.git` DIRECTORY marks a normal checkout root. A `.git` FILE holds
 * `gitdir: <path>`; when that path ends in `/.git/worktrees/<name>` the
 * checkout is a linked worktree and the segment before `/.git/worktrees/`
 * is the main checkout. (Format verified against git 2.x on disk — see the
 * 2026-07-14 design spec.) Submodule gitdirs (`/.git/modules/…`) are plain
 * checkouts for our purposes.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { GitLink } from './types.js';

export type { GitLink };

const WORKTREE_GITDIR = /^(.+)\/\.git\/worktrees\/[^/]+\/?$/;

function fromGitFile(gitFile: string, checkoutDir: string): GitLink {
  let target: string | undefined;
  try {
    target = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(gitFile, 'utf8'))?.[1];
  } catch {
    /* unreadable — fall through to plain */
  }
  if (target) {
    const abs = isAbsolute(target) ? target : resolve(checkoutDir, target);
    const m = WORKTREE_GITDIR.exec(abs);
    if (m) return { repoRoot: checkoutDir, isWorktree: true, mainCheckout: m[1]! };
  }
  return { repoRoot: checkoutDir, isWorktree: false };
}

/**
 * Absolute checkout dirs of every linked worktree registered under a main
 * checkout — git's own record, so it finds worktrees wherever a tool parked
 * them (branchlet siblings, herdr's `~/.herdr`, a repo's own `.claude/…`).
 *
 * Each `<repoDir>/.git/worktrees/<name>/gitdir` holds a bare path to the
 * checkout's `.git` (no `gitdir:` prefix — that prefix is on the checkout's
 * own `.git` file, not this registry file). The checkout is its parent dir.
 * A checkout that no longer exists on disk is a stale entry git hasn't pruned;
 * skip it. Only meaningful for a main checkout (`.git` is a directory).
 */
export function worktreesOf(repoDir: string): string[] {
  const base = join(repoDir, '.git', 'worktrees');
  let entries;
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return []; // no linked worktrees (or not a main checkout)
  }
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    let raw: string;
    try {
      raw = readFileSync(join(base, e.name, 'gitdir'), 'utf8').trim();
    } catch {
      continue; // unreadable entry
    }
    if (!raw) continue;
    const target = isAbsolute(raw) ? raw : resolve(base, e.name, raw);
    const checkout = dirname(target); // target is `<checkout>/.git`
    try {
      if (statSync(checkout).isDirectory()) out.push(checkout);
    } catch {
      /* stale entry — checkout was removed without `git worktree prune` */
    }
  }
  return out;
}

/** Nearest enclosing git checkout of `start`, or null when there is none. */
export function gitLink(start: string): GitLink | null {
  for (let dir = start; ; ) {
    let st;
    try {
      st = statSync(join(dir, '.git'));
    } catch {
      st = undefined;
    }
    if (st?.isDirectory()) return { repoRoot: dir, isWorktree: false };
    if (st?.isFile()) return fromGitFile(join(dir, '.git'), dir);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
