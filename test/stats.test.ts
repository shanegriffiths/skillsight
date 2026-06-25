import { describe, it, expect } from 'vitest';
import { leaderboard, summaryStats } from '../src/render/ink/stats.js';
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

function folder(b: Partial<Pick<FolderReport, 'projectScoped' | 'local'>>): FolderReport {
  return {
    path: '/p',
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
