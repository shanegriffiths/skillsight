import { describe, it, expect } from 'vitest';
import { groupedRows } from '../src/render/ink/grouping.js';
import type { Bucket, PluginRecord, SkillRecord } from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function skill(name: string, opts: { plugin?: string; contentId?: string; source?: string } = {}): SkillRecord {
  return {
    name,
    contentId: opts.contentId ?? name,
    provider: { kind: 'shared-store', source: opts.source ?? 'o/r', path: `/x/${name}` },
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

  it('collapses ≥2 standalone skills from one source repo under a header; a lone-source skill stays a leaf', () => {
    const ps = bucket([
      skill('hyperframes', { source: 'heygen-com/hyperframes' }),
      skill('hyperframes-cli', { source: 'heygen-com/hyperframes' }),
      skill('gsap', { source: 'o/gsap' }),
    ]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows.map((r) => r.name)).toEqual(['heygen-com/hyperframes', 'gsap']);
    expect(rows[0]).toMatchObject({ used: 2, expandState: 'collapsed', groupId: 'src:heygen-com/hyperframes' });
    expect(rows[0]!.record).toBeUndefined();
    expect(rows[1]!.expandState).toBeUndefined(); // single-source skill is a plain leaf
  });

  it('reveals a source group\'s children at depth 1 when expanded', () => {
    const ps = bucket([
      skill('hyperframes', { source: 'heygen-com/hyperframes' }),
      skill('hyperframes-cli', { source: 'heygen-com/hyperframes' }),
    ]);
    const rows = groupedRows(ps, emptyBucket(), new Set(['src:heygen-com/hyperframes']));
    expect(rows.map((r) => r.name)).toEqual(['heygen-com/hyperframes', 'hyperframes', 'hyperframes-cli']);
    expect(rows[1]).toMatchObject({ name: 'hyperframes', depth: 1 });
    expect(rows[2]).toMatchObject({ name: 'hyperframes-cli', depth: 1 });
    expect(rows[1]!.record).toBeDefined();
  });

  it('does not group standalone skills that lack a real repo source', () => {
    const ps = bucket([
      { ...skill('local-a'), provider: { kind: 'project-local', path: '/x/local-a' } },
      { ...skill('local-b'), provider: { kind: 'project-local', path: '/x/local-b' } },
    ]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows.map((r) => r.name).sort()).toEqual(['local-a', 'local-b']);
    expect(rows.every((r) => r.expandState === undefined)).toBe(true);
  });

  it('groups plugin-bundled and source-bundled skills side by side (plugins first)', () => {
    const ps = bucket([
      skill('a1', { plugin: 'zeta' }),
      skill('a2', { plugin: 'zeta' }),
      skill('h1', { source: 'heygen-com/hyperframes' }),
      skill('h2', { source: 'heygen-com/hyperframes' }),
    ]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows.map((r) => ({ name: r.name, groupId: r.groupId }))).toEqual([
      { name: 'zeta', groupId: 'zeta' },
      { name: 'heygen-com/hyperframes', groupId: 'src:heygen-com/hyperframes' },
    ]);
  });

  it('merges project-scoped and local layers', () => {
    const rows = groupedRows(bucket([skill('a', { source: 'o/a' })]), bucket([skill('b', { source: 'o/b' })]), new Set());
    expect(rows.map((r) => r.name).sort()).toEqual(['a', 'b']);
  });

  it('returns [] for empty buckets', () => {
    expect(groupedRows(emptyBucket(), emptyBucket(), new Set())).toEqual([]);
  });
});
