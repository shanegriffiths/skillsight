// test/resolve.test.ts
import { describe, it, expect } from 'vitest';
import { mergeBuckets, splitByScope, bucketCounts, bucketTotal } from '../src/resolve.js';
import { emptyBucket } from '../src/types.js';
import type { Bucket, SkillRecord } from '../src/types.js';

function sk(over: Partial<SkillRecord>): SkillRecord {
  return {
    name: 'a', contentId: 'c1',
    provider: { kind: 'user', path: '/p/a' },
    usedBy: [], enabled: true, scope: 'global',
    ...over,
  };
}
const withSkills = (...skills: SkillRecord[]): Bucket => ({ ...emptyBucket(), skills });

describe('mergeBuckets skill precedence (PROVIDER_RANK)', () => {
  it('higher-ranked provider wins regardless of order', () => {
    const user = sk({ provider: { kind: 'user', path: '/p/a' } });
    const shared = sk({ provider: { kind: 'shared-store', path: '/hub/a' } });
    expect(mergeBuckets(withSkills(user), withSkills(shared)).skills[0]!.provider.kind).toBe('shared-store');
    expect(mergeBuckets(withSkills(shared), withSkills(user)).skills[0]!.provider.kind).toBe('shared-store');
  });

  it('unions usedBy sorted', () => {
    const a = sk({ usedBy: ['codex', 'claude-code'] });
    const b = sk({ usedBy: ['warp', 'codex'] });
    expect(mergeBuckets(withSkills(a), withSkills(b)).skills[0]!.usedBy).toEqual(['claude-code', 'codex', 'warp']);
  });

  it('backfills description and bundledInPlugin from the losing record', () => {
    const winner = sk({ provider: { kind: 'shared-store', path: '/hub/a' } }); // no description
    const loser = sk({ description: 'from loser', bundledInPlugin: 'pl@m' });
    const merged = mergeBuckets(withSkills(loser), withSkills(winner)).skills[0]!;
    expect(merged.provider.kind).toBe('shared-store');
    expect(merged.description).toBe('from loser');
    expect(merged.bundledInPlugin).toBe('pl@m');
  });

  it('does not mutate input records (copies on insert)', () => {
    const a = sk({ usedBy: ['claude-code'] });
    mergeBuckets(withSkills(a), withSkills(sk({ usedBy: ['codex'] })));
    expect(a.usedBy).toEqual(['claude-code']);
  });
});

describe('mergeBuckets mcp identity', () => {
  it('same name+scope but different provider path both survive', () => {
    const mk = (path: string) => ({
      ...emptyBucket(),
      mcp: [{
        name: 'srv', transport: { kind: 'stdio' as const }, scope: 'global' as const,
        enabled: true, provider: { kind: 'user' as const, path },
      }],
    });
    expect(mergeBuckets(mk('/a.json'), mk('/b.json')).mcp).toHaveLength(2);
  });
});

describe('splitByScope', () => {
  it('routes local skills/mcp to local; all plugins to projectScoped', () => {
    const bucket: Bucket = {
      skills: [sk({ scope: 'local' }), sk({ contentId: 'c2', scope: 'project-scoped' })],
      plugins: [{
        id: 'p@m', name: 'p', marketplace: 'm', version: '1', scope: 'user', enabled: true,
        provides: { skills: [], commands: [], agents: [], mcpServers: [] }, supportsRuntimes: [],
      }],
      mcp: [{
        name: 'l', transport: { kind: 'stdio' }, scope: 'local', enabled: true,
        provider: { kind: 'project-local', path: '/x' },
      }],
    };
    const { projectScoped, local } = splitByScope(bucket);
    expect(local.skills).toHaveLength(1);
    expect(local.mcp).toHaveLength(1);
    expect(projectScoped.skills).toHaveLength(1);
    expect(projectScoped.plugins).toHaveLength(1);
    expect(bucketCounts(local)).toEqual({ skills: 1, plugins: 0, mcp: 1 });
  });
});

describe('bucketTotal', () => {
  it('sums skills + plugins + mcp', () => {
    const b = {
      skills: [sk({}), sk({ contentId: 'c2' })],
      plugins: [],
      mcp: [{
        name: 'm', transport: { kind: 'stdio' as const }, scope: 'global' as const,
        enabled: true, provider: { kind: 'user' as const, path: '/x' },
      }],
    };
    expect(bucketTotal(b)).toBe(3);
    expect(bucketTotal(emptyBucket())).toBe(0);
  });
});
