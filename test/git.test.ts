import { describe, expect, it, afterEach } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gitLink, worktreesOf } from '../src/git.js';
import { cleanup, makeTempHome, writeFileEnsured } from './helpers.js';

describe('gitLink', () => {
  const homes: string[] = [];
  const home = () => { const h = makeTempHome(); homes.push(h); return h; };
  afterEach(() => { for (const h of homes.splice(0)) cleanup(h); });

  it('finds a normal checkout from a nested dir', () => {
    const h = home();
    mkdirSync(join(h, 'repo', '.git'), { recursive: true });
    mkdirSync(join(h, 'repo', 'a', 'b'), { recursive: true });
    expect(gitLink(join(h, 'repo', 'a', 'b'))).toEqual({
      repoRoot: join(h, 'repo'), isWorktree: false,
    });
  });

  it('identifies a linked worktree via an absolute gitdir', () => {
    const h = home();
    mkdirSync(join(h, 'repo', '.git', 'worktrees', 'wt'), { recursive: true });
    writeFileEnsured(join(h, 'wt', '.git'), `gitdir: ${join(h, 'repo', '.git', 'worktrees', 'wt')}\n`);
    mkdirSync(join(h, 'wt', 'deep'), { recursive: true });
    expect(gitLink(join(h, 'wt', 'deep'))).toEqual({
      repoRoot: join(h, 'wt'), isWorktree: true, mainCheckout: join(h, 'repo'),
    });
  });

  it('identifies a linked worktree via a relative gitdir', () => {
    const h = home();
    mkdirSync(join(h, 'repo', '.git', 'worktrees', 'wt'), { recursive: true });
    writeFileEnsured(join(h, 'wt', '.git'), 'gitdir: ../repo/.git/worktrees/wt\n');
    expect(gitLink(join(h, 'wt'))).toEqual({
      repoRoot: join(h, 'wt'), isWorktree: true, mainCheckout: join(h, 'repo'),
    });
  });

  it('treats a submodule-style gitdir as a plain checkout', () => {
    const h = home();
    writeFileEnsured(join(h, 'sub', '.git'), `gitdir: ${join(h, '.git', 'modules', 'sub')}\n`);
    expect(gitLink(join(h, 'sub'))).toEqual({ repoRoot: join(h, 'sub'), isWorktree: false });
  });

  it('returns null when no .git exists up to the root', () => {
    const h = home();
    mkdirSync(join(h, 'plain'), { recursive: true });
    expect(gitLink(join(h, 'plain'))).toBeNull();
  });
});

describe('worktreesOf', () => {
  const homes: string[] = [];
  const home = () => { const h = makeTempHome(); homes.push(h); return h; };
  afterEach(() => { for (const h of homes.splice(0)) cleanup(h); });

  /** Register a linked worktree `name` living at `checkout`, git-style. */
  const register = (repo: string, name: string, checkout: string) => {
    writeFileEnsured(join(repo, '.git', 'worktrees', name, 'gitdir'), `${join(checkout, '.git')}\n`);
    writeFileEnsured(join(checkout, '.git'), `gitdir: ${join(repo, '.git', 'worktrees', name)}\n`);
  };

  it('enumerates every linked checkout wherever it lives on disk', () => {
    const h = home();
    const repo = join(h, 'Projects', 'app');
    mkdirSync(join(repo, '.git'), { recursive: true });
    register(repo, 'animation', join(h, 'Projects', 'app.worktree', 'animation')); // branchlet sibling
    register(repo, 'posthog', join(h, '.herdr', 'worktrees', 'app', 'posthog')); // central, dot-dir
    register(repo, 'variant', join(repo, '.claude', 'worktrees', 'variant')); // inside the repo
    expect(worktreesOf(repo).sort()).toEqual([
      join(h, '.herdr', 'worktrees', 'app', 'posthog'),
      join(h, 'Projects', 'app.worktree', 'animation'),
      join(repo, '.claude', 'worktrees', 'variant'),
    ].sort());
  });

  it('skips a stale registry entry whose checkout no longer exists on disk', () => {
    const h = home();
    const repo = join(h, 'app');
    mkdirSync(join(repo, '.git'), { recursive: true });
    register(repo, 'live', join(h, 'wt', 'live'));
    // stale: gitdir file present, but the checkout dir was deleted
    writeFileEnsured(join(repo, '.git', 'worktrees', 'gone', 'gitdir'), `${join(h, 'wt', 'gone', '.git')}\n`);
    expect(worktreesOf(repo)).toEqual([join(h, 'wt', 'live')]);
  });

  it('returns [] when the repo has no linked worktrees', () => {
    const h = home();
    const repo = join(h, 'app');
    mkdirSync(join(repo, '.git'), { recursive: true });
    expect(worktreesOf(repo)).toEqual([]);
  });
});
