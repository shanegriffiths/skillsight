import { describe, it, expect } from 'vitest';
import { leaderboard, installed, groupBySource, leaderboardStats, summaryStats } from '../src/render/ink/stats.js';
import type { ItemRow } from '../src/render/ink/rows.js';
import { formatCounts } from '../src/render/format.js';
import type {
  Bucket,
  FolderReport,
  Inventory,
  McpRecord,
  PluginRecord,
  Provider,
  SkillRecord,
} from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function skill(
  name: string,
  usedBy: string[],
  opts: { contentId?: string; source?: string; kind?: Provider['kind'] } = {},
): SkillRecord {
  const kind = opts.kind ?? (opts.source ? 'shared-store' : 'project-local');
  return {
    name,
    contentId: opts.contentId ?? name,
    provider: { kind, source: opts.source, path: `/x/${name}` },
    usedBy,
    enabled: true,
    scope: 'project-scoped',
  };
}

function plugin(id: string): PluginRecord {
  return {
    id,
    name: id,
    marketplace: 'official',
    version: '1.0.0',
    scope: 'user',
    enabled: true,
    provides: { skills: [], commands: [], agents: [], mcpServers: [] },
    supportsRuntimes: [],
  };
}

function mcp(name: string): McpRecord {
  return {
    name,
    transport: { kind: 'stdio' },
    provider: { kind: 'user', path: `/x/${name}` },
    scope: 'project-scoped',
    enabled: true,
  };
}

function bucket(b: Partial<Bucket>): Bucket {
  return { ...emptyBucket(), ...b };
}

function folder(b: Partial<Pick<FolderReport, 'projectScoped' | 'local'>>, path = '/p'): FolderReport {
  return {
    path,
    group: 'g',
    runtimes: [],
    global: emptyBucket(),
    projectScoped: b.projectScoped ?? emptyBucket(),
    local: b.local ?? emptyBucket(),
    effective: emptyBucket(),
  };
}

function inv(p: { global?: Bucket; folders?: FolderReport[]; runtimes?: string[] }): Inventory {
  return {
    generatedAt: '2026-06-25',
    homeRoot: '/home',
    runtimesDetected: p.runtimes ?? [],
    warnings: [],
    global: p.global ?? emptyBucket(),
    folders: p.folders ?? [],
  };
}

describe('leaderboard', () => {
  it('ranks skills by usedBy count desc, then name asc', () => {
    const i = inv({
      global: bucket({
        skills: [
          skill('zeta', ['cc', 'codex', 'cursor']),
          skill('beta', ['cc', 'codex']),
          skill('alpha', ['cc', 'codex']),
          skill('gamma', ['cc']),
        ],
      }),
    });
    const rows = leaderboard(i);
    expect(rows.map((r) => r.name)).toEqual(['zeta', 'alpha', 'beta', 'gamma']);
    expect(rows.map((r) => r.used)).toEqual([3, 2, 2, 1]);
  });

  it('dedupes a skill present globally and in a folder, unioning usedBy', () => {
    const i = inv({
      global: bucket({ skills: [skill('sd', ['cc'], { contentId: 'h1', source: 'o/r' })] }),
      folders: [
        folder({ projectScoped: bucket({ skills: [skill('sd', ['codex'], { contentId: 'h1', source: 'o/r' })] }) }),
      ],
    });
    const rows = leaderboard(i);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'sd', used: 2, source: 'o/r' });
  });

  it('returns an empty array for an empty inventory', () => {
    expect(leaderboard(inv({}))).toEqual([]);
  });

  it('enriches every row with everywhere + locations, and includes all kinds', () => {
    const i = inv({
      global: bucket({ skills: [skill('g', ['cc'])], plugins: [plugin('gp')] }),
      folders: [folder({ projectScoped: bucket({ skills: [skill('w', [], { contentId: 'w' })] }) }, '/a')],
    });
    const by = Object.fromEntries(leaderboard(i).map((r) => [r.name, r]));
    expect(by.g!.everywhere).toBe(true);
    expect(by.g!.locations).toEqual([]);
    expect(by.gp!.everywhere).toBe(true);
    expect(by.w!.everywhere).toBe(false);
    expect(by.w!.locations).toEqual(['/a']);
    expect(new Set(leaderboard(i).map((r) => r.kind))).toEqual(new Set(['skill', 'plugin']));
  });
});

describe('installed', () => {
  it('excludes global items and ranks the rest by project footprint, then usage, then name', () => {
    const i = inv({
      global: bucket({ skills: [skill('g-skill', ['cc'])], plugins: [plugin('g-plugin')] }),
      folders: [
        folder({ projectScoped: bucket({ skills: [skill('wide', [], { contentId: 'w' })] }) }, '/a'),
        folder({ projectScoped: bucket({ skills: [skill('wide', [], { contentId: 'w' })], plugins: [plugin('narrow')] }) }, '/b'),
      ],
    });
    const rows = installed(i);
    // no global items (they live only in the User Scope tab)
    expect(rows.some((r) => r.everywhere)).toBe(false);
    expect(rows.some((r) => r.name === 'g-skill' || r.name === 'g-plugin')).toBe(false);
    // wide is in 2 projects → ranks above narrow (1)
    expect(rows.map((r) => r.name)).toEqual(['wide', 'narrow']);
    expect(rows.find((r) => r.name === 'wide')!.locations).toEqual(['/a', '/b']);
  });
});

