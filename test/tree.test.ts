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
function folder(path: string, delta = 0, runtimes: string[] = []): FolderReport {
  const ps: Bucket = { ...emptyBucket(), skills: Array.from({ length: delta }, (_, i) => skill(`${path}#${i}`)) };
  return {
    path,
    group: '',
    runtimes,
    global: emptyBucket(),
    projectScoped: ps,
    local: emptyBucket(),
    effective: emptyBucket(),
  };
}

const opts = (over: Partial<{ sort: 'items' | 'name'; showHidden: boolean; collapsed: ReadonlySet<string> }> = {}) => ({
  sort: 'items' as const,
  showHidden: false,
  collapsed: new Set<string>(),
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

describe('buildFolderRows — nesting & synthetic nodes', () => {
  it('creates a synthetic parent when two folders share a non-discovered ancestor', () => {
    const rows = buildFolderRows(
      [folder('/home/Dev', 0), folder('/home/Dev/Proj/a', 3), folder('/home/Dev/Proj/b', 1)],
      '/home',
      opts(),
    );
    const dev = byLabel(rows, 'Dev')!;
    expect(dev).toBeDefined();
    expect(dev.depth).toBe(0);
    expect(dev.folder).not.toBeNull(); // Dev is discovered
    expect(dev.hasChildren).toBe(true);
    expect(dev.count).toBe(4); // 0 + 3 + 1

    const proj = byLabel(rows, 'Proj')!;
    expect(proj.folder).toBeNull(); // synthetic
    expect(proj.hasChildren).toBe(true);
    expect(proj.depth).toBe(1);
    expect(proj.count).toBe(4);

    const a = byLabel(rows, 'a')!;
    expect(a.depth).toBe(2);
    expect(a.hasChildren).toBe(false);
    expect(a.count).toBe(3);
  });

  it('treats a node that is both discovered and a parent correctly (own + subtree)', () => {
    const rows = buildFolderRows([folder('/home/Meta', 1), folder('/home/Meta/metac', 5)], '/home', opts());
    const meta = byLabel(rows, 'Meta')!;
    expect(meta.folder).not.toBeNull();
    expect(meta.hasChildren).toBe(true);
    expect(meta.count).toBe(6); // own 1 + child 5
    expect(byLabel(rows, 'metac')!.count).toBe(5);
  });
});

describe('buildFolderRows — compression', () => {
  it('compresses a single-child synthetic chain into one row', () => {
    const rows = buildFolderRows([folder('/home/a/b/c/leaf', 2)], '/home', opts());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('a/b/c/leaf');
    expect(rows[0]!.depth).toBe(0);
    expect(rows[0]!.hasChildren).toBe(false);
    expect(rows[0]!.count).toBe(2);
    expect(rows[0]!.folder).not.toBeNull();
    expect(rows[0]!.nodeId).toBe('/home/a/b/c/leaf');
  });

  it('never absorbs a real (discovered) node, even with a single child', () => {
    const rows = buildFolderRows([folder('/home/real', 1), folder('/home/real/child', 2)], '/home', opts());
    expect(byLabel(rows, 'real')).toBeDefined(); // not 'real/child'
    expect(byLabel(rows, 'real')!.depth).toBe(0);
    expect(byLabel(rows, 'child')!.depth).toBe(1);
  });
});

describe('buildFolderRows — sort', () => {
  it('items: aggregate desc, ties broken by name asc', () => {
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

  it('items: sorts children at depth > 0, not just roots', () => {
    const rows = buildFolderRows(
      [folder('/home/p/z', 1), folder('/home/p/a', 3)],
      '/home',
      opts({ sort: 'items' }),
    );
    // `p` is a synthetic parent; its children must be ordered by count desc.
    const children = rows.filter((r) => r.depth === 1).map((r) => r.label);
    expect(children).toEqual(['a', 'z']); // a:3 before z:1
  });
});

describe('buildFolderRows — hidden filter', () => {
  it('drops dot-segment folders by default, keeps them when showHidden', () => {
    const fs = [folder('/home/Dev/a', 1), folder('/home/.config', 2), folder('/home/.config/skb', 1)];
    const hidden = buildFolderRows(fs, '/home', opts({ showHidden: false }));
    expect(hidden.some((r) => r.label.includes('.config'))).toBe(false);
    expect(hidden.map((r) => r.label)).toEqual(['Dev/a']);

    const shown = buildFolderRows(fs, '/home', opts({ showHidden: true }));
    expect(shown.some((r) => r.label === '.config')).toBe(true);
    expect(shown.some((r) => r.label === 'skb')).toBe(true);
  });
});

describe('buildFolderRows — collapse & edges', () => {
  it('a collapsed node hides its descendants but keeps hasChildren', () => {
    const fs = [folder('/home/Meta', 1), folder('/home/Meta/metac', 5)];
    const rows = buildFolderRows(fs, '/home', opts({ collapsed: new Set(['/home/Meta']) }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('Meta');
    expect(rows[0]!.hasChildren).toBe(true);
    expect(rows[0]!.collapsed).toBe(true);
  });

  it('returns [] for no folders and for all-hidden + showHidden:false', () => {
    expect(buildFolderRows([], '/home', opts())).toEqual([]);
    expect(buildFolderRows([folder('/home/.x', 1)], '/home', opts({ showHidden: false }))).toEqual([]);
  });

  it('renders folders outside homeRoot flat by full path', () => {
    const rows = buildFolderRows(
      [folder('/srv/elsewhere/app')],
      '/home/u',
      { sort: 'items', showHidden: false, collapsed: new Set() },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('/srv/elsewhere/app');
    expect(rows[0]!.depth).toBe(0);
  });
});

describe('buildFolderRows — runtime aggregation', () => {
  it('unions a subtree\'s folder runtimes, sorted', () => {
    const rows = buildFolderRows(
      [
        folder('/home/Dev', 0, ['claude-code']),
        folder('/home/Dev/Proj/a', 3, ['codex']),
        folder('/home/Dev/Proj/b', 1, ['claude-code', 'gemini-cli']),
      ],
      '/home',
      opts(),
    );
    expect(byLabel(rows, 'Dev')!.runtimes).toEqual(['claude-code', 'codex', 'gemini-cli']);
    expect(byLabel(rows, 'a')!.runtimes).toEqual(['codex']);
  });

  it('carries runtimes across a compressed single-child chain', () => {
    const rows = buildFolderRows([folder('/home/a/b/leaf', 2, ['cursor'])], '/home', opts());
    expect(rows[0]!.runtimes).toEqual(['cursor']);
  });

  it('is [] for a folder with no runtimes', () => {
    const rows = buildFolderRows([folder('/home/x', 1, [])], '/home', opts());
    expect(rows[0]!.runtimes).toEqual([]);
  });
});
