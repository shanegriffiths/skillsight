import { describe, expect, it } from 'vitest';
import { renderShowPanel } from '../src/render/show.js';
import type { ShowRecord } from '../src/show.js';

const base: ShowRecord = {
  schemaVersion: 1, scanTime: '2026-07-14T12:00:00.000Z', skillsightVersion: '0.2.0',
  homeRoot: '/Users/x', kind: 'skill',
  item: {
    name: 'dupe', contentId: 'abcdef1234567890', usedBy: ['claude-code'],
    provider: { kind: 'project-local', path: '/Users/x/proj-a/.claude/skills/dupe' },
    enabled: true, scope: 'project-scoped',
  },
  copies: [
    { path: '/Users/x/repo/.claude/skills/dupe', folders: ['/Users/x/repo'], providerKind: 'project-local',
      git: { repoRoot: '/Users/x/repo', isWorktree: false } },
    { path: '/Users/x/repo.wt/a/.claude/skills/dupe', folders: ['/Users/x/repo.wt/a'], providerKind: 'project-local',
      git: { repoRoot: '/Users/x/repo.wt/a', isWorktree: true, mainCheckout: '/Users/x/repo' } },
  ],
  sites: [{ runtime: 'claude-code', linkPath: '/Users/x/.claude/skills/dupe' }],
  collisions: [{ name: 'dupe', kind: 'skill', id: 'fff111', folders: ['/Users/x/proj-c'] }],
};

describe('renderShowPanel', () => {
  it('groups copies by repo and flags worktrees', () => {
    const out = renderShowPanel(base);
    expect(out).toContain('dupe');
    expect(out).toContain('copies (2)');
    expect(out).toContain('main checkout + 1 worktree');
    expect(out).toContain('(worktree)');
    expect(out).toContain('sites (1)');
    expect(out).toContain('collisions (1)');
    expect(out).toContain('skillsight show abcdef123456 --json');
  });

  it('omits empty sections', () => {
    const out = renderShowPanel({ ...base, sites: [], collisions: [] });
    expect(out).not.toContain('sites (');
    expect(out).not.toContain('collisions (');
  });
});
