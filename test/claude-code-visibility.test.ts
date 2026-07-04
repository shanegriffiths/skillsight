import { describe, it, expect } from 'vitest';
import {
  parseSkillOverrides,
  resolveVisibility,
  visibilityOverlay,
} from '../src/adapters/claude-code-visibility.js';
import type { Warning } from '../src/types.js';

describe('parseSkillOverrides', () => {
  it('returns {} for undefined without warning', () => {
    const w: Warning[] = [];
    expect(parseSkillOverrides(undefined, '/s.json', w)).toEqual({});
    expect(w).toEqual([]);
  });

  it('keeps all four valid states', () => {
    const raw = { a: 'on', b: 'name-only', c: 'user-invocable-only', d: 'off' };
    expect(parseSkillOverrides(raw, '/s.json')).toEqual(raw);
  });

  it('treats an invalid state as "on" and warns with the file path', () => {
    const w: Warning[] = [];
    expect(parseSkillOverrides({ chartli: 'sometimes' }, '/s.json', w)).toEqual({ chartli: 'on' });
    expect(w).toHaveLength(1);
    expect(w[0]!.path).toBe('/s.json');
    expect(w[0]!.reason).toContain('chartli');
    expect(w[0]!.reason).toContain('sometimes');
  });

  it('treats a non-string state as "on" and warns', () => {
    const w: Warning[] = [];
    expect(parseSkillOverrides({ x: 3 }, '/s.json', w)).toEqual({ x: 'on' });
    expect(w).toHaveLength(1);
  });

  it('returns {} + one warning when skillOverrides is not an object', () => {
    const w: Warning[] = [];
    expect(parseSkillOverrides('off', '/s.json', w)).toEqual({});
    expect(parseSkillOverrides([1], '/s.json', w)).toEqual({});
    expect(parseSkillOverrides(null, '/s.json', w)).toEqual({});
    expect(w).toHaveLength(3);
  });

  it('does not push warnings when no sink is given', () => {
    expect(() => parseSkillOverrides({ x: 'bad' }, '/s.json')).not.toThrow();
  });
});

describe('resolveVisibility', () => {
  it('returns undefined when no layer names the dir', () => {
    expect(resolveVisibility('ghost', { user: { other: 'off' } })).toBeUndefined();
    expect(resolveVisibility('ghost', {})).toBeUndefined();
  });

  it('user layer alone applies', () => {
    expect(resolveVisibility('a', { user: { a: 'user-invocable-only' } })).toEqual({
      visibility: 'user-invocable-only',
      source: 'user',
    });
  });

  it('project beats user (promotion: on beats user-invocable-only)', () => {
    expect(
      resolveVisibility('a', { user: { a: 'user-invocable-only' }, project: { a: 'on' } }),
    ).toEqual({ visibility: 'on', source: 'project' });
  });

  it('local beats project (demotion: off beats project on)', () => {
    expect(
      resolveVisibility('a', {
        user: { a: 'user-invocable-only' },
        project: { a: 'on' },
        local: { a: 'off' },
      }),
    ).toEqual({ visibility: 'off', source: 'local' });
  });

  it('a layer that does not name the dir falls through', () => {
    expect(
      resolveVisibility('a', { user: { a: 'name-only' }, project: { other: 'off' }, local: {} }),
    ).toEqual({ visibility: 'name-only', source: 'user' });
  });
});

describe('visibilityOverlay', () => {
  it('returns undefined for undefined', () => {
    expect(visibilityOverlay(undefined)).toBeUndefined();
  });

  it('derives enabled=false only for off', () => {
    expect(visibilityOverlay({ visibility: 'off', source: 'local' })).toEqual({
      visibility: 'off',
      visibilitySource: 'local',
      enabled: false,
    });
    expect(visibilityOverlay({ visibility: 'user-invocable-only', source: 'user' })).toEqual({
      visibility: 'user-invocable-only',
      visibilitySource: 'user',
      enabled: true,
    });
    expect(visibilityOverlay({ visibility: 'on', source: 'project' })).toEqual({
      visibility: 'on',
      visibilitySource: 'project',
      enabled: true,
    });
  });
});
