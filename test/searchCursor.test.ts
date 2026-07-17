import { describe, it, expect } from 'vitest';
import {
  itemIdentity,
  cursorAfterEscape,
  revealTarget,
  folderCursorAfterEscape,
  revealFolderTarget,
} from '../src/render/ink/searchCursor.js';
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

const header: ItemRow = {
  ...leaf('superpowers', { kind: 'plugin' }),
  used: 2,
  expandState: 'collapsed',
  groupId: 'superpowers@hub',
};
const children = [leaf('brainstorming', { depth: 1 }), leaf('writing-plans', { depth: 1 })];

/** Simulates groupedRows: children render only when the group id is expanded. */
const build = (exp: ReadonlySet<string>): ItemRow[] => [
  { ...header, expandState: exp.has('superpowers@hub') ? 'expanded' : 'collapsed' },
  ...(exp.has('superpowers@hub') ? children : []),
  leaf('standalone-git'),
];

/** What the filtered list looks like mid-search for query "brainstorm". */
const filtered: ItemRow[] = [{ ...header, expandState: 'expanded' }, children[0]!];

describe('itemIdentity', () => {
  it('distinguishes headers from same-named leaves', () => {
    expect(itemIdentity(header)).not.toBe(itemIdentity(leaf('superpowers', { kind: 'plugin' })));
  });
});

describe('cursorAfterEscape', () => {
  it('finds the row by identity when visible in the full list', () => {
    const full = build(new Set(['superpowers@hub']));
    expect(cursorAfterEscape(full, filtered, 1)).toBe(1); // brainstorming
  });
  it('falls back to the owning header when the child is hidden', () => {
    const full = build(new Set()); // group collapsed: child not present
    expect(cursorAfterEscape(full, filtered, 1)).toBe(0); // the header
  });
  it('falls back to 0 on an empty filtered list', () => {
    expect(cursorAfterEscape(build(new Set()), [], 0)).toBe(0);
  });
});

describe('revealTarget', () => {
  it('returns the visible index unchanged when the target is already visible', () => {
    const r = revealTarget((e) => build(e), new Set(['superpowers@hub']), filtered, 1);
    expect(r).not.toBeNull();
    expect(r!.index).toBe(1);
    expect([...r!.expanded]).toEqual(['superpowers@hub']);
  });
  it('expands the owning group to reveal a hidden child', () => {
    const r = revealTarget((e) => build(e), new Set(), filtered, 1);
    expect(r).not.toBeNull();
    expect([...r!.expanded]).toEqual(['superpowers@hub']);
    expect(r!.index).toBe(1); // brainstorming, now visible
  });
  it('returns null for an empty filtered list', () => {
    expect(revealTarget((e) => build(e), new Set(), [], 0)).toBeNull();
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

/** Simulates buildFolderRows: each level appears only when its parent is expanded. */
const fbuild = (exp: ReadonlySet<string>): FolderRow[] => {
  const out: FolderRow[] = [fr('/repo', 'repo', 0, 'project', { hasChildren: true, collapsed: !exp.has('/repo') })];
  if (exp.has('/repo')) {
    out.push(fr('/repo.worktree', 'worktrees', 1, 'worktrees', { hasChildren: true, collapsed: !exp.has('/repo.worktree') }));
    if (exp.has('/repo.worktree')) out.push(fr('/repo.worktree/wt', 'wt', 2, 'project'));
  }
  out.push(fr('/other', 'other', 0, 'project'));
  return out;
};

/** Filtered view for query "wt": ancestors kept, un-collapsed. */
const ffiltered: FolderRow[] = [
  fr('/repo', 'repo', 0, 'project', { hasChildren: true }),
  fr('/repo.worktree', 'worktrees', 1, 'worktrees', { hasChildren: true }),
  fr('/repo.worktree/wt', 'wt', 2, 'project'),
];

describe('folderCursorAfterEscape', () => {
  it('finds a visible row by nodeId', () => {
    expect(folderCursorAfterEscape(fbuild(new Set()), ffiltered, 0)).toBe(0);
  });
  it('falls back to the nearest visible ancestor for a hidden checkout', () => {
    expect(folderCursorAfterEscape(fbuild(new Set()), ffiltered, 2)).toBe(0); // /repo
  });
});

describe('revealFolderTarget', () => {
  it('expands the ancestor chain so the target becomes visible', () => {
    const r = revealFolderTarget((e) => fbuild(e), new Set(), ffiltered, 2);
    expect(r).not.toBeNull();
    expect([...r!.expanded].sort()).toEqual(['/repo', '/repo.worktree']);
    expect(r!.index).toBe(2); // wt within the fully-revealed build
  });
  it('leaves expansion untouched for an already-visible target', () => {
    const r = revealFolderTarget((e) => fbuild(e), new Set(), ffiltered, 0);
    expect(r).not.toBeNull();
    expect([...r!.expanded]).toEqual([]);
    expect(r!.index).toBe(0);
  });
});
