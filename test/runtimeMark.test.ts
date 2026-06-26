import { describe, it, expect } from 'vitest';
import { runtimeMark, marksFor, otherCount, type RuntimeMark } from '../src/render/ink/runtimeMark.js';
import { DEEP_RUNTIMES } from '../src/runtimes.js';

describe('runtimeMark', () => {
  it('returns the mark for each of the six detected runtimes', () => {
    expect(runtimeMark('claude-code')).toEqual({ id: 'claude-code', letter: 'C', bg: '#D97757', fg: 'black' });
    expect(runtimeMark('codex')).toEqual({ id: 'codex', letter: 'X', bg: '#10A37F', fg: 'white' });
    expect(runtimeMark('hermes-agent')).toEqual({ id: 'hermes-agent', letter: 'H', bg: '#06B6D4', fg: 'black' });
    expect(runtimeMark('gemini-cli')).toEqual({ id: 'gemini-cli', letter: 'G', bg: '#4285F4', fg: 'white' });
    expect(runtimeMark('cursor')).toEqual({ id: 'cursor', letter: 'U', bg: '#C678DD', fg: 'black' });
    expect(runtimeMark('opencode')).toEqual({ id: 'opencode', letter: 'O', bg: '#EF4444', fg: 'white' });
  });

  it('returns undefined for non-detected runtimes', () => {
    expect(runtimeMark('amp')).toBeUndefined();
    expect(runtimeMark('zed')).toBeUndefined();
  });
});

describe('marksFor', () => {
  it('keeps only detected runtimes, in DETECTED_ORDER regardless of input order', () => {
    const marks = marksFor(['cursor', 'opencode', 'claude-code', 'amp', 'codex']);
    expect(marks.map((m: RuntimeMark) => m.letter)).toEqual(['C', 'X', 'U', 'O']);
  });

  it('dedupes repeated ids and drops non-detected', () => {
    expect(marksFor(['codex', 'codex', 'zed']).map((m) => m.id)).toEqual(['codex']);
  });

  it('returns [] for an empty or all-undetected list', () => {
    expect(marksFor([])).toEqual([]);
    expect(marksFor(['amp', 'warp'])).toEqual([]);
  });
});

describe('otherCount', () => {
  it('counts only the non-detected runtimes', () => {
    expect(otherCount(['claude-code', 'amp', 'zed', 'warp'])).toBe(3);
    expect(otherCount(['claude-code', 'codex'])).toBe(0);
    expect(otherCount([])).toBe(0);
  });
});

describe('runtimeMark coverage', () => {
  it('has a badge for every engine-detected (deep) runtime', () => {
    for (const r of DEEP_RUNTIMES) {
      expect(runtimeMark(r.id), `missing badge for ${r.id}`).toBeDefined();
    }
  });
});
