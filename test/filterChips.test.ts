import { describe, it, expect } from 'vitest';
import { chips, isChipSelected, toggleChip } from '../src/render/ink/filterChips.js';
import type { Kind } from '../src/types.js';

describe('chips', () => {
  it('lists detected runtimes (in order) then skill/plugin/mcp', () => {
    expect(chips(['claude-code', 'codex'])).toEqual([
      { kind: 'runtime', id: 'claude-code' },
      { kind: 'runtime', id: 'codex' },
      { kind: 'kind', id: 'skill' },
      { kind: 'kind', id: 'plugin' },
      { kind: 'kind', id: 'mcp' },
    ]);
  });

  it('returns just the three kind chips when no runtimes are detected', () => {
    expect(chips([])).toEqual([
      { kind: 'kind', id: 'skill' },
      { kind: 'kind', id: 'plugin' },
      { kind: 'kind', id: 'mcp' },
    ]);
  });
});

describe('isChipSelected', () => {
  it('checks the matching dimension only', () => {
    const rt = new Set(['codex']);
    const kd = new Set<Kind>(['skill']);
    expect(isChipSelected({ kind: 'runtime', id: 'codex' }, rt, kd)).toBe(true);
    expect(isChipSelected({ kind: 'runtime', id: 'claude-code' }, rt, kd)).toBe(false);
    expect(isChipSelected({ kind: 'kind', id: 'skill' }, rt, kd)).toBe(true);
    expect(isChipSelected({ kind: 'kind', id: 'mcp' }, rt, kd)).toBe(false);
  });
});

describe('toggleChip', () => {
  it('adds a missing id and removes a present one, in the correct dimension', () => {
    const rt0 = new Set<string>();
    const kd0 = new Set<Kind>();

    const added = toggleChip({ kind: 'runtime', id: 'codex' }, rt0, kd0);
    expect([...added.runtimes]).toEqual(['codex']);
    expect([...added.kinds]).toEqual([]);

    const removed = toggleChip({ kind: 'runtime', id: 'codex' }, added.runtimes, added.kinds);
    expect([...removed.runtimes]).toEqual([]);

    const addKind = toggleChip({ kind: 'kind', id: 'plugin' }, rt0, kd0);
    expect([...addKind.kinds]).toEqual(['plugin']);
    expect([...addKind.runtimes]).toEqual([]);
  });

  it('returns new sets without mutating the inputs', () => {
    const rt = new Set(['codex']);
    const kd = new Set<Kind>(['skill']);
    const out = toggleChip({ kind: 'runtime', id: 'claude-code' }, rt, kd);
    expect(out.runtimes).not.toBe(rt);
    expect(out.kinds).not.toBe(kd);
    expect([...rt]).toEqual(['codex']); // input untouched
    expect([...out.runtimes].sort()).toEqual(['claude-code', 'codex']);
  });
});
