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
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface GitLink {
  /** Root of the checkout containing the path (the worktree root for worktrees). */
  repoRoot: string;
  isWorktree: boolean;
  /** Main checkout root when this is a linked worktree. */
  mainCheckout?: string;
}

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
