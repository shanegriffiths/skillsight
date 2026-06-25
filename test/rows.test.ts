import { describe, it, expect } from 'vitest';
import { itemRows } from '../src/render/ink/rows.js';
import type { Bucket, SkillRecord, PluginRecord, McpRecord } from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function skill(name: string, usedBy: string[], source?: string): SkillRecord {
  return {
    name,
    contentId: name,
    provider: { kind: source ? 'shared-store' : 'project-local', source, path: `/x/${name}` },
    usedBy,
    enabled: true,
    scope: 'project-scoped',
  };
}

function plugin(name: string, marketplaceRepo?: string): PluginRecord {
  return {
    id: name,
    name,
    marketplace: 'official',
    marketplaceRepo,
    version: '1.0.0',
    scope: 'user',
    enabled: true,
    provides: { skills: [], commands: [], agents: [], mcpServers: [] },
    supportsRuntimes: [],
  };
}

function mcp(name: string, kind: McpRecord['transport']['kind']): McpRecord {
  return {
    name,
    transport: { kind },
    provider: { kind: 'user', path: `/x/${name}` },
    scope: 'project-scoped',
    enabled: true,
  };
}

describe('itemRows', () => {
  it('maps a shared-store skill to count + owner/repo source', () => {
    const s = skill('systematic-debugging', ['cc', 'codex'], 'obra/superpowers');
    const b: Bucket = { ...emptyBucket(), skills: [s] };
    expect(itemRows(b)).toEqual([
      { kind: 'skill', name: 'systematic-debugging', used: 2, source: 'obra/superpowers', sourceDim: false, record: s },
    ]);
  });

  it('maps a skill with no usedBy and no source to used:0 and dim provider kind', () => {
    const s = skill('local-thing', []);
    const b: Bucket = { ...emptyBucket(), skills: [s] };
    expect(itemRows(b)).toEqual([
      { kind: 'skill', name: 'local-thing', used: 0, source: 'project-local', sourceDim: true, record: s },
    ]);
  });

  it('maps a plugin to used:null and marketplaceRepo source', () => {
    const p = plugin('chrome-devtools', 'anthropics/claude-code');
    const b: Bucket = { ...emptyBucket(), plugins: [p] };
    expect(itemRows(b)).toEqual([
      { kind: 'plugin', name: 'chrome-devtools', used: null, source: 'anthropics/claude-code', sourceDim: false, record: p },
    ]);
  });

  it('falls back to dim marketplace name when a plugin has no repo', () => {
    const p = plugin('local-plugin');
    const b: Bucket = { ...emptyBucket(), plugins: [p] };
    expect(itemRows(b)).toEqual([
      { kind: 'plugin', name: 'local-plugin', used: null, source: 'official', sourceDim: true, record: p },
    ]);
  });

  it('maps an mcp server to used:null and dim transport kind', () => {
    const m = mcp('linear', 'http');
    const b: Bucket = { ...emptyBucket(), mcp: [m] };
    expect(itemRows(b)).toEqual([
      { kind: 'mcp', name: 'linear', used: null, source: 'http', sourceDim: true, record: m },
    ]);
  });

  it('attaches the exact source record to each row', () => {
    const s = skill('x', ['cc']);
    expect(itemRows({ ...emptyBucket(), skills: [s] })[0]!.record).toBe(s);
  });

  it('orders rows skills, then plugins, then mcp', () => {
    const b: Bucket = {
      skills: [skill('s', ['cc'], 'o/r')],
      plugins: [plugin('p', 'o/r')],
      mcp: [mcp('m', 'stdio')],
    };
    expect(itemRows(b).map((r) => r.kind)).toEqual(['skill', 'plugin', 'mcp']);
  });
});
