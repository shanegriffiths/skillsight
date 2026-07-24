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

  it('discovers a repo\'s linked worktrees via git\'s registry, wherever they live', () => {
    home = makeTempHome();
    const container = join(home, 'Developer', 'Acme');
    const repo = join(container, 'acme-web');
    writeFileEnsured(join(repo, 'CLAUDE.md'), '# acme'); // repo marker

    // git records every linked worktree under <repo>/.git/worktrees/<name>/gitdir,
    // a bare path to the checkout's own .git — regardless of where the checkout sits.
    const register = (name: string, checkout: string) => {
      writeFileEnsured(join(repo, '.git', 'worktrees', name, 'gitdir'), `${join(checkout, '.git')}\n`);
      writeFileEnsured(join(checkout, '.git'), `gitdir: ${join(repo, '.git', 'worktrees', name)}\n`);
    };
    const sibling = join(container, 'acme-web.worktree', 'feature-x'); // branchlet
    const central = join(home, '.herdr', 'worktrees', 'acme-web', 'posthog'); // herdr, dot-dir
    const inRepo = join(repo, '.claude', 'worktrees', 'variant'); // inside the repo's dotdir
    register('feature-x', sibling);
    register('posthog', central);
    register('variant', inRepo);

    // the repo is discovered via the registry; the worktrees are NOT registered there
    writeFileEnsured(join(home, '.claude.json'), JSON.stringify({ projects: { [repo]: {} } }));

    const dirs = discover(ctxOf(home), { walk: false });
    expect(dirs).toContain(repo);
    expect(dirs).toContain(sibling);
    expect(dirs).toContain(central); // was invisible before — the herdr bug
    expect(dirs).toContain(inRepo); // walk never descends past the repo marker
  });
});
