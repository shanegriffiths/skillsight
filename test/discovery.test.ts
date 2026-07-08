import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup, ctxOf, writeFileEnsured } from './helpers.js';
import { discover } from '../src/discovery.js';

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

describe('discover', () => {
  it('excludes the home root and / from the project registry', () => {
    home = makeTempHome();
    const proj = join(home, 'Developer', 'proj');
    writeFileEnsured(join(proj, '.mcp.json'), '{}'); // real dir + marker
    writeFileEnsured(
      join(home, '.claude.json'),
      JSON.stringify({ projects: { [home]: {}, '/': {}, [proj]: {} } }),
    );

    const dirs = discover(ctxOf(home), { walk: false });
    expect(dirs).not.toContain(home); // home dir must not masquerade as a project
    expect(dirs).not.toContain('/');
    expect(dirs).toContain(proj);
  });

  it('does not include the home root even with the filesystem walk on', () => {
    home = makeTempHome();
    // home has runtime markers (would match hasMarker) but must never be a "folder"
    writeFileEnsured(join(home, '.claude', 'settings.json'), '{}');
    writeFileEnsured(join(home, '.claude.json'), JSON.stringify({ projects: { [home]: {} } }));

    const dirs = discover(ctxOf(home), { walk: true });
    expect(dirs).not.toContain(home);
  });

  it('discovers git worktrees beside a discovered repo (branchlet `<repo>.worktree/<branch>`)', () => {
    home = makeTempHome();
    const container = join(home, 'Developer', 'Acme');
    const repo = join(container, 'acme-web');
    writeFileEnsured(join(repo, 'CLAUDE.md'), '# acme'); // repo marker

    // branchlet puts worktrees in a sibling `<repo>.worktree/` bucket, not inside the repo
    const wtA = join(container, 'acme-web.worktree', 'feature-x');
    const wtB = join(container, 'acme-web.worktree', 'bugfix-y');
    for (const wt of [wtA, wtB]) {
      writeFileEnsured(join(wt, '.git'), 'gitdir: /elsewhere'); // a checkout carries a .git pointer file
      writeFileEnsured(join(wt, 'CLAUDE.md'), '# checkout');
    }
    // a stray dir in the bucket with no .git is not a worktree
    const stray = join(container, 'acme-web.worktree', 'notes');
    writeFileEnsured(join(stray, 'README.md'), 'x');

    // the repo is discovered via the registry; the worktrees are NOT registered
    writeFileEnsured(join(home, '.claude.json'), JSON.stringify({ projects: { [repo]: {} } }));

    const dirs = discover(ctxOf(home), { walk: false });
    expect(dirs).toContain(repo);
    expect(dirs).toContain(wtA);
    expect(dirs).toContain(wtB);
    expect(dirs).not.toContain(stray);
  });
});
