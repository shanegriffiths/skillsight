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
});
