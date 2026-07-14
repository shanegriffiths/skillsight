// test/resolve.test.ts
import { describe, it, expect } from 'vitest';
import { mergeBuckets, splitByScope, bucketCounts, bucketTotal, sharedStoreBucket, enrichBucket } from '../src/resolve.js';
import { emptyBucket } from '../src/types.js';
import type { Bucket, SkillRecord } from '../src/types.js';
import type { SharedSkill } from '../src/sharedstore.js';

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

describe('sharedStoreBucket reach', () => {
  const shared = (over: Partial<SharedSkill>): SharedSkill => ({
    name: 'chartli', realPath: '/hub/chartli', contentId: 'h1', skillFolderHash: 'h1', ...over,
  });
  // `warp`/`zed` are hub-direct (universal) agents that used to be folded in.
  const enr = (reverse: Record<string, string[]>) =>
    ({
      sharedByRealpath: new Map(),
      usageByKey: new Map(),
      reverseIndex: new Map(Object.entries(reverse).map(([k, v]) => [k, new Set(v)])),
    }) as never;

  it('reach counts only runtimes that symlink the skill — not lastSelectedAgents', () => {
    const b = sharedStoreBucket([shared({})], enr({ '/hub/chartli': ['claude-code'] }));
    expect(b.skills[0]!.usedBy).toEqual(['claude-code']);
  });

  it('reports empty reach for a hub-direct-only skill (no symlinks)', () => {
    const b = sharedStoreBucket([shared({ realPath: '/hub/solo', contentId: 'h2' })], enr({}));
    expect(b.skills[0]!.usedBy).toEqual([]);
  });
});

describe('usage enrichment', () => {
  it('sets usageCount by name (standalone) and plugin:name (bundled)', () => {
    const bucket = withSkills(
      sk({ name: 'agent-browser', provider: { kind: 'project-local', path: '/p/ab' } }),
      sk({ name: 'brainstorming', contentId: 'c2', bundledInPlugin: 'superpowers@claude-plugins-official', provider: { kind: 'plugin', path: '/p/br' } }),
    );
    const enr = {
      sharedByRealpath: new Map(),
      reverseIndex: new Map(),
      usageByKey: new Map([
        ['agent-browser', { count: 29, lastUsedAt: 111 }],
        ['superpowers:brainstorming', { count: 90 }],
      ]),
    } as never;
    enrichBucket(bucket, 'claude-code', enr);
    const byName = Object.fromEntries(bucket.skills.map((s) => [s.name, s]));
    expect(byName['agent-browser']!.usageCount).toBe(29);
    expect(byName['agent-browser']!.lastUsedAt).toBe(111);
    expect(byName['brainstorming']!.usageCount).toBe(90);
  });

  it('preserves usageCount through merge', () => {
    const a = sk({ usageCount: 12 });
    const b = sk({ provider: { kind: 'shared-store', path: '/hub/a' } }); // higher rank, no usage
    const merged = mergeBuckets(withSkills(b), withSkills(a)).skills[0]!;
    expect(merged.provider.kind).toBe('shared-store');
    expect(merged.usageCount).toBe(12);
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

// helper local to the new describe block
const skillAt = (path: string, contentId: string, kind: string = 'project-local'): SkillRecord => ({
  name: 'dupe', contentId,
  provider: { kind: kind as any, path },
  usedBy: [], enabled: true, scope: 'project-scoped',
});

describe('mergeSkill copies retention', () => {
  it('keeps the merged-away path as a copy', () => {
    const merged = mergeBuckets(
      { ...emptyBucket(), skills: [skillAt('/a/x', 'c1')] },
      { ...emptyBucket(), skills: [skillAt('/b/x', 'c1')] },
    );
    expect(merged.skills).toHaveLength(1);
    expect(merged.skills[0]!.copies).toEqual([{ path: '/b/x', providerKind: 'project-local' }]);
  });

  it('does not record the survivor path or duplicates as copies', () => {
    const merged = mergeBuckets(
      { ...emptyBucket(), skills: [skillAt('/a/x', 'c1')] },
      { ...emptyBucket(), skills: [skillAt('/a/x', 'c1')] },
    );
    expect(merged.skills[0]!.copies).toBeUndefined();
  });

  it('accumulates copies across repeated merges', () => {
    const first = mergeBuckets(
      { ...emptyBucket(), skills: [skillAt('/a/x', 'c1')] },
      { ...emptyBucket(), skills: [skillAt('/b/x', 'c1')] },
    );
    const merged = mergeBuckets(first, { ...emptyBucket(), skills: [skillAt('/c/x', 'c1')] });
    expect(merged.skills[0]!.copies).toEqual([
      { path: '/b/x', providerKind: 'project-local' },
      { path: '/c/x', providerKind: 'project-local' },
    ]);
  });

  it('a higher-ranked newcomer keeps the demoted record as a copy', () => {
    const merged = mergeBuckets(
      { ...emptyBucket(), skills: [skillAt('/proj/x', 'c1', 'project-local')] },
      { ...emptyBucket(), skills: [skillAt('/hub/x', 'c1', 'shared-store')] },
    );
    expect(merged.skills[0]!.provider.path).toBe('/hub/x');
    expect(merged.skills[0]!.copies).toEqual([{ path: '/proj/x', providerKind: 'project-local' }]);
  });
});
