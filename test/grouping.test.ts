import { describe, it, expect } from 'vitest';
import { groupedRows } from '../src/render/ink/grouping.js';
import type { Bucket, SkillRecord } from '../src/types.js';
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

function bucket(skills: SkillRecord[]): Bucket {
  return { ...emptyBucket(), skills };
}

describe('groupedRows', () => {
  it('collapses bundled skills under a header and hides children when not expanded', () => {
    const ps = bucket([skill('animejs', { plugin: 'gsap' }), skill('three', { plugin: 'gsap' }), skill('solo')]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows.map((r) => r.name)).toEqual(['gsap', 'solo']);
    expect(rows[0]).toMatchObject({ kind: 'plugin', name: 'gsap', used: 2, expandState: 'collapsed' });
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

  it('sorts group headers by plugin name', () => {
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
