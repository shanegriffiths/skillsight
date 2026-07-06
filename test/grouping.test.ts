import { describe, it, expect } from 'vitest';
import { groupedRows } from '../src/render/ink/grouping.js';
import type { Bucket, PluginRecord, SkillRecord } from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function skill(name: string, opts: { plugin?: string; contentId?: string } = {}): SkillRecord {
  return {
    name,
    contentId: opts.contentId ?? name,
    provider: { kind: 'shared-store', source: 'o/r', path: `/x/${name}` },
    usedBy: ['cc'],
    enabled: true,
    scope: 'project-scoped',
    bundledInPlugin: opts.plugin,
  };
}

function plugin(id: string, over: Partial<PluginRecord> = {}): PluginRecord {
  return {
    id,
    name: id.split('@')[0]!,
    marketplace: 'official',
    marketplaceRepo: 'anthropics/plugins',
    version: '1.0.0',
    scope: 'user',
    enabled: true,
    provides: { skills: [], commands: [], agents: [], mcpServers: [] },
    supportsRuntimes: [],
    ...over,
  };
}

function bucket(skills: SkillRecord[], plugins: PluginRecord[] = []): Bucket {
  return { ...emptyBucket(), skills, plugins };
}

describe('groupedRows', () => {
  it('collapses bundled skills under a header and hides children when not expanded', () => {
    const ps = bucket([skill('animejs', { plugin: 'gsap' }), skill('three', { plugin: 'gsap' }), skill('solo')]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows.map((r) => r.name)).toEqual(['gsap', 'solo']);
    expect(rows[0]).toMatchObject({ kind: 'plugin', name: 'gsap', used: 2, expandState: 'collapsed', groupId: 'gsap' });
    expect(rows[0]!.record).toBeUndefined();
  });

  it('reveals children at depth 1 when the group is expanded', () => {
    const ps = bucket([skill('animejs', { plugin: 'gsap' }), skill('three', { plugin: 'gsap' }), skill('solo')]);
    const rows = groupedRows(ps, emptyBucket(), new Set(['gsap']));
    expect(rows.map((r) => r.name)).toEqual(['gsap', 'animejs', 'three', 'solo']);
    expect(rows[0]).toMatchObject({ expandState: 'expanded' });
    expect(rows[1]).toMatchObject({ name: 'animejs', depth: 1 });
    expect(rows[2]).toMatchObject({ name: 'three', depth: 1 });
    expect(rows[1]!.record).toBeDefined();
    expect(rows[3]!.depth).toBeUndefined(); // standalone leaf, not indented
  });

  it('uses the matching plugin record as the header and drops its leaf duplicate', () => {
    const p = plugin('gsap-skills@gsap-skills');
    const ps = bucket([skill('draggable', { plugin: 'gsap-skills@gsap-skills' })], [p]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows).toHaveLength(1); // header only — no separate plugin leaf
    expect(rows[0]).toMatchObject({
      kind: 'plugin',
      name: 'gsap-skills', // short display name, not the full key
      used: 1,
      expandState: 'collapsed',
      groupId: 'gsap-skills@gsap-skills',
      source: 'anthropics/plugins',
      scope: 'user',
      status: 'enabled',
    });
    expect(rows[0]!.record).toBe(p);
  });

  it('expansion state is keyed by the full plugin id', () => {
    const p = plugin('gsap-skills@gsap-skills');
    const ps = bucket([skill('draggable', { plugin: 'gsap-skills@gsap-skills' })], [p]);
    const rows = groupedRows(ps, emptyBucket(), new Set(['gsap-skills@gsap-skills']));
    expect(rows.map((r) => r.name)).toEqual(['gsap-skills', 'draggable']);
  });

  it('keeps unmatched plugins as leaves', () => {
    const p = plugin('standalone@official');
    const rows = groupedRows(bucket([skill('solo')], [p]), emptyBucket(), new Set());
    expect(rows.map((r) => r.name)).toEqual(['solo', 'standalone']);
    expect(rows[1]!.expandState).toBeUndefined();
  });

  it('shortens a synthetic header name to the part before @', () => {
    const ps = bucket([skill('orphan', { plugin: 'ghost@somewhere' })]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows[0]).toMatchObject({ name: 'ghost', used: 1, expandState: 'collapsed', groupId: 'ghost@somewhere' });
  });

  it('sorts group headers by plugin id', () => {
    const ps = bucket([skill('a', { plugin: 'zeta' }), skill('b', { plugin: 'alpha' })]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'zeta']);
  });

  it('still groups a skill whose plugin has no matching plugin record', () => {
    const ps = bucket([skill('orphan', { plugin: 'ghost' })]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows[0]).toMatchObject({ name: 'ghost', used: 1, expandState: 'collapsed' });
  });

  it('merges project-scoped and local layers', () => {
    const rows = groupedRows(bucket([skill('a')]), bucket([skill('b')]), new Set());
    expect(rows.map((r) => r.name).sort()).toEqual(['a', 'b']);
  });

  it('returns [] for empty buckets', () => {
    expect(groupedRows(emptyBucket(), emptyBucket(), new Set())).toEqual([]);
  });
});