describe('groupBySource', () => {
  const sk = (name: string, source: string, bundledInPlugin?: string): ItemRow => ({
    kind: 'skill', name, used: 1, source, sourceDim: false,
    // the grouper reads bundledInPlugin off the row's record
    ...(bundledInPlugin ? { record: { ...skill(name, [], { source }), bundledInPlugin } } : {}),
  });
  const pl = (name: string): ItemRow => ({ kind: 'plugin', name, used: null, source: 'o/r', sourceDim: false });

  it('collapses ≥2 same-source standalone skills under a header at the first member position; keeps order', () => {
    const rows = [sk('a', 'o/x'), pl('p'), sk('b', 'o/x'), sk('solo', 'o/y')];
    const out = groupBySource(rows, new Set());
    expect(out.map((r) => r.name)).toEqual(['o/x', 'p', 'solo']);
    expect(out[0]).toMatchObject({ expandState: 'collapsed', groupId: 'src:o/x', used: 2 });
    expect(out[2]!.expandState).toBeUndefined(); // single-skill source is a plain leaf
  });

  it('groups plugin-bundled skills under their PLUGIN, not the marketplace repo', () => {
    // both skills share the marketplace source but belong to different plugins
    const rows = [
      sk('sentry-a', 'anthropics/claude-plugins-official', 'sentry@claude-plugins-official'),
      sk('sentry-b', 'anthropics/claude-plugins-official', 'sentry@claude-plugins-official'),
      sk('figma-x', 'anthropics/claude-plugins-official', 'figma@claude-plugins-official'),
    ];
    const out = groupBySource(rows, new Set(['plugin:sentry@claude-plugins-official']));
    // sentry (2) becomes a group under the plugin name; figma is a single-skill leaf
    expect(out[0]).toMatchObject({ name: 'sentry', groupId: 'plugin:sentry@claude-plugins-official', used: 2 });
    expect(out.slice(1, 3).map((r) => r.name)).toEqual(['sentry-a', 'sentry-b']);
    expect(out[3]).toMatchObject({ name: 'figma-x' }); // single → leaf, not "anthropics/..."
  });

  it('reveals a group\'s skills at depth 1 when expanded', () => {
    const rows = [sk('a', 'o/x'), sk('b', 'o/x')];
    const out = groupBySource(rows, new Set(['src:o/x']));
    expect(out.map((r) => r.name)).toEqual(['o/x', 'a', 'b']);
    expect(out[1]).toMatchObject({ name: 'a', depth: 1 });
  });

  it('never groups plugins or mcp — only skills', () => {
    const rows = [pl('p1'), pl('p2')];
    expect(groupBySource(rows, new Set()).map((r) => r.name)).toEqual(['p1', 'p2']);
  });
});

describe('summaryStats', () => {
  it('counts deduped totals across global and folders', () => {
    const i = inv({
      global: bucket({ skills: [skill('a', []), skill('b', [])], plugins: [plugin('p1')], mcp: [mcp('m1')] }),
      folders: [folder({ projectScoped: bucket({ skills: [skill('c', [])] }) })],
    });
    expect(summaryStats(i).totals).toEqual({ skills: 3, plugins: 1, mcp: 1 });
  });

  it('counts distinct skills per detected runtime, sorted desc', () => {
    const i = inv({
      runtimes: ['cc', 'codex', 'cursor'],
      global: bucket({
        skills: [skill('s1', ['cc', 'codex']), skill('s2', ['cc']), skill('s3', ['codex', 'cursor'])],
      }),
    });
    expect(summaryStats(i).perRuntime).toEqual([
      { runtime: 'cc', skills: 2 },
      { runtime: 'codex', skills: 2 },
      { runtime: 'cursor', skills: 1 },
    ]);
  });

  it('tallies skills by provider kind, sorted desc', () => {
    const i = inv({
      global: bucket({
        skills: [
          skill('s1', [], { source: 'o/r' }),
          skill('s2', [], { source: 'o/r' }),
          skill('s3', []),
        ],
      }),
    });
    expect(summaryStats(i).perProvider).toEqual([
      { kind: 'shared-store', skills: 2 },
      { kind: 'project-local', skills: 1 },
    ]);
  });
});

describe('leaderboardStats', () => {
  it('returns the same rows and stats as the two single-purpose functions', () => {
    const inventory = inv({
      global: bucket({ skills: [skill('a', [])] }),
      folders: [folder({ projectScoped: bucket({ skills: [skill('b', [])] }) })],
      runtimes: ['claude-code'],
    });
    const { rows, stats } = leaderboardStats(inventory);
    expect(rows).toEqual(leaderboard(inventory));
    expect(stats).toEqual(summaryStats(inventory));
  });
});

describe('formatCounts', () => {
  it('formats the counts triple', () => {
    expect(formatCounts({ skills: 2, plugins: 1, mcp: 3 })).toBe('2 skills · 1 plugins · 3 mcp');
  });
});
