import { describe, expect, it, afterEach } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gitLink } from '../src/git.js';
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
