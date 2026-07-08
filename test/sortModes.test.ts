import { describe, it, expect } from 'vitest';
import {
  byEnabled, byKind, byScope, byVisibility, byReach, byLocations,
  LEADERBOARD_SORTS, PROJECT_SORTS, USERSCOPE_SORTS,
} from '../src/render/ink/sortModes.js';
import type { ItemRow } from '../src/render/ink/rows.js';

const row = (over: Partial<ItemRow>): ItemRow => ({ kind: 'skill', name: 'x', used: 0, source: null, sourceDim: false, ...over });

describe('sort comparators (tie-break on name)', () => {
  it('byEnabled sinks disabled below enabled', () => {
    const rows = [row({ name: 'b', status: 'disabled' }), row({ name: 'a', status: 'enabled' }), row({ name: 'c', status: 'disabled' })];
    expect([...rows].sort(byEnabled).map((r) => r.name)).toEqual(['a', 'b', 'c']);
  });
  it('byKind orders skill < plugin < mcp', () => {
    const rows = [row({ kind: 'mcp' }), row({ kind: 'skill' }), row({ kind: 'plugin' })];
    expect([...rows].sort(byKind).map((r) => r.kind)).toEqual(['skill', 'plugin', 'mcp']);
  });
  it('byScope orders user < project < local', () => {
    const rows = [row({ scope: 'local' }), row({ scope: 'user' }), row({ scope: 'project' })];
    expect([...rows].sort(byScope).map((r) => r.scope)).toEqual(['user', 'project', 'local']);
  });
  it('byVisibility orders on < name-only < user-only < off', () => {
    const rows = [row({ visibility: 'off' }), row({ visibility: 'on' }), row({ visibility: 'user-only' }), row({ visibility: 'name-only' })];
    expect([...rows].sort(byVisibility).map((r) => r.visibility)).toEqual(['on', 'name-only', 'user-only', 'off']);
  });
  it('byReach sorts higher reach first, null last', () => {
    const rows = [row({ name: 'a', used: 2 }), row({ name: 'b', used: null }), row({ name: 'c', used: 9 })];
    expect([...rows].sort(byReach).map((r) => r.name)).toEqual(['c', 'a', 'b']);
  });
  it('byLocations sorts more locations first', () => {
    const rows = [row({ name: 'a', locations: ['x'] }), row({ name: 'b', locations: ['x', 'y', 'z'] }), row({ name: 'c', locations: [] })];
    expect([...rows].sort(byLocations).map((r) => r.name)).toEqual(['b', 'a', 'c']);
  });
  it('ties break on name', () => {
    const rows = [row({ name: 'z', status: 'enabled' }), row({ name: 'a', status: 'enabled' })];
    expect([...rows].sort(byEnabled).map((r) => r.name)).toEqual(['a', 'z']);
  });
});

describe('per-tab sort lists', () => {
  it('label the modes to match their columns, native first', () => {
    expect(LEADERBOARD_SORTS.map((m) => m.label)).toEqual(['reach', 'name', 'enabled', 'visibility', 'scope', 'kind']);
    expect(PROJECT_SORTS.map((m) => m.label)).toEqual(['locations', 'name', 'enabled', 'scope', 'kind']);
    expect(USERSCOPE_SORTS.map((m) => m.label)).toEqual(['grouped', 'name', 'enabled', 'visibility', 'scope', 'kind']);
  });
  it('native mode is identity; a keyed mode reorders', () => {
    const rows = [row({ name: 'b' }), row({ name: 'a' })];
    expect(LEADERBOARD_SORTS[0]!.apply(rows).map((r) => r.name)).toEqual(['b', 'a']); // native reach = identity
    expect(LEADERBOARD_SORTS[1]!.apply(rows).map((r) => r.name)).toEqual(['a', 'b']); // name
  });
});
