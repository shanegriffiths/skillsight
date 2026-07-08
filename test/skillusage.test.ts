import { describe, it, expect } from 'vitest';
import { parseSkillUsage, usageKey } from '../src/skillusage.js';

describe('parseSkillUsage', () => {
  it('reads usageCount + lastUsedAt into a map', () => {
    const m = parseSkillUsage({ 'agent-browser': { usageCount: 29, lastUsedAt: 123 }, verify: { usageCount: 5 } });
    expect(m.get('agent-browser')).toEqual({ count: 29, lastUsedAt: 123 });
    expect(m.get('verify')).toEqual({ count: 5, lastUsedAt: undefined });
  });

  it('returns an empty map for missing / malformed input', () => {
    expect(parseSkillUsage(undefined).size).toBe(0);
    expect(parseSkillUsage(null).size).toBe(0);
    expect(parseSkillUsage('nope').size).toBe(0);
    expect(parseSkillUsage({ x: 'bad', y: { usageCount: 'no' } }).size).toBe(0);
  });
});

describe('usageKey', () => {
  it('is the bare name for a standalone skill', () => {
    expect(usageKey('agent-browser')).toBe('agent-browser');
  });
  it('is plugin:name for a bundled skill (plugin id trimmed to its name)', () => {
    expect(usageKey('brainstorming', 'superpowers@claude-plugins-official')).toBe('superpowers:brainstorming');
  });
});
