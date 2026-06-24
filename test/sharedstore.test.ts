import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { makeTempHome, cleanup, ctxOf, writeFileEnsured, writeSkillDir, symlinkInto } from './helpers.js';
import { collectSharedStore } from '../src/sharedstore.js';
import { buildReverseSymlinkIndex, lookupUsedBy } from '../src/symlinks.js';

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

describe('collectSharedStore', () => {
  it('walks the hub + enriches from .skill-lock.json, including no-lock skills', () => {
    home = makeTempHome();
    const hub = join(home, '.agents', 'skills');
    writeSkillDir(hub, 'alpha', { description: 'Alpha skill' });
    writeSkillDir(hub, 'beta'); // no lock entry
    writeFileEnsured(
      join(home, '.agents', '.skill-lock.json'),
      JSON.stringify({
        version: 3,
        skills: {
          alpha: {
            source: 'owner/repo',
            sourceUrl: 'https://github.com/owner/repo',
            skillFolderHash: 'hash-abc',
            skillPath: 'skills/alpha',
          },
        },
        lastSelectedAgents: ['warp', 'codex', 'claude-code'],
      }),
    );

    const res = collectSharedStore(ctxOf(home));
    const byName = Object.fromEntries(res.skills.map((s) => [s.name, s]));
    expect(Object.keys(byName).sort()).toEqual(['alpha', 'beta']);
    expect(byName.alpha!.source).toBe('owner/repo');
    expect(byName.alpha!.skillFolderHash).toBe('hash-abc');
    expect(byName.alpha!.contentId).toBe('hash-abc');
    expect(byName.alpha!.description).toBe('Alpha skill');
    // no-lock skill: contentId falls back to realPath, no source
    expect(byName.beta!.source).toBeUndefined();
    expect(byName.beta!.contentId).toBe(byName.beta!.realPath);
    expect(res.lastSelectedAgents).toContain('warp');
    expect(res.warnings).toHaveLength(0);
  });

  it('records a warning for a malformed lock but still returns hub skills', () => {
    home = makeTempHome();
    const hub = join(home, '.agents', 'skills');
    writeSkillDir(hub, 'alpha');
    writeFileEnsured(join(home, '.agents', '.skill-lock.json'), '{ not json');

    const res = collectSharedStore(ctxOf(home));
    expect(res.skills.map((s) => s.name)).toEqual(['alpha']);
    expect(res.warnings[0]!.reason).toMatch(/malformed/);
  });
});

describe('buildReverseSymlinkIndex', () => {
  it('attributes hub skills to runtimes whose distinct dirs symlink in', () => {
    home = makeTempHome();
    const hub = join(home, '.agents', 'skills');
    const alphaDir = writeSkillDir(hub, 'alpha');
    symlinkInto(join(home, '.claude', 'skills', 'alpha'), alphaDir); // claude-code
    symlinkInto(join(home, '.copilot', 'skills', 'alpha'), alphaDir); // github-copilot (distinct dir)
    const localDir = writeSkillDir(join(home, '.claude', 'skills'), 'local-only'); // real, claude-local

    const idx = buildReverseSymlinkIndex(ctxOf(home));
    expect(lookupUsedBy(idx, realpathSync(alphaDir))).toEqual(['claude-code', 'github-copilot']);
    expect(lookupUsedBy(idx, realpathSync(localDir))).toEqual(['claude-code']);
  });

  it('does not over-attribute when a runtime dir is the hub itself', () => {
    home = makeTempHome();
    const hub = join(home, '.agents', 'skills');
    const alphaDir = writeSkillDir(hub, 'alpha');
    // warp/cline/zed resolve their global skills dir to the hub -> must be skipped
    const idx = buildReverseSymlinkIndex(ctxOf(home));
    expect(lookupUsedBy(idx, realpathSync(alphaDir))).toEqual([]);
  });
});
