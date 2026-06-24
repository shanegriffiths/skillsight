import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup, writeFileEnsured } from './helpers.js';
import { computeWatchPaths } from '../src/render/ink/watchpaths.js';
import type { Inventory } from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function invWithFolder(home: string, proj: string): Inventory {
  return {
    generatedAt: '',
    homeRoot: home,
    runtimesDetected: [],
    warnings: [],
    global: emptyBucket(),
    folders: [
      {
        path: proj,
        group: 'g',
        runtimes: [],
        global: emptyBucket(),
        projectScoped: emptyBucket(),
        local: emptyBucket(),
        effective: emptyBucket(),
      },
    ],
  };
}

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

describe('computeWatchPaths', () => {
  it('returns only existing global + per-folder config files', () => {
    home = makeTempHome();
    const proj = join(home, 'proj');
    writeFileEnsured(join(home, '.claude', 'settings.json'), '{}');
    writeFileEnsured(join(home, '.claude.json'), '{}');
    writeFileEnsured(join(home, '.codex', 'config.toml'), '');
    writeFileEnsured(join(proj, '.mcp.json'), '{}');

    const paths = computeWatchPaths(home, invWithFolder(home, proj), {});
    expect(paths).toContain(join(home, '.claude', 'settings.json'));
    expect(paths).toContain(join(home, '.claude.json'));
    expect(paths).toContain(join(home, '.codex', 'config.toml'));
    expect(paths).toContain(join(proj, '.mcp.json'));
    // a path that doesn't exist is excluded
    expect(paths).not.toContain(join(proj, '.cursor', 'mcp.json'));
  });
});
