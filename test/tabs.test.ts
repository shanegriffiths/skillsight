import { describe, it, expect } from 'vitest';
import { TABS, tabForKey, nextTab } from '../src/render/ink/tabs.js';

describe('tabs', () => {
  it('defines four tabs with unique ids and number keys', () => {
    expect(TABS.map((t) => t.id)).toEqual(['folders', 'installed', 'global', 'leaderboard']);
    expect(TABS.map((t) => t.key)).toEqual(['1', '2', '3', '4']);
  });
  it('tabForKey maps number keys and rejects everything else', () => {
    expect(tabForKey('2')).toBe('installed');
    expect(tabForKey('3')).toBe('global');
    expect(tabForKey('9')).toBeUndefined();
    expect(tabForKey('f')).toBeUndefined();
  });
  it('nextTab cycles forward and backward with wrapping', () => {
    expect(nextTab('folders', 1)).toBe('installed');
    expect(nextTab('leaderboard', 1)).toBe('folders');
    expect(nextTab('folders', -1)).toBe('leaderboard');
  });
});
