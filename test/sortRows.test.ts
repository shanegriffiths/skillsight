import { describe, it, expect } from 'vitest';
import { sortGroupedByName } from '../src/render/ink/sortRows.js';
import type { ItemRow } from '../src/render/ink/rows.js';

const leaf = (name: string): ItemRow => ({ kind: 'skill', name, used: 0, source: null, sourceDim: false });
const header = (name: string, groupId: string, state: 'expanded' | 'collapsed' = 'expanded'): ItemRow => ({
  kind: 'skill', name, used: 2, source: null, sourceDim: false, expandState: state, groupId,
});
const child = (name: string): ItemRow => ({ kind: 'skill', name, used: 1, source: null, sourceDim: false, depth: 1 });

describe('sortGroupedByName', () => {
  it('reorders top-level units (leaves + groups) by their head name', () => {
    const rows = [leaf('z'), header('m', 'src:m'), child('m2'), child('m1'), leaf('a')];
    const out = sortGroupedByName(rows);
    // unit order: a (leaf), m-group (header + children sorted m1,m2), z (leaf)
    expect(out.map((r) => r.name)).toEqual(['a', 'm', 'm1', 'm2', 'z']);
  });

  it('sorts children within a group and keeps depth/expandState on the group', () => {
    const rows = [header('grp', 'src:grp'), child('beta'), child('alpha')];
    const out = sortGroupedByName(rows);
    expect(out.map((r) => r.name)).toEqual(['grp', 'alpha', 'beta']);
    expect(out[0]!.expandState).toBe('expanded');
    expect(out[1]!.depth).toBe(1);
    expect(out[2]!.depth).toBe(1);
  });

  it('places a collapsed header (no children) by its name', () => {
    const rows = [leaf('z'), header('m', 'src:m', 'collapsed'), leaf('a')];
    const out = sortGroupedByName(rows);
    expect(out.map((r) => r.name)).toEqual(['a', 'm', 'z']);
    expect(out[1]!.expandState).toBe('collapsed');
  });

  it('does not mutate the input array', () => {
    const rows = [leaf('b'), leaf('a')];
    sortGroupedByName(rows);
    expect(rows.map((r) => r.name)).toEqual(['b', 'a']);
  });

  it('returns an empty array unchanged', () => {
    expect(sortGroupedByName([])).toEqual([]);
  });
});
