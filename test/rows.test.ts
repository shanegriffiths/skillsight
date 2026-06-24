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
    const b: Bucket = { ...emptyBucket(), skills: [skill('systematic-debugging', ['cc', 'codex'], 'obra/superpowers')] };
    expect(itemRows(b)).toEqual([
      { kind: 'skill', name: 'systematic-debugging', used: 2, source: 'obra/superpowers', sourceDim: false },
    ]);
  });

  it('maps a skill with no usedBy and no source to used:0 and dim provider kind', () => {
    const b: Bucket = { ...emptyBucket(), skills: [skill('local-thing', [])] };
    expect(itemRows(b)).toEqual([
      { kind: 'skill', name: 'local-thing', used: 0, source: 'project-local', sourceDim: true },
    ]);
  });

  it('maps a plugin to used:null and marketplaceRepo source', () => {
    const b: Bucket = { ...emptyBucket(), plugins: [plugin('chrome-devtools', 'anthropics/claude-code')] };
    expect(itemRows(b)).toEqual([
      { kind: 'plugin', name: 'chrome-devtools', used: null, source: 'anthropics/claude-code', sourceDim: false },
    ]);
  });

  it('falls back to dim marketplace name when a plugin has no repo', () => {
    const b: Bucket = { ...emptyBucket(), plugins: [plugin('local-plugin')] };
    expect(itemRows(b)).toEqual([
      { kind: 'plugin', name: 'local-plugin', used: null, source: 'official', sourceDim: true },
    ]);
  });

  it('maps an mcp server to used:null and dim transport kind', () => {
    const b: Bucket = { ...emptyBucket(), mcp: [mcp('linear', 'http')] };
    expect(itemRows(b)).toEqual([
      { kind: 'mcp', name: 'linear', used: null, source: 'http', sourceDim: true },
    ]);
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
