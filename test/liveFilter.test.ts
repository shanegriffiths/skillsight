import { describe, it, expect } from 'vitest';
import {
  matchesItemRow,
  matchesFolderRow,
  filterItemRows,
  filterFolderRows,
  allItemGroupIds,
  expandAllFolders,
  itemMatchCount,
  folderMatchCount,
  searchAction,
  type SearchKey,
} from '../src/render/ink/liveFilter.js';
import type { ItemRow } from '../src/render/ink/rows.js';
import type { FolderRow } from '../src/render/ink/tree.js';

const leaf = (name: string, over: Partial<ItemRow> = {}): ItemRow => ({
  kind: 'skill',
  name,
  used: 0,
  source: null,
  sourceDim: false,
  ...over,
});

/** A fully-expanded grouped list: one plugin group of two skills + one standalone. */
const grouped: ItemRow[] = [
  { ...leaf('superpowers', { kind: 'plugin' }), used: 2, expandState: 'expanded', groupId: 'superpowers@hub' },
  leaf('brainstorming', { depth: 1 }),
  leaf('writing-plans', { depth: 1 }),
  leaf('standalone-git', { source: 'acme/git-tools' }),
];

describe('matchesItemRow', () => {
  it('matches name case-insensitively as a substring', () => {
    expect(matchesItemRow(leaf('Brainstorming'), 'storm')).toBe(true);
    expect(matchesItemRow(leaf('brainstorming'), 'STORM')).toBe(true);
    expect(matchesItemRow(leaf('brainstorming'), 'xyz')).toBe(false);
  });
  it('matches the source field too', () => {
    expect(matchesItemRow(leaf('foo', { source: 'acme/git-tools' }), 'acme')).toBe(true);
    expect(matchesItemRow(leaf('foo', { source: null }), 'acme')).toBe(false);
  });
  it('empty query matches everything', () => {
    expect(matchesItemRow(leaf('anything'), '')).toBe(true);
  });
});

describe('filterItemRows', () => {
  it('empty query returns rows unchanged', () => {
    expect(filterItemRows(grouped, '')).toBe(grouped);
  });
  it('a header match keeps the header and ALL its children', () => {
    const out = filterItemRows(grouped, 'superpowers');
    expect(out.map((r) => r.name)).toEqual(['superpowers', 'brainstorming', 'writing-plans']);
    expect(out[0]!.expandState).toBe('expanded');
  });
  it('a child match keeps the header and only matching children', () => {
    const out = filterItemRows(grouped, 'brainstorm');
    expect(out.map((r) => r.name)).toEqual(['superpowers', 'brainstorming']);
  });
  it('a group with no matches disappears entirely', () => {
    const out = filterItemRows(grouped, 'standalone');
    expect(out.map((r) => r.name)).toEqual(['standalone-git']);
  });
  it('top-level leaves match on source', () => {
    const out = filterItemRows(grouped, 'acme');
    expect(out.map((r) => r.name)).toEqual(['standalone-git']);
  });
  it('no matches at all yields an empty list', () => {
    expect(filterItemRows(grouped, 'zzzz')).toEqual([]);
  });
});

describe('allItemGroupIds', () => {
  it('collects groupKey of every header row', () => {
    expect([...allItemGroupIds(grouped)]).toEqual(['superpowers@hub']);
  });
});

const fr = (
  nodeId: string,
  label: string,
  depth: number,
  kind: 'project' | 'worktrees',
  over: Partial<FolderRow> = {},
): FolderRow => ({
  nodeId,
  label,
  count: 0,
  depth,
  kind,
  hasChildren: false,
  collapsed: false,
  folder: null,
  ...over,
});

const HOME = '/Users/shane';
/** Fully-expanded tree: repo → worktrees group → checkout, plus a flat sibling. */
const tree: FolderRow[] = [
  fr(`${HOME}/Developer/Projects/skillsight`, 'skillsight', 0, 'project', { hasChildren: true }),
  fr(`${HOME}/Developer/Projects/skillsight.worktree`, 'worktrees', 1, 'worktrees', { hasChildren: true }),
  fr(`${HOME}/Developer/Projects/skillsight.worktree/feature-x`, 'feature-x', 2, 'project'),
  fr(`${HOME}/Developer/Projects/other-app`, 'other-app', 0, 'project'),
];

