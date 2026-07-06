import { describe, it, expect } from 'vitest';
import { buildFolderRows, isHiddenPath, type FolderRow } from '../src/render/ink/tree.js';
import type { FolderReport, Bucket, SkillRecord } from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function skill(name: string): SkillRecord {
  return {
    name,
    contentId: name,
    provider: { kind: 'user', path: `/p/${name}` },
    usedBy: [],
    enabled: true,
    scope: 'project-scoped',
  };
}

/** A folder whose project-scoped layer holds `delta` skills (so ownDelta === delta). */
function folder(path: string, delta = 0): FolderReport {
  const ps: Bucket = { ...emptyBucket(), skills: Array.from({ length: delta }, (_, i) => skill(`${path}#${i}`)) };
  return {
    path,
    group: '',
    runtimes: [],
    global: emptyBucket(),
    projectScoped: ps,
    local: emptyBucket(),
    effective: emptyBucket(),
  };
}

const opts = (over: Partial<{ sort: 'items' | 'name'; showHidden: boolean; expanded: ReadonlySet<string> }> = {}) => ({
  sort: 'items' as const,
  showHidden: false,
  ...over,
});

const byLabel = (rows: FolderRow[], label: string) => rows.find((r) => r.label === label);

describe('isHiddenPath', () => {
  it('is true when any segment starts with a dot, false otherwise', () => {
    expect(isHiddenPath('.config')).toBe(true);
    expect(isHiddenPath('.config/sketchybar')).toBe(true);
    expect(isHiddenPath('Developer/Projects/foo.worktree/x')).toBe(false);
    expect(isHiddenPath('Developer/Projects/foo')).toBe(false);
  });
});

describe('buildFolderRows — flat projects', () => {
  it('emits one flat leaf per discovered project, labelled by basename', () => {
    const rows = buildFolderRows(
      [folder('/home/Dev/Proj/alpha', 3), folder('/home/Dev/Proj/beta', 1)],
      '/home',
      opts(),
    );
    expect(rows.map((r) => r.label)).toEqual(['alpha', 'beta']);
    expect(rows.every((r) => r.kind === 'project' && r.depth === 0 && !r.hasChildren)).toBe(true);
  });

  it('counts each project\'s own delta, keys rows by absolute path', () => {
    const rows = buildFolderRows([folder('/home/a/b/c/leaf', 2)], '/home', opts());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'leaf', count: 2, nodeId: '/home/a/b/c/leaf' });
  });

  it('adds a parent-dir hint only when two top-level rows share a label', () => {
    const rows = buildFolderRows(
      [folder('/home/sunplot/docs', 1), folder('/home/other/docs', 2), folder('/home/solo', 1)],
      '/home',
      opts(),
    );
    const docs = rows.filter((r) => r.label === 'docs');
    expect(docs.map((r) => r.hint).sort()).toEqual(['other', 'sunplot']);
    expect(byLabel(rows, 'solo')!.hint).toBeUndefined();
  });
});

