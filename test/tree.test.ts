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
  const repoDir = '/home/Projects/snowbridge-media';
  const container = `${repoDir}.worktree`;
  const wt = (checkout: string, delta: number) => folder(`${container}/${checkout}`, delta);

  it('folds worktrees under the repo as one top row (default collapsed, no sibling container)', () => {
    const rows = buildFolderRows([folder(repoDir, 12), wt('case-study', 3), wt('animation', 1)], '/home', opts());
    expect(rows).toHaveLength(1); // just the repo; descendants hidden while collapsed
    expect(rows[0]).toMatchObject({ nodeId: repoDir, kind: 'project', depth: 0, hasChildren: true, collapsed: true });
    expect(rows[0]!.folder).not.toBeNull(); // main checkout discovered → selectable
  });

  it('never aggregates: the repo count is its own delta, not the sum of checkouts', () => {
    const rows = buildFolderRows([folder(repoDir, 2), wt('a', 5), wt('b', 4)], '/home', opts());
    expect(rows[0]!.count).toBe(2); // not 11
  });

  it('expanding the repo reveals a worktrees group; expanding that reveals the checkouts', () => {
    const repoOpen = buildFolderRows([folder(repoDir, 12), wt('case-study', 3)], '/home', opts({ expanded: new Set([repoDir]) }));
    expect(repoOpen.map((r) => [r.label, r.depth])).toEqual([['snowbridge-media', 0], ['worktrees', 1]]);
    expect(repoOpen[1]).toMatchObject({ kind: 'worktrees', hasChildren: true, collapsed: true, count: 0, folder: null });

    const allOpen = buildFolderRows(
      [folder(repoDir, 12), wt('case-study', 3), wt('animation', 1)],
      '/home',
      opts({ expanded: new Set([repoDir, container]) }),
    );
    expect(allOpen.map((r) => r.label)).toEqual(['snowbridge-media', 'worktrees', 'case-study', 'animation']);
    // checkouts at depth 2 with their OWN counts, sorted by delta desc
    expect(allOpen.slice(2).map((r) => [r.label, r.depth, r.count])).toEqual([['case-study', 2, 3], ['animation', 2, 1]]);
  });

  it('does not emit a duplicate nodeId when the .worktree container is itself discovered', () => {
    // Shane's `.claude.json` registers the bucket dir itself as a project, so
    // discovery hands buildFolderRows a folder whose path IS the container. It
    // must not become a standalone row colliding with the synthetic worktrees
    // node (both keyed by the container path → duplicate React key every render).
    const rows = buildFolderRows(
      [folder(repoDir, 12), folder(container, 0), wt('animation', 1)],
      '/home',
      opts({ expanded: new Set([repoDir, container]) }),
    );
    const ids = rows.map((r) => r.nodeId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate keys
    expect(rows.filter((r) => r.nodeId === container)).toHaveLength(1); // only the group node
    expect(rows.map((r) => r.label)).toEqual(['snowbridge-media', 'worktrees', 'animation']);
  });

  it('never shows a discovered .worktree bucket as a standalone top-level row', () => {
    const rows = buildFolderRows([folder(repoDir, 12), folder(container, 0), wt('animation', 1)], '/home', opts());
    expect(rows).toHaveLength(1); // just the repo, collapsed — no lone `…worktree` sibling
    expect(rows[0]).toMatchObject({ nodeId: repoDir, hasChildren: true });
  });

  it('groups a single checkout too, even when the main checkout was not discovered', () => {
    const rows = buildFolderRows([wt('animation', 1)], '/home', opts());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'project', label: 'snowbridge-media', hasChildren: true, count: 0, folder: null });
  });

  it('uses the nearest .worktree ancestor and labels the checkout by its relative path', () => {
    const rows = buildFolderRows(
      [folder('/home/x.worktree/branch-a', 2)],
      '/home',
      opts({ expanded: new Set(['/home/x', '/home/x.worktree']) }),
    );
    expect(rows.map((r) => [r.label, r.depth])).toEqual([['x', 0], ['worktrees', 1], ['branch-a', 2]]);
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