describe('matchesFolderRow', () => {
  it('matches the label', () => {
    expect(matchesFolderRow(tree[3]!, 'other', HOME)).toBe(true);
  });
  it('matches the path with the home prefix stripped', () => {
    expect(matchesFolderRow(tree[0]!, 'Projects/skill', HOME)).toBe(true);
    // The home-root itself must NOT make every row match.
    expect(matchesFolderRow(tree[3]!, 'shane', HOME)).toBe(false);
  });
});

describe('filterFolderRows', () => {
  it('empty query returns rows unchanged', () => {
    expect(filterFolderRows(tree, '', HOME)).toBe(tree);
  });
  it('keeps ancestors of a deep match, un-collapsed', () => {
    const out = filterFolderRows(tree, 'feature-x', HOME);
    expect(out.map((r) => r.label)).toEqual(['skillsight', 'worktrees', 'feature-x']);
    expect(out.every((r) => !r.collapsed)).toBe(true);
  });
  it('drops non-matching subtrees', () => {
    const out = filterFolderRows(tree, 'other-app', HOME);
    expect(out.map((r) => r.label)).toEqual(['other-app']);
  });
});

describe('expandAllFolders', () => {
  it('iterates the builder until the expandable-id set stabilises', () => {
    // Simulates buildFolderRows: the worktrees node only appears once its repo
    // is expanded, and the checkout only once the worktrees node is expanded.
    const build = (exp: ReadonlySet<string>): FolderRow[] => {
      const out: FolderRow[] = [fr('/repo', 'repo', 0, 'project', { hasChildren: true, collapsed: !exp.has('/repo') })];
      if (exp.has('/repo')) {
        out.push(fr('/repo.worktree', 'worktrees', 1, 'worktrees', { hasChildren: true, collapsed: !exp.has('/repo.worktree') }));
        if (exp.has('/repo.worktree')) out.push(fr('/repo.worktree/wt', 'wt', 2, 'project'));
      }
      return out;
    };
    expect(expandAllFolders(build).map((r) => r.label)).toEqual(['repo', 'worktrees', 'wt']);
  });
});

describe('match counts', () => {
  it('counts non-header item rows only', () => {
    expect(itemMatchCount(filterItemRows(grouped, 'brainstorm'), grouped)).toBe('1/3');
  });
  it('counts direct project matches, not ancestor context rows', () => {
    expect(folderMatchCount(filterFolderRows(tree, 'feature-x', HOME), tree, 'feature-x', HOME)).toBe('1/3');
  });
  it('counts a directly-matching repo header as a hit', () => {
    // `skillsight` hits the repo row itself AND the checkout (path contains
    // `skillsight.worktree/`); the worktrees grouping node is never counted.
    expect(folderMatchCount(filterFolderRows(tree, 'skillsight', HOME), tree, 'skillsight', HOME)).toBe('2/3');
  });
});

const k = (over: Partial<SearchKey> = {}): SearchKey => ({
  escape: false,
  return: false,
  upArrow: false,
  downArrow: false,
  backspace: false,
  delete: false,
  ctrl: false,
  meta: false,
  tab: false,
  ...over,
});

describe('searchAction', () => {
  it('maps the control keys', () => {
    expect(searchAction('', k({ escape: true }))).toEqual({ type: 'escape' });
    expect(searchAction('', k({ return: true }))).toEqual({ type: 'enter' });
    expect(searchAction('', k({ upArrow: true }))).toEqual({ type: 'up' });
    expect(searchAction('', k({ downArrow: true }))).toEqual({ type: 'down' });
    // Ink reports Backspace as `delete` on some terminals — treat both as backspace.
    expect(searchAction('', k({ backspace: true }))).toEqual({ type: 'backspace' });
    expect(searchAction('', k({ delete: true }))).toEqual({ type: 'backspace' });
  });
  it('treats reserved app keys as plain text', () => {
    for (const ch of ['q', 'f', 's', '.', 'y', '1', '4', 'j', 'h', '/']) {
      expect(searchAction(ch, k())).toEqual({ type: 'type', text: ch });
    }
  });
  it('suspends tab and ctrl/meta chords as no-ops', () => {
    expect(searchAction('\t', k({ tab: true }))).toEqual({ type: 'none' });
    expect(searchAction('c', k({ ctrl: true }))).toEqual({ type: 'none' });
    expect(searchAction('v', k({ meta: true }))).toEqual({ type: 'none' });
  });
  it('strips control characters from pasted text', () => {
    expect(searchAction('abc', k())).toEqual({ type: 'type', text: 'abc' });
    expect(searchAction('', k())).toEqual({ type: 'none' });
  });
});
