import { describe, it, expect } from 'vitest';
import {
  runtimeMark,
  marksFor,
  lettersFor,
  otherCount,
  runtimeName,
  namesFor,
  type RuntimeMark,
} from '../src/render/ink/runtimeMark.js';
import { DEEP_RUNTIMES } from '../src/runtimes.js';

describe('runtimeMark', () => {
  it('returns the letter mark for each of the six detected runtimes', () => {
    expect(runtimeMark('claude-code')).toEqual({ id: 'claude-code', letter: 'C' });
    expect(runtimeMark('codex')).toEqual({ id: 'codex', letter: 'X' });
    expect(runtimeMark('hermes-agent')).toEqual({ id: 'hermes-agent', letter: 'H' });
    expect(runtimeMark('gemini-cli')).toEqual({ id: 'gemini-cli', letter: 'G' });
    expect(runtimeMark('cursor')).toEqual({ id: 'cursor', letter: 'U' });
    expect(runtimeMark('opencode')).toEqual({ id: 'opencode', letter: 'O' });
  });

  it('returns undefined for non-detected runtimes', () => {
    expect(runtimeMark('amp')).toBeUndefined();
    expect(runtimeMark('zed')).toBeUndefined();
  });
});

describe('marksFor', () => {
  it('keeps only detected runtimes, in canonical order regardless of input order', () => {
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

describe('lettersFor', () => {
  it('joins the letters with spaces in canonical order', () => {
    expect(lettersFor(['cursor', 'claude-code', 'codex'])).toBe('C X U');
    expect(lettersFor(['claude-code'])).toBe('C');
  });

  it('returns the empty string when nothing matches', () => {
    expect(lettersFor([])).toBe('');
    expect(lettersFor(['amp'])).toBe('');
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
  it('has a letter for every engine-detected (deep) runtime', () => {
    for (const r of DEEP_RUNTIMES) {
      expect(runtimeMark(r.id), `missing letter for ${r.id}`).toBeDefined();
    }
  });
});

describe('runtimeName', () => {
  it('gives a curated name for each detected runtime', () => {
    expect(runtimeName('claude-code')).toBe('Claude Code');
    expect(runtimeName('codex')).toBe('Codex');
    expect(runtimeName('hermes-agent')).toBe('Hermes');
    expect(runtimeName('gemini-cli')).toBe('Gemini');
    expect(runtimeName('cursor')).toBe('Cursor');
    expect(runtimeName('opencode')).toBe('OpenCode');
  });

  it('title-cases the id for uncurated runtimes', () => {
    expect(runtimeName('amp')).toBe('Amp');
    expect(runtimeName('github-copilot')).toBe('Github Copilot');
  });
});

describe('namesFor', () => {
  it('joins full names, detected six first in canonical order then others', () => {
    expect(namesFor(['amp', 'cursor', 'claude-code', 'codex'])).toBe('Claude Code, Codex, Cursor, Amp');
  });

  it('dedupes repeated ids', () => {
    expect(namesFor(['codex', 'codex', 'claude-code'])).toBe('Claude Code, Codex');
  });

  it('returns "none" for an empty list', () => {
    expect(namesFor([])).toBe('none');
  });
});
