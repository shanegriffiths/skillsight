import { describe, it, expect } from 'vitest';
import { resolveIcons } from '../src/render/ink/icons.js';

describe('resolveIcons', () => {
  it('returns Nerd Font glyphs by default (unset env)', () => {
    const i = resolveIcons({});
    expect(i.enabled).toBe(true);
    expect(i.folder.length).toBeGreaterThan(0);
    expect(i.worktrees.length).toBeGreaterThan(0);
  });

  it('disables glyphs for the off-ish values, case-insensitively', () => {
    for (const v of ['off', 'OFF', '0', 'false', 'none', 'no']) {
      const i = resolveIcons({ SKILLSIGHT_ICONS: v });
      expect(i.enabled, v).toBe(false);
      expect(i.folder, v).toBe('');
      expect(i.worktrees, v).toBe('');
    }
  });

  it('treats any other value as on', () => {
    expect(resolveIcons({ SKILLSIGHT_ICONS: 'nerd' }).enabled).toBe(true);
    expect(resolveIcons({ SKILLSIGHT_ICONS: 'yes' }).enabled).toBe(true);
  });
});
