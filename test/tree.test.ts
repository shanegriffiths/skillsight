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

const opts = (over: Partial<{ sort: 'items' | 'name'; showHidden: boolean }> = {}) => ({
  sort: 'items' as const,
  showHidden: false,
  ...over,
});

const byLabel = (rows: FolderRow[], label: string) => rows.find((r) => r.label === label);

describe('isHiddenPath', () => {
  it('is true when any segment starts with a dot, false otherwise', () => {
    expect(isHiddenPath('.config')).toBe(true);
    expect(isHiddenPath('.config/sketchybar')).toBe(true);
    expect(isHiddenPath('Developer/Tools/open-design/.od/projects/x')).toBe(true);
    expect(isHiddenPath('Developer/Projects/foo.worktree/x')).toBe(false);
    expect(isHiddenPath('Developer/Projects/foo')).toBe(false);
  });
});

describe('buildFolderRows — flat list', () => {
  it('emits one row per discovered folder, labelled by basename — no parent rows', () => {
    const rows = buildFolderRows(
      [folder('/home/Dev/Proj/alpha', 3), folder('/home/Dev/Proj/beta', 1)],
      '/home',
      opts(),
    );
    expect(rows.map((r) => r.label)).toEqual(['alpha', 'beta']);
    expect(rows.every((r) => r.folder)).toBe(true);
  });

  it('counts only the folder\'s own delta (project-scoped ∪ local), no aggregation', () => {
    const rows = buildFolderRows([folder('/home/Meta', 1), folder('/home/Meta/metac', 5)], '/home', opts());
    expect(byLabel(rows, 'Meta')!.count).toBe(1);
    expect(byLabel(rows, 'metac')!.count).toBe(5);
  });

  it('keys rows by absolute path', () => {
    const rows = buildFolderRows([folder('/home/a/b/c/leaf', 2)], '/home', opts());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('leaf');
    expect(rows[0]!.nodeId).toBe('/home/a/b/c/leaf');
  });
});

describe('buildFolderRows — duplicate labels', () => {
  it('adds a parent-dir hint only when two visible rows share a basename', () => {
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

describe('buildFolderRows — sort', () => {
  it('items: own delta desc, ties broken by name asc', () => {
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

  it('labels folders outside homeRoot by full path and never hides them', () => {
    const rows = buildFolderRows([folder('/srv/.elsewhere/app')], '/home/u', opts({ showHidden: false }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('/srv/.elsewhere/app');
  });
});
