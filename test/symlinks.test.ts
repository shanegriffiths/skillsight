import { describe, expect, it, afterEach } from 'vitest';
import { join } from 'node:path';
import { buildReverseSymlinkIndex, lookupSites, lookupUsedBy, realpathSafe } from '../src/symlinks.js';
import { cleanup, ctxOf, makeTempHome, symlinkInto, writeSkillDir } from './helpers.js';

describe('SiteIndex link paths', () => {
  let home: string;
  afterEach(() => cleanup(home));

  it('records the symlink path per runtime and keeps lookupUsedBy behavior', () => {
    home = makeTempHome();
    const real = writeSkillDir(join(home, '.agents', 'skills'), 'demo');
    const link = join(home, '.claude', 'skills', 'demo');
    symlinkInto(link, real);

    const index = buildReverseSymlinkIndex(ctxOf(home));
    const key = realpathSafe(real);
    expect(lookupUsedBy(index, key)).toContain('claude-code');
    expect(lookupSites(index, key)).toContainEqual({ runtime: 'claude-code', linkPath: link });
    expect(lookupSites(index, '/nowhere')).toEqual([]);
  });
});