describe('buildFolderRows — worktree grouping', () => {
  const wt = (checkout: string, delta: number) =>
    folder(`/home/Projects/snowbridge-media.worktree/${checkout}`, delta);

  it('collapses checkouts under a synthetic container row (default collapsed)', () => {
    const rows = buildFolderRows(
      [folder('/home/Projects/snowbridge-media', 12), wt('case-study', 3), wt('animation', 1)],
      '/home',
      opts(),
    );
    // main repo stays a flat sibling; the container is one collapsed group row.
    const group = byLabel(rows, 'snowbridge-media')!; // stripped ".worktree"
    // two rows share the stripped label (repo + container) → find the worktree one
    const container = rows.find((r) => r.kind === 'worktree')!;
    expect(container).toMatchObject({ kind: 'worktree', depth: 0, hasChildren: true, collapsed: true });
    expect(container.count).toBe(4); // 3 + 1 aggregate
    expect(group).toBeDefined();
    // collapsed → children not emitted
    expect(rows.some((r) => r.depth === 1)).toBe(false);
  });

  it('reveals checkouts at depth 1 when the container is expanded', () => {
    const container = '/home/Projects/snowbridge-media.worktree';
    const rows = buildFolderRows(
      [wt('case-study', 3), wt('animation', 1)],
      '/home',
      opts({ expanded: new Set([container]) }),
    );
    expect(rows[0]).toMatchObject({ kind: 'worktree', collapsed: false });
    // children sorted by delta desc within the group
    expect(rows.slice(1).map((r) => r.label)).toEqual(['case-study', 'animation']);
    expect(rows.slice(1).every((r) => r.depth === 1 && r.kind === 'project')).toBe(true);
  });

  it('groups a single checkout too (context beats a bare basename)', () => {
    const rows = buildFolderRows([wt('animation', 1)], '/home', opts());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'worktree', label: 'snowbridge-media', hasChildren: true });
  });

  it('does not hint a repo sitting beside its own <repo>.worktree (the ·wt tag distinguishes them)', () => {
    const rows = buildFolderRows(
      [folder('/home/Antimony/antimony-resources', 2), folder('/home/Antimony/antimony-resources.worktree/animation', 1)],
      '/home',
      opts(),
    );
    const project = rows.find((r) => r.kind === 'project' && r.depth === 0)!;
    const container = rows.find((r) => r.kind === 'worktree')!;
    expect(project.label).toBe('antimony-resources');
    expect(container.label).toBe('antimony-resources'); // same stripped name…
    expect(project.hint).toBeUndefined(); // …but no redundant parent-dir hint
    expect(container.hint).toBeUndefined();
  });

  it('uses the nearest .worktree ancestor and labels the child by its relative path', () => {
    const rows = buildFolderRows(
      [folder('/home/x.worktree/branch-a', 2)],
      '/home',
      opts({ expanded: new Set(['/home/x.worktree']) }),
    );
    expect(rows[1]).toMatchObject({ label: 'branch-a', depth: 1 });
  });
});

describe('buildFolderRows — sort', () => {
  it('items: own delta desc, ties broken by name asc (groups included)', () => {
    const rows = buildFolderRows(
      [folder('/home/b', 1), folder('/home/a', 1), folder('/home/c', 5)],
      '/home',
      opts({ sort: 'items' }),
    );
    expect(rows.map((r) => r.label)).toEqual(['c', 'a', 'b']);
  });

  it('name: alphabetical asc', () => {
    const rows = buildFolderRows(
      [folder('/home/b', 1), folder('/home/a', 1), folder('/home/c', 5)],
      '/home',
      opts({ sort: 'name' }),
    );
    expect(rows.map((r) => r.label)).toEqual(['a', 'b', 'c']);
  });
});

describe('buildFolderRows — hidden filter', () => {
  it('drops dot-segment folders by default, keeps them when showHidden', () => {
    const fs = [folder('/home/Dev/a', 1), folder('/home/.config', 2), folder('/home/.config/skb', 1)];
    const hidden = buildFolderRows(fs, '/home', opts({ showHidden: false }));
    expect(hidden.map((r) => r.label)).toEqual(['a']);

    const shown = buildFolderRows(fs, '/home', opts({ showHidden: true }));
    expect(shown.some((r) => r.label === '.config')).toBe(true);
    expect(shown.some((r) => r.label === 'skb')).toBe(true);
  });
});

describe('buildFolderRows — edges', () => {
  it('returns [] for no folders and for all-hidden + showHidden:false', () => {
    expect(buildFolderRows([], '/home', opts())).toEqual([]);
    expect(buildFolderRows([folder('/home/.x', 1)], '/home', opts({ showHidden: false }))).toEqual([]);
  });

  it('labels folders outside homeRoot by full path and never treats them as worktrees', () => {
    const rows = buildFolderRows([folder('/srv/.elsewhere/app')], '/home/u', opts({ showHidden: false }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: '/srv/.elsewhere/app', kind: 'project' });
  });
});
