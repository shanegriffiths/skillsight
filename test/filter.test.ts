import { describe, it, expect } from 'vitest';
import { filterInventory } from '../src/filter.js';
import type { Bucket, Inventory, McpRecord, PluginRecord, Runtime, SkillRecord } from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function skill(name: string, usedBy: Runtime[]): SkillRecord {
  return { name, contentId: name, provider: { kind: 'shared-store', path: '/' + name }, usedBy, enabled: true, scope: 'global' };
}
function plugin(id: string, runtime: Runtime, supports: Runtime[] = []): PluginRecord {
  return {
    id, name: id, marketplace: 'm', version: '1', scope: 'user', enabled: true,
    provides: { skills: [], commands: [], agents: [], mcpServers: [] },
    supportsRuntimes: supports, runtime,
  };
}
function mcp(name: string, runtime: Runtime): McpRecord {
  return { name, transport: { kind: 'stdio' }, provider: { kind: 'user', path: '/' + name }, scope: 'global', enabled: true, runtime };
}
function makeInv(global: Bucket): Inventory {
  return { generatedAt: '', homeRoot: '/h', runtimesDetected: ['claude-code', 'codex'], warnings: [], global, folders: [] };
}
function base(): Bucket {
  const b = emptyBucket();
  b.skills = [skill('a', ['codex', 'warp']), skill('b', ['claude-code'])];
  b.plugins = [plugin('p1', 'claude-code'), plugin('p2', 'codex', ['cursor'])];
  b.mcp = [mcp('m1', 'codex'), mcp('m2', 'claude-code')];
  return b;
}

describe('filterInventory', () => {
  it('filters by runtime across all kinds', () => {
    const out = filterInventory(makeInv(base()), { runtimes: ['codex'] });
    expect(out.global.skills.map((s) => s.name)).toEqual(['a']);
    expect(out.global.plugins.map((p) => p.id)).toEqual(['p2']);
    expect(out.global.mcp.map((m) => m.name)).toEqual(['m1']);
  });

  it('matches plugins via supportsRuntimes too', () => {
    const out = filterInventory(makeInv(base()), { runtimes: ['cursor'] });
    expect(out.global.plugins.map((p) => p.id)).toEqual(['p2']);
  });

  it('filters by kind', () => {
    const out = filterInventory(makeInv(base()), { kinds: ['mcp'] });
    expect(out.global.skills).toHaveLength(0);
    expect(out.global.plugins).toHaveLength(0);
    expect(out.global.mcp).toHaveLength(2);
  });

  it('returns the same object when no filters are given', () => {
    const i = makeInv(base());
    expect(filterInventory(i, {})).toBe(i);
  });
});
