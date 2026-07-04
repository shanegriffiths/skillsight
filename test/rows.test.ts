import { describe, it, expect } from 'vitest';
import { itemRows, sortItemRows, type ItemRow } from '../src/render/ink/rows.js';
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
    // toStrictEqual: pins that optional keys (state, parked) are ABSENT, not undefined.
    expect(itemRows(b)).toStrictEqual([
      { kind: 'skill', name: 'systematic-debugging', used: 2, source: 'obra/superpowers', sourceDim: false, record: s, usedRuntimes: ['cc', 'codex'] },
    ]);
  });

  it('maps a skill with no usedBy and no source to used:0 and dim provider kind', () => {
    const s = skill('local-thing', []);
    const b: Bucket = { ...emptyBucket(), skills: [s] };
    expect(itemRows(b)).toEqual([
      { kind: 'skill', name: 'local-thing', used: 0, source: 'project-local', sourceDim: true, record: s, usedRuntimes: [] },
    ]);
  });

  it('maps a plugin to used:null and marketplaceRepo source', () => {
    const p = plugin('chrome-devtools', 'anthropics/claude-code');
    const b: Bucket = { ...emptyBucket(), plugins: [p] };
    expect(itemRows(b)).toEqual([
      { kind: 'plugin', name: 'chrome-devtools', used: null, source: 'anthropics/claude-code', sourceDim: false, record: p, usedRuntimes: [] },
    ]);
  });

  it('falls back to dim marketplace name when a plugin has no repo', () => {
    const p = plugin('local-plugin');
    const b: Bucket = { ...emptyBucket(), plugins: [p] };
    expect(itemRows(b)).toEqual([
      { kind: 'plugin', name: 'local-plugin', used: null, source: 'official', sourceDim: true, record: p, usedRuntimes: [] },
    ]);
  });

  it('maps an mcp server to used:null and dim transport kind', () => {
    const m = mcp('linear', 'http');
    const b: Bucket = { ...emptyBucket(), mcp: [m] };
    expect(itemRows(b)).toEqual([
      { kind: 'mcp', name: 'linear', used: null, source: 'http', sourceDim: true, record: m, usedRuntimes: [] },
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

  it('sets usedRuntimes from a skill usedBy list', () => {
    const s = skill('x', ['claude-code', 'codex']);
    expect(itemRows({ ...emptyBucket(), skills: [s] })[0]!.usedRuntimes).toEqual(['claude-code', 'codex']);
  });

  it('sets usedRuntimes to the single declaring runtime for a plugin', () => {
    const p = { ...plugin('p', 'o/r'), runtime: 'claude-code' as const };
    expect(itemRows({ ...emptyBucket(), plugins: [p] })[0]!.usedRuntimes).toEqual(['claude-code']);
  });

  it('sets usedRuntimes to the single declaring runtime for an mcp server', () => {
    const m = { ...mcp('m', 'stdio' as const), runtime: 'codex' as const };
    expect(itemRows({ ...emptyBucket(), mcp: [m] })[0]!.usedRuntimes).toEqual(['codex']);
  });

  it('sets usedRuntimes to [] for a plugin/mcp with no declaring runtime', () => {
    expect(itemRows({ ...emptyBucket(), plugins: [plugin('p')] })[0]!.usedRuntimes).toEqual([]);
    expect(itemRows({ ...emptyBucket(), mcp: [mcp('m', 'stdio')] })[0]!.usedRuntimes).toEqual([]);
  });

  it('flags parked skills (name-only / user-invocable-only) and only those', () => {
    const parked = { ...skill('p1', ['cc']), visibility: 'user-invocable-only' as const, visibilitySource: 'user' as const };
    const nameOnly = { ...skill('p2', ['cc']), visibility: 'name-only' as const, visibilitySource: 'user' as const };
    const on = { ...skill('p3', ['cc']), visibility: 'on' as const, visibilitySource: 'project' as const };
    const off = { ...skill('p4', ['cc']), visibility: 'off' as const, visibilitySource: 'user' as const, enabled: false };
    const rows = itemRows({ ...emptyBucket(), skills: [parked, nameOnly, on, off, skill('p5', ['cc'])] });
    expect(rows.map((r) => r.parked)).toEqual([true, true, undefined, undefined, undefined]);
  });

  it('derives state for skills from visibility and enablement', () => {
    const off = { ...skill('s-off', ['cc']), visibility: 'off' as const, visibilitySource: 'user' as const, enabled: false };
    const uio = { ...skill('s-uio', ['cc']), visibility: 'user-invocable-only' as const, visibilitySource: 'user' as const };
    const nameOnly = { ...skill('s-name', ['cc']), visibility: 'name-only' as const, visibilitySource: 'project' as const };
    const promoted = { ...skill('s-on', ['cc']), visibility: 'on' as const, visibilitySource: 'project' as const };
    const codexDisabled = { ...skill('s-codex', ['cc']), enabled: false };
    const plain = skill('s-plain', ['cc']);
    // parked visibility beats the disabled fallback, same as 'off' does
    const uioDisabled = { ...skill('s-uio-d', ['cc']), visibility: 'user-invocable-only' as const, visibilitySource: 'user' as const, enabled: false };
    const nameOnlyDisabled = { ...skill('s-name-d', ['cc']), visibility: 'name-only' as const, visibilitySource: 'project' as const, enabled: false };
    const rows = itemRows({ ...emptyBucket(), skills: [off, uio, nameOnly, promoted, codexDisabled, plain, uioDisabled, nameOnlyDisabled] });
    expect(rows.map((r) => r.state)).toEqual(['off', 'invoke-only', 'name-only', undefined, 'disabled', undefined, 'invoke-only', 'name-only']);
  });

  it('derives disabled state for plugins and mcp servers', () => {
    const rows = itemRows({
      ...emptyBucket(),
      plugins: [plugin('p-on', 'o/r'), { ...plugin('p-off', 'o/r'), enabled: false }],
      mcp: [mcp('m-on', 'stdio'), { ...mcp('m-off', 'http'), enabled: false }],
    });
    expect(rows.map((r) => r.state)).toEqual([undefined, 'disabled', undefined, 'disabled']);
  });
});

describe('sortItemRows', () => {
  const r = (name: string, used: number | null): ItemRow => ({
    kind: 'skill', name, used, source: null, sourceDim: false, usedRuntimes: [],
  });

  it('used: descending, null last, ties broken by name asc', () => {
    const rows = [r('b', 3), r('a', 3), r('z', null), r('m', 5)];
    expect(sortItemRows(rows, 'used').map((x) => x.name)).toEqual(['m', 'a', 'b', 'z']);
  });

  it('name: alphabetical asc', () => {
    const rows = [r('b', 3), r('a', 9), r('c', 1)];
    expect(sortItemRows(rows, 'name').map((x) => x.name)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const rows = [r('b', 1), r('a', 2)];
    sortItemRows(rows, 'used');
    expect(rows.map((x) => x.name)).toEqual(['b', 'a']);
  });
});
