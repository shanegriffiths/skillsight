import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup, writeFileEnsured, writeSkillDir } from './helpers.js';
import { hashSkillFolder } from '../src/fsread.js';
import { enrichBucket, mergeBuckets } from '../src/resolve.js';
import { emptyBucket } from '../src/types.js';
import type { Bucket, SkillRecord } from '../src/types.js';

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

describe('hashSkillFolder', () => {
  it('same content → same hash; diverged content → different hash', () => {
    home = makeTempHome();
    writeFileEnsured(join(home, 'a', 'SKILL.md'), 'x');
    writeFileEnsured(join(home, 'a', 'refs', 'r.md'), 'r');
    writeFileEnsured(join(home, 'b', 'SKILL.md'), 'x');
    writeFileEnsured(join(home, 'b', 'refs', 'r.md'), 'r');
    writeFileEnsured(join(home, 'c', 'SKILL.md'), 'DIFFERENT');
    writeFileEnsured(join(home, 'c', 'refs', 'r.md'), 'r');
    const a = hashSkillFolder(join(home, 'a'));
    expect(a).toBeDefined();
    expect(a).toBe(hashSkillFolder(join(home, 'b')));
    expect(a).not.toBe(hashSkillFolder(join(home, 'c')));
  });

  it('hashes content, not just filenames', () => {
    home = makeTempHome();
    writeFileEnsured(join(home, 'a', 'SKILL.md'), 'one');
    writeFileEnsured(join(home, 'b', 'SKILL.md'), 'two');
    expect(hashSkillFolder(join(home, 'a'))).not.toBe(hashSkillFolder(join(home, 'b')));
  });

  it('is undefined for a missing folder', () => {
    home = makeTempHome();
    expect(hashSkillFolder(join(home, 'nope'))).toBeUndefined();
  });
});

describe('enrichBucket content-identity for project-local skills', () => {
  const enr = () => ({ sharedByRealpath: new Map(), reverseIndex: new Map(), usageByKey: new Map() }) as never;
  const local = (path: string): SkillRecord => ({
    name: 'agent-browser', contentId: path,
    provider: { kind: 'project-local', path }, usedBy: [], enabled: true, scope: 'project-scoped',
  });
  const withSkills = (...skills: SkillRecord[]): Bucket => ({ ...emptyBucket(), skills });

  it('gives byte-identical project-local copies the same contentId, so they dedupe', () => {
    home = makeTempHome();
    const a = writeSkillDir(join(home, 'projA', '.claude', 'skills'), 'agent-browser', { description: 'Browse' });
    const b = writeSkillDir(join(home, 'projB', '.claude', 'skills'), 'agent-browser', { description: 'Browse' });
    const c = writeSkillDir(join(home, 'projC', '.claude', 'skills'), 'agent-browser', { description: 'DIVERGED' });
    const bA = withSkills(local(a));
    const bB = withSkills(local(b));
    const bC = withSkills(local(c));
    enrichBucket(bA, 'claude-code', enr());
    enrichBucket(bB, 'claude-code', enr());
    enrichBucket(bC, 'claude-code', enr());

    expect(bA.skills[0]!.contentId).toBe(bB.skills[0]!.contentId); // identical → same id
    expect(bA.skills[0]!.contentId).not.toBe(a); // content-based, not the raw path
    expect(bA.skills[0]!.contentId).not.toBe(bC.skills[0]!.contentId); // diverged → different id
    // identical copies collapse; the diverged one stays separate
    expect(mergeBuckets(bA, bB, bC).skills).toHaveLength(2);
  });
});
