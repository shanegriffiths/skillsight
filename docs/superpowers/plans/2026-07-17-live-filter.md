# Live Filter (`/`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/`-triggered find-as-you-type filter box, rendered inside each table above the first row, that live-narrows the focused list on all four tabs of the skillsight TUI.

**Architecture:** A pure, unit-tested core (`liveFilter.ts` for matching/narrowing, `searchCursor.ts` for cursor mapping on close) plus a tiny `useLiveFilter` state hook and a `SearchLine` component rendered inside `ItemTable`/`FolderList`. Each view (GlobalView, RankedView, FoldersView) owns its own filter state — the same pattern as per-view sort — and reports "box open" up to App so global keys (`q`, `f`, `1-4`, Tab) are suspended while typing. The spec is `docs/superpowers/specs/2026-07-17-live-filter-design.md` — read it first.

**Tech Stack:** TypeScript (ESM, NodeNext — all relative imports need the `.js` suffix), Ink 5 + React, vitest, tsup.

## Global Constraints

- All relative imports end in `.js` (ESM NodeNext), even from `.tsx` files.
- No new dependencies.
- Tests: `npm test` (vitest run). Types: `npm run typecheck`. Both must pass at every commit.
- Never use shell heredocs in this repo — they hang. Write multi-line content with the Write tool; commit with a single-line `git commit -m "..."` only.
- Match the codebase's comment style: block comments explain *why*/non-obvious contracts, not what the next line does.
- Matching is **case-insensitive substring**. Item rows match `name` OR `source`; folder rows match `label` OR `nodeId` with the home-root prefix stripped.
- Filter state is per-view, resets on tab switch (views unmount), and never touches the Inventory or the chip filter.

---

### Task 1: Pure matching + narrowing core (`liveFilter.ts`)

**Files:**
- Create: `src/render/ink/liveFilter.ts`
- Test: `test/liveFilter.test.ts`

**Interfaces:**
- Consumes: `ItemRow`, `groupKey` from `src/render/ink/rows.js`; `FolderRow` from `src/render/ink/tree.js`.
- Produces (used by Tasks 3–6):
  - `matchesItemRow(row: ItemRow, query: string): boolean`
  - `matchesFolderRow(row: FolderRow, query: string, homeRoot: string): boolean`
  - `filterItemRows(rows: ItemRow[], query: string): ItemRow[]` — input must be a **fully-expanded** grouped list
  - `filterFolderRows(rows: FolderRow[], query: string, homeRoot: string): FolderRow[]` — input must be a **fully-expanded** folder tree
  - `allItemGroupIds(rows: ItemRow[]): Set<string>`
  - `expandAllFolders(build: (expanded: ReadonlySet<string>) => FolderRow[]): FolderRow[]`
  - `itemMatchCount(filtered: ItemRow[], full: ItemRow[]): string` (e.g. `"7/43"`, counting non-header rows)
  - `folderMatchCount(filtered: FolderRow[], full: FolderRow[], query: string, homeRoot: string): string` — numerator counts `kind === 'project'` rows in `filtered` that DIRECTLY match the query (ancestor rows kept only as context don't count); denominator counts `kind === 'project'` rows in `full`

- [ ] **Step 1: Write the failing tests**

Create `test/liveFilter.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/liveFilter.test.ts`
Expected: FAIL — `Cannot find module '../src/render/ink/liveFilter.js'`

- [ ] **Step 3: Write the implementation**

Create `src/render/ink/liveFilter.ts`:

```ts
/**
 * Pure core of the `/` find-as-you-type filter: case-insensitive substring
 * matching over display rows. Item lists must be passed FULLY EXPANDED (every
 * group open) so children of user-collapsed groups are findable; group
 * survival: a header stays when it matches (all children shown) or when a
 * child matches (only the hits shown). Folder trees keep the ancestors of any
 * match so the tree stays navigable. Never touches Inventory or chip filters.
 */
import type { ItemRow } from './rows.js';
import { groupKey } from './rows.js';
import type { FolderRow } from './tree.js';

export function matchesItemRow(row: ItemRow, query: string): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  return row.name.toLowerCase().includes(q) || (row.source ?? '').toLowerCase().includes(q);
}

export function matchesFolderRow(row: FolderRow, query: string, homeRoot: string): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  // Strip the shared home prefix so a query like `shane` doesn't match every row.
  const path = row.nodeId.startsWith(homeRoot) ? row.nodeId.slice(homeRoot.length) : row.nodeId;
  return row.label.toLowerCase().includes(q) || path.toLowerCase().includes(q);
}

export function filterItemRows(rows: ItemRow[], query: string): ItemRow[] {
  if (!query) return rows;
  const out: ItemRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.expandState === undefined) {
      // depth-1 children are consumed with their header below.
      if (!row.depth && matchesItemRow(row, query)) out.push(row);
      continue;
    }
    const children: ItemRow[] = [];
    let j = i + 1;
    while (j < rows.length && rows[j]!.depth === 1) children.push(rows[j++]!);
    i = j - 1;
    if (matchesItemRow(row, query)) {
      out.push({ ...row, expandState: 'expanded' }, ...children);
    } else {
      const hits = children.filter((c) => matchesItemRow(c, query));
      if (hits.length) out.push({ ...row, expandState: 'expanded' }, ...hits);
    }
  }
  return out;
}

export function filterFolderRows(rows: FolderRow[], query: string, homeRoot: string): FolderRow[] {
  if (!query) return rows;
  const hit = rows.map((r) => matchesFolderRow(r, query, homeRoot));
  const keep = rows.map((r, i) => {
    if (hit[i]) return true;
    // An ancestor survives when any row in its subtree (deeper, contiguous) hits.
    for (let j = i + 1; j < rows.length && rows[j]!.depth > r.depth; j++) {
      if (hit[j]) return true;
    }
    return false;
  });
  return rows.filter((_, i) => keep[i]).map((r) => (r.hasChildren ? { ...r, collapsed: false } : r));
}

/** Every group-header id in a grouped list (headers render whether open or not). */
export function allItemGroupIds(rows: ItemRow[]): Set<string> {
  return new Set(rows.filter((r) => r.expandState !== undefined).map((r) => groupKey(r)));
}

/**
 * Fully expand a folder tree whose deeper expandable nodes only appear once
 * their parent is open (repo → worktrees → checkouts): re-run the builder
 * until the set of expandable ids stops growing (≤3 passes for depth 2).
 */
export function expandAllFolders(build: (expanded: ReadonlySet<string>) => FolderRow[]): FolderRow[] {
  let ids = new Set<string>();
  for (;;) {
    const rows = build(ids);
    const next = new Set([...ids, ...rows.filter((r) => r.hasChildren).map((r) => r.nodeId)]);
    if (next.size === ids.size) return rows;
    ids = next;
  }
}

const isItemLeaf = (r: ItemRow) => r.expandState === undefined;
const isFolderLeaf = (r: FolderRow) => r.kind === 'project';

export function itemMatchCount(filtered: ItemRow[], full: ItemRow[]): string {
  return `${filtered.filter(isItemLeaf).length}/${full.filter(isItemLeaf).length}`;
}

export function folderMatchCount(filtered: FolderRow[], full: FolderRow[], query: string, homeRoot: string): string {
  // Count DIRECT hits only — ancestors kept as tree context aren't matches.
  const hits = filtered.filter((r) => isFolderLeaf(r) && matchesFolderRow(r, query, homeRoot)).length;
  return `${hits}/${full.filter(isFolderLeaf).length}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/liveFilter.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: no type errors; all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/render/ink/liveFilter.ts test/liveFilter.test.ts
git commit -m "feat: liveFilter pure core - matching, group-aware narrowing, counts"
```

---

### Task 2: Key mapper, state hook, and the search line in both tables

**Files:**
- Create: `src/render/ink/SearchLine.tsx`
- Create: `src/render/ink/useLiveFilter.ts`
- Modify: `src/render/ink/liveFilter.ts` (append `searchAction`)
- Modify: `src/render/ink/ItemTable.tsx` (optional `search` prop)
- Modify: `src/render/ink/FolderList.tsx` (optional `search` prop)
- Test: `test/liveFilter.test.ts` (append `searchAction` cases)

**Interfaces:**
- Consumes: `theme` from `./theme.js`; Ink `Key` type.
- Produces (used by Tasks 4–6):
  - `searchAction(input: string, key: SearchKey): SearchAction` in `liveFilter.ts`, where
    `type SearchKey = Pick<Key, 'escape' | 'return' | 'upArrow' | 'downArrow' | 'backspace' | 'delete' | 'ctrl' | 'meta' | 'tab'>` and
    `type SearchAction = { type: 'type'; text: string } | { type: 'backspace' } | { type: 'escape' } | { type: 'enter' } | { type: 'up' } | { type: 'down' } | { type: 'none' }`
  - `useLiveFilter(): { open: boolean; query: string; start(): void; clear(): void; edit(a: SearchAction): void }`
  - `SearchLine({ query, count }: { query: string; count: string })` — one line, rendered by the tables
  - `ItemTable` new optional prop `search?: { query: string; count: string }` (+1 rendered line when present; dim ` no matches` line when present and `rows` is empty)
  - `FolderList` same new optional prop

- [ ] **Step 1: Write the failing tests**

Append to `test/liveFilter.test.ts`:

```ts
import { searchAction, type SearchKey } from '../src/render/ink/liveFilter.js';

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
    expect(searchAction('ab\u0007c', k())).toEqual({ type: 'type', text: 'abc' });
    expect(searchAction('\u0007', k())).toEqual({ type: 'none' });
  });
});
```

- [ ] **Step 2: Run tests to verify the new cases fail**

Run: `npx vitest run test/liveFilter.test.ts`
Expected: FAIL — `searchAction` is not exported.

- [ ] **Step 3: Append `searchAction` to `liveFilter.ts`**

```ts
import type { Key } from 'ink';

export type SearchKey = Pick<
  Key,
  'escape' | 'return' | 'upArrow' | 'downArrow' | 'backspace' | 'delete' | 'ctrl' | 'meta' | 'tab'
>;

export type SearchAction =
  | { type: 'type'; text: string }
  | { type: 'backspace' }
  | { type: 'escape' }
  | { type: 'enter' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'none' };

/**
 * Keypress → search-box action. Everything printable is query text (including
 * `q`/`f`/digits — app keys are suspended while the box is open); Tab and
 * ctrl/meta chords are deliberate no-ops. Ink reports Backspace as `delete`
 * on some terminals, so both flags mean backspace.
 */
export function searchAction(input: string, key: SearchKey): SearchAction {
  if (key.escape) return { type: 'escape' };
  if (key.return) return { type: 'enter' };
  if (key.upArrow) return { type: 'up' };
  if (key.downArrow) return { type: 'down' };
  if (key.backspace || key.delete) return { type: 'backspace' };
  if (key.ctrl || key.meta || key.tab) return { type: 'none' };
  const text = [...input].filter((ch) => ch >= ' ' && ch !== '\u007f').join('');
  return text ? { type: 'type', text } : { type: 'none' };
}
```

(The `import type { Key } from 'ink'` goes at the top of the file with the other imports.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/liveFilter.test.ts`
Expected: PASS

- [ ] **Step 5: Create the hook**

Create `src/render/ink/useLiveFilter.ts`:

```ts
import { useState } from 'react';
import type { SearchAction } from './liveFilter.js';

/**
 * State of one view's `/` filter box: open flag + query text. Enter/Esc
 * consequences (cursor mapping, detail opening) are view-specific and live in
 * the views; this only owns the text.
 */
export function useLiveFilter() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const start = () => {
    setOpen(true);
    setQuery('');
  };
  const clear = () => {
    setOpen(false);
    setQuery('');
  };
  const edit = (a: SearchAction) => {
    if (a.type === 'type') setQuery((q) => q + a.text);
    else if (a.type === 'backspace') setQuery((q) => q.slice(0, -1));
  };
  return { open, query, start, clear, edit };
}
```

- [ ] **Step 6: Create the SearchLine component**

Create `src/render/ink/SearchLine.tsx`:

```tsx
import { Text } from 'ink';
import { theme } from './theme.js';

/**
 * The one-line find-as-you-type box, rendered INSIDE a table box directly
 * under the column-header rule (above the first row). `count` is the
 * `matches/total` string from liveFilter's match-count helpers.
 */
export function SearchLine({ query, count }: { query: string; count: string }) {
  return (
    <Text wrap="truncate-end">
      {' '}
      <Text color={theme.accent} bold>
        /
      </Text>{' '}
      <Text bold>{query}</Text>
      <Text color={theme.accent}>▌</Text>
      <Text dimColor>  {count}</Text>
    </Text>
  );
}
```

- [ ] **Step 7: Add the `search` prop to ItemTable**

In `src/render/ink/ItemTable.tsx`:

Add the import:

```tsx
import { SearchLine } from './SearchLine.js';
```

Extend the component signature (new prop after `width`):

```tsx
export function ItemTable({
  rows,
  variant = 'state',
  selectedIndex,
  width,
  search,
}: {
  rows: ItemRow[];
  variant?: TableVariant;
  /** Index (within `rows`) of the highlighted row; omit for no cursor (e.g. an unfocused preview). */
  selectedIndex?: number;
  /** Total outer width of the table box (border + padding included). */
  width: number;
  /** When present, render the live-filter line under the header rule (+1 line of chrome). */
  search?: { query: string; count: string };
}) {
```

Then in the returned JSX, insert between the rule `<Text>` and the `rows.map(...)`:

```tsx
      {search ? <SearchLine query={search.query} count={search.count} /> : null}
      {search && rows.length === 0 ? <Text dimColor> no matches</Text> : null}
```

- [ ] **Step 8: Add the `search` prop to FolderList**

In `src/render/ink/FolderList.tsx`:

Add the import:

```tsx
import { SearchLine } from './SearchLine.js';
```

Extend the signature:

```tsx
export function FolderList({
  rows,
  selected,
  dimmed = false,
  width,
  search,
}: {
  rows: FolderRow[];
  selected: number;
  dimmed?: boolean;
  width: number;
  /** When present, render the live-filter line under the header rule (+1 line of chrome). */
  search?: { query: string; count: string };
}) {
```

Insert after the rule `<Text>` (the `'─'.repeat(contentW)` line) and change the empty-state line:

```tsx
      {search ? <SearchLine query={search.query} count={search.count} /> : null}
      {search && rows.length === 0 ? <Text dimColor> no matches</Text> : null}
      {rows.length === 0 && !search ? <Text dimColor>no folders discovered</Text> : null}
```

(The original `{rows.length === 0 ? <Text dimColor>no folders discovered</Text> : null}` is replaced by the last line above.)

- [ ] **Step 9: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: clean. (Nothing passes `search` yet — the prop is inert until Tasks 4–6.)

- [ ] **Step 10: Commit**

```bash
git add src/render/ink/liveFilter.ts src/render/ink/useLiveFilter.ts src/render/ink/SearchLine.tsx src/render/ink/ItemTable.tsx src/render/ink/FolderList.tsx test/liveFilter.test.ts
git commit -m "feat: searchAction mapper, useLiveFilter hook, SearchLine in both tables"
```

---

### Task 3: Cursor mapping on close (`searchCursor.ts`) + select/openAt plumbing

**Files:**
- Create: `src/render/ink/searchCursor.ts`
- Modify: `src/render/ink/scroll.ts` (expose `select` from `useScroll`)
- Modify: `src/render/ink/listDetail.ts` (expose `select` + `openAt` from `useListDetail`)
- Test: `test/searchCursor.test.ts`

**Interfaces:**
- Consumes: `ItemRow`, `groupKey` from `./rows.js`; `FolderRow` from `./tree.js`; `clampIndex` from `./scroll.js`.
- Produces (used by Tasks 4–6):
  - `itemIdentity(r: ItemRow): string` — `kind:g:<groupKey>` for headers, `kind:<name>` for leaves
  - `cursorAfterEscape(full: ItemRow[], filtered: ItemRow[], sel: number): number` — index into `full`; falls back to the owning header, then 0
  - `revealTarget(build: (expanded: Set<string>) => ItemRow[], expanded: ReadonlySet<string>, filtered: ItemRow[], sel: number): { expanded: Set<string>; index: number } | null` — expands the owning group when needed; `index` is into `build(expanded')`
  - `folderCursorAfterEscape(full: FolderRow[], filtered: FolderRow[], sel: number): number`
  - `revealFolderTarget(build: (expanded: ReadonlySet<string>) => FolderRow[], expanded: ReadonlySet<string>, filtered: FolderRow[], sel: number): { expanded: Set<string>; index: number } | null`
  - `useScroll` additionally returns `select(i: number): void`
  - `useListDetail` additionally returns `select(i: number): void` and `openAt(i: number): void`

- [ ] **Step 1: Write the failing tests**

Create `test/searchCursor.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/searchCursor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/render/ink/searchCursor.ts`:

```ts
/**
 * Cursor mapping when the `/` filter box closes. Esc restores the user's list
 * untouched, so a hit hidden inside a user-collapsed group lands on its group
 * header. Enter must OPEN the row, so the owning group / ancestor chain is
 * expanded (persisting into the user's expansion state) and the row's index in
 * the rebuilt list is returned. Pure; the views own the setState calls.
 */
import type { ItemRow } from './rows.js';
import { groupKey } from './rows.js';
import type { FolderRow } from './tree.js';
import { clampIndex } from './scroll.js';

/** Row identity across rebuilds: headers by group key, leaves by kind+name. */
export function itemIdentity(r: ItemRow): string {
  return r.expandState !== undefined ? `${r.kind}:g:${groupKey(r)}` : `${r.kind}:${r.name}`;
}

function findItem(rows: ItemRow[], id: string): number {
  return rows.findIndex((r) => itemIdentity(r) === id);
}

/** Nearest header at or before `from` — a filtered child always follows its header. */
function owningHeader(rows: ItemRow[], from: number): ItemRow | undefined {
  for (let i = from; i >= 0; i--) {
    if (rows[i]!.expandState !== undefined) return rows[i];
  }
  return undefined;
}

export function cursorAfterEscape(full: ItemRow[], filtered: ItemRow[], sel: number): number {
  const target = filtered[clampIndex(sel, filtered.length)];
  if (!target) return 0;
  const i = findItem(full, itemIdentity(target));
  if (i >= 0) return i;
  if (target.depth === 1) {
    const h = owningHeader(filtered, clampIndex(sel, filtered.length));
    if (h) {
      const hi = findItem(full, itemIdentity(h));
      if (hi >= 0) return hi;
    }
  }
  return 0;
}

export function revealTarget(
  build: (expanded: Set<string>) => ItemRow[],
  expanded: ReadonlySet<string>,
  filtered: ItemRow[],
  sel: number,
): { expanded: Set<string>; index: number } | null {
  const at = clampIndex(sel, filtered.length);
  const target = filtered[at];
  if (!target) return null;
  const next = new Set(expanded);
  if (target.expandState === undefined && target.depth === 1) {
    const h = owningHeader(filtered, at);
    if (h) next.add(groupKey(h));
  }
  const index = findItem(build(next), itemIdentity(target));
  return index >= 0 ? { expanded: next, index } : null;
}

/** The ancestor chain of `filtered[at]`: preceding rows of strictly decreasing depth. */
function folderAncestors(filtered: FolderRow[], at: number): FolderRow[] {
  const out: FolderRow[] = [];
  let depth = filtered[at]?.depth ?? 0;
  for (let j = at - 1; j >= 0 && depth > 0; j--) {
    const r = filtered[j]!;
    if (r.depth < depth) {
      out.push(r);
      depth = r.depth;
    }
  }
  return out;
}

export function folderCursorAfterEscape(full: FolderRow[], filtered: FolderRow[], sel: number): number {
  const at = clampIndex(sel, filtered.length);
  const target = filtered[at];
  if (!target) return 0;
  const i = full.findIndex((r) => r.nodeId === target.nodeId);
  if (i >= 0) return i;
  for (const a of folderAncestors(filtered, at)) {
    const ai = full.findIndex((r) => r.nodeId === a.nodeId);
    if (ai >= 0) return ai;
  }
  return 0;
}

export function revealFolderTarget(
  build: (expanded: ReadonlySet<string>) => FolderRow[],
  expanded: ReadonlySet<string>,
  filtered: FolderRow[],
  sel: number,
): { expanded: Set<string>; index: number } | null {
  const at = clampIndex(sel, filtered.length);
  const target = filtered[at];
  if (!target) return null;
  const next = new Set(expanded);
  for (const a of folderAncestors(filtered, at)) {
    if (a.hasChildren) next.add(a.nodeId);
  }
  const index = build(next).findIndex((r) => r.nodeId === target.nodeId);
  return index >= 0 ? { expanded: next, index } : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/searchCursor.test.ts`
Expected: PASS

- [ ] **Step 5: Expose `select` from useScroll and `select`/`openAt` from useListDetail**

In `src/render/ink/scroll.ts`, inside `useScroll`, add before the `return`:

```ts
  // Jump the cursor to an absolute index (used when the `/` filter closes).
  // No clamp here: callers may pass an index valid only after a pending rows
  // rebuild; the render-time clampIndex above corrects any overshoot.
  const select = (i: number) => setSelected(Math.max(0, i));
```

and change the return to:

```ts
  return { selected: sel, start, end, moveUp, moveDown, select };
```

In `src/render/ink/listDetail.ts`, inside `useListDetail`, destructure the new function and add `openAt`:

```ts
  const { selected, start, end, moveUp, moveDown, select } = useScroll(rowCount, height, resetKey);
```

add before the `return`:

```ts
  // Jump the cursor and open the detail pane in one step (search-Enter).
  const openAt = (i: number) => {
    select(i);
    setDetail(true);
  };
```

and change the return to:

```ts
  return { detail, selected, start, end, onInput, select, openAt };
```

- [ ] **Step 6: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/render/ink/searchCursor.ts src/render/ink/scroll.ts src/render/ink/listDetail.ts test/searchCursor.test.ts
git commit -m "feat: searchCursor close-mapping + select/openAt on scroll and listDetail"
```

---

### Task 4: App key gating + GlobalView wiring (tab 3)

**Files:**
- Modify: `src/render/ink/App.tsx`
- Modify: `src/render/ink/GlobalView.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1–3.
- Produces (relied on by Tasks 5–6): every view gets a new optional prop `onSearchActive?: (active: boolean) => void`; App owns `searchActive` state and suspends its global key handler with `{ isActive: !searchActive }`. App passes `onSearchActive={setSearchActive}` to ALL four view instances (FoldersView, both RankedViews, GlobalView) in this task — Tasks 5–6 implement the views' ends.

- [ ] **Step 1: Gate App's global keys**

In `src/render/ink/App.tsx`:

Add state next to `filtering`:

```tsx
  const [searchActive, setSearchActive] = useState(false);
```

Change the first `useInput` (the one handling `q`/`f`/tabs) to pass an options object:

```tsx
  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    if (!filtering && input === 'f') {
      setCursor((c) => clampIndex(c, chipList.length));
      setFiltering(true);
      return;
    }
    const t = tabForKey(input);
    if (t) setTab(t);
    if (key.tab) setTab((cur) => nextTab(cur, key.shift ? -1 : 1));
  }, { isActive: !searchActive });
```

Add `onSearchActive={setSearchActive}` to all four view elements in the JSX (`FoldersView`, both `RankedView`s, `GlobalView`).

- [ ] **Step 2: Wire GlobalView**

Replace `src/render/ink/GlobalView.tsx`'s body as follows.

New imports:

```tsx
import { filterItemRows, allItemGroupIds, itemMatchCount, searchAction } from './liveFilter.js';
import { useLiveFilter } from './useLiveFilter.js';
import { cursorAfterEscape, revealTarget } from './searchCursor.js';
import { clampIndex } from './scroll.js';
```

New prop in the signature:

```tsx
export function GlobalView({
  inv,
  inputActive = true,
  onControls,
  onSort,
  onSearchActive,
  yankJson,
}: {
  inv: Inventory;
  inputActive?: boolean;
  onControls?: (text: string) => void;
  onSort?: (label: string) => void;
  /** Report the `/` box's open state up so App suspends its global keys. */
  onSearchActive?: (active: boolean) => void;
  /** Builds the full agent-handoff JSON for `Y` yank, from the raw inventory. */
  yankJson?: (row: ItemRow) => string | undefined;
}) {
```

Row derivation — replace

```tsx
  const base = useMemo(() => groupedRows(inv.global, emptyBucket(), expanded), [inv.global, expanded]);
  const rows = sort.apply(base);
  const size = useWindowSize();
  const height = Math.max(3, size.rows - CHROME - SCREEN_RESERVE);
```

with

```tsx
  const search = useLiveFilter();
  const base = useMemo(() => groupedRows(inv.global, emptyBucket(), expanded), [inv.global, expanded]);
  const fullRows = sort.apply(base);
  // Fully-expanded base while a query is live, so children of collapsed groups are findable.
  const searching = search.open && search.query.length > 0;
  const expandedAll = searching
    ? sort.apply(groupedRows(inv.global, emptyBucket(), allItemGroupIds(base)))
    : fullRows;
  const rows = searching ? filterItemRows(expandedAll, search.query) : fullRows;
  const size = useWindowSize();
  const height = Math.max(3, size.rows - CHROME - (search.open ? 1 : 0) - SCREEN_RESERVE);
```

Destructure the new hook API:

```tsx
  const { detail, selected, start, end, onInput, select, openAt } = useListDetail(rows.length, height, sort.index);
```

Report search-active and snap the cursor to the first match on query changes (add with the other `useEffect`s):

```tsx
  useEffect(() => {
    onSearchActive?.(search.open);
    return () => onSearchActive?.(false);
  }, [search.open, onSearchActive]);
  useEffect(() => {
    if (search.open) select(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.query]);
```

Footer — change the assignment to:

```tsx
  const footer = search.open
    ? 'type to filter · ↑/↓ move · Enter open · Esc clear'
    : detail
      ? (yank.toast ? `✓ ${yank.toast} · ` : '') + 'y agent cmd · Y json · Esc/← back · 1/2/3/4 or Tab switch · q quit'
      : '↑/↓ move · Enter expand/detail · s sort · / filter · 1/2/3/4 or Tab switch · q quit';
```

Input handler — insert at the TOP of the `useInput` callback (before the sort handling):

```tsx
    if (search.open) {
      const a = searchAction(input, key);
      if (a.type === 'up' || a.type === 'down') {
        onInput(input, key); // arrows map to the normal list moves
        return;
      }
      if (a.type === 'escape') {
        const idx = cursorAfterEscape(fullRows, rows, selected);
        search.clear();
        select(idx);
        return;
      }
      if (a.type === 'enter') {
        const target = rows[clampIndex(selected, rows.length)];
        const r = revealTarget(
          (exp) => sort.apply(groupedRows(inv.global, emptyBucket(), exp)),
          expanded,
          rows,
          selected,
        );
        // Zero matches: Enter is a no-op and the box stays open (spec).
        if (!r) return;
        search.clear();
        setExpanded(r.expanded);
        // Headers and record-less synthetic rows just take the cursor; leaves open detail.
        if (target?.expandState === undefined && target?.record) openAt(r.index);
        else select(r.index);
        return;
      }
      search.edit(a);
      return;
    }
    if (input === '/' && !detail) {
      search.start();
      return;
    }
```

Table rendering — replace the empty/table block with:

```tsx
      {rows.length === 0 && !search.open ? (
        <Text dimColor>no global items</Text>
      ) : (
        <ItemTable
          rows={rows.slice(start, end)}
          width={size.columns}
          selectedIndex={selected - start}
          search={search.open ? { query: search.query, count: itemMatchCount(rows, expandedAll) } : undefined}
        />
      )}
```

- [ ] **Step 3: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: clean. (App passes `onSearchActive` to FoldersView/RankedView before they declare the prop — if `tsc` errors on unknown props there, add the prop declaration `onSearchActive?: (active: boolean) => void;` to those two components' prop types now, unused, and note that Tasks 5–6 wire them.)

- [ ] **Step 4: Smoke-check in the demo TUI**

Run the verify skill's tmux recipe against `--demo` (see Task 7 for the full checklist), or minimally:
press `3`, then `/`, type a fragment that exists in the demo data, confirm rows narrow and the count updates; Esc restores; Enter on a match opens its detail; `q` while typing must insert "q", not quit.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/App.tsx src/render/ink/GlobalView.tsx src/render/ink/FoldersView.tsx src/render/ink/RankedView.tsx
git commit -m "feat: / live filter on the User Scope tab + app-level key gating"
```

(Include FoldersView/RankedView only if Step 3 required the prop stubs.)

---

### Task 5: RankedView wiring (tabs 2 + 4)

**Files:**
- Modify: `src/render/ink/RankedView.tsx`

**Interfaces:**
- Consumes: Tasks 1–4 (including the `onSearchActive` prop App already passes).
- Produces: tabs 2 and 4 fully filterable; no new exports.

- [ ] **Step 1: Wire RankedView**

In `src/render/ink/RankedView.tsx`:

New imports:

```tsx
import { filterItemRows, allItemGroupIds, itemMatchCount, searchAction } from './liveFilter.js';
import { useLiveFilter } from './useLiveFilter.js';
import { cursorAfterEscape, revealTarget } from './searchCursor.js';
import { clampIndex } from './scroll.js';
```

Add the prop (after `onSort` in both the destructuring and the type):

```tsx
  onSearchActive,
```
```tsx
  /** Report the `/` box's open state up so App suspends its global keys. */
  onSearchActive?: (active: boolean) => void;
```

Row derivation — replace

```tsx
  const chrome = HEADER_BOX_HEIGHT + FILTER_BAR_HEIGHT + TABLE_CHROME + 1 + (showStats ? STATS_BAND_LINES : 0);
  const height = Math.max(3, size.rows - chrome - SCREEN_RESERVE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sort = useItemSort(sortModes);
  const grouped = sort.apply(groupBySource(rows, expanded));
  const { detail, selected, start, end, onInput } = useListDetail(grouped.length, height, sort.index);
```

with

```tsx
  const search = useLiveFilter();
  const chrome =
    HEADER_BOX_HEIGHT + FILTER_BAR_HEIGHT + TABLE_CHROME + 1 + (showStats ? STATS_BAND_LINES : 0) + (search.open ? 1 : 0);
  const height = Math.max(3, size.rows - chrome - SCREEN_RESERVE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sort = useItemSort(sortModes);
  const userGrouped = sort.apply(groupBySource(rows, expanded));
  const searching = search.open && search.query.length > 0;
  const expandedAll = searching ? sort.apply(groupBySource(rows, allItemGroupIds(userGrouped))) : userGrouped;
  const grouped = searching ? filterItemRows(expandedAll, search.query) : userGrouped;
  const { detail, selected, start, end, onInput, select, openAt } = useListDetail(grouped.length, height, sort.index);
```

Add the effects (next to the existing `onSort` effect):

```tsx
  useEffect(() => {
    onSearchActive?.(search.open);
    return () => onSearchActive?.(false);
  }, [search.open, onSearchActive]);
  useEffect(() => {
    if (search.open) select(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.query]);
```

Footer — change the assignment to:

```tsx
  const footer = search.open
    ? 'type to filter · ↑/↓ move · Enter open · Esc clear'
    : detail
      ? (yank.toast ? `✓ ${yank.toast} · ` : '') + 'y agent cmd · Y json · Esc/← back · 1/2/3/4 or Tab switch · q quit'
      : '↑/↓ move · → expand source · Enter detail · s sort · / filter · 1/2/3/4 or Tab · q quit';
```

Input handler — insert at the TOP of the `useInput` callback (before the sort handling):

```tsx
      if (search.open) {
        const a = searchAction(input, key);
        if (a.type === 'up' || a.type === 'down') {
          onInput(input, key);
          return;
        }
        if (a.type === 'escape') {
          const idx = cursorAfterEscape(userGrouped, grouped, selected);
          search.clear();
          select(idx);
          return;
        }
        if (a.type === 'enter') {
          const target = grouped[clampIndex(selected, grouped.length)];
          const r = revealTarget((exp) => sort.apply(groupBySource(rows, exp)), expanded, grouped, selected);
          // Zero matches: Enter is a no-op and the box stays open (spec).
          if (!r) return;
          search.clear();
          setExpanded(r.expanded);
          if (target?.expandState === undefined && target?.record) openAt(r.index);
          else select(r.index);
          return;
        }
        search.edit(a);
        return;
      }
      if (input === '/' && !detail) {
        search.start();
        return;
      }
```

Table rendering — replace the list-mode block:

```tsx
      {grouped.length === 0 && !search.open ? (
        <Text dimColor>nothing to show</Text>
      ) : (
        <ItemTable
          rows={grouped.slice(start, end)}
          variant={variant}
          width={size.columns}
          selectedIndex={selected - start}
          search={search.open ? { query: search.query, count: itemMatchCount(grouped, expandedAll) } : undefined}
        />
      )}
```

- [ ] **Step 2: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 3: Smoke-check tabs 2 and 4 in the demo TUI**

Press `2`, `/`, type; confirm narrowing + count. Same on `4`. Confirm the stats band on 4 stays put and heights don't jitter (the table shrinks by exactly one row while the box is open).

- [ ] **Step 4: Commit**

```bash
git add src/render/ink/RankedView.tsx
git commit -m "feat: / live filter on Project Scope + Leaderboard tabs"
```

---

### Task 6: FoldersView wiring (tab 1 — focused pane)

**Files:**
- Modify: `src/render/ink/FoldersView.tsx`

**Interfaces:**
- Consumes: Tasks 1–4. Key point: ONE `useLiveFilter` instance plus a `searchPane: 'folders' | 'items' | 'globals'` owner record — focus cannot change while the box is open, so one live query at a time is enough (matching the spec's "independent queries" because a query only exists while its box is open).
- Produces: tab 1 fully filterable; no new exports.

- [ ] **Step 1: Wire FoldersView**

In `src/render/ink/FoldersView.tsx`:

New imports:

```tsx
import {
  filterItemRows,
  filterFolderRows,
  allItemGroupIds,
  expandAllFolders,
  itemMatchCount,
  folderMatchCount,
  searchAction,
} from './liveFilter.js';
import { useLiveFilter } from './useLiveFilter.js';
import { cursorAfterEscape, revealTarget, folderCursorAfterEscape, revealFolderTarget } from './searchCursor.js';
```

Add the prop (after `onSort`, both destructuring and type):

```tsx
  onSearchActive,
```
```tsx
  /** Report the `/` box's open state up so App suspends its global keys. */
  onSearchActive?: (active: boolean) => void;
```

State — after the existing `useState` lines:

```tsx
  const search = useLiveFilter();
  // The pane that owns the open box. Focus can't move while the box is open,
  // so a single live query suffices; the pane tag routes keys and rendering.
  const [searchPane, setSearchPane] = useState<'folders' | 'items' | 'globals'>('folders');
  const searching = search.open && search.query.length > 0;
  const paneSearch = (pane: 'folders' | 'items' | 'globals') => search.open && searchPane === pane;
```

Row derivation — after `folderRows` is built, add the folder-pane variants:

```tsx
  const buildFolders = (exp: ReadonlySet<string>) =>
    buildFolderRows(inv.folders, inv.homeRoot, { sort, showHidden, expanded: exp });
  const fullFolderRows = searching && searchPane === 'folders' ? expandAllFolders(buildFolders) : folderRows;
  const shownFolderRows =
    searching && searchPane === 'folders' ? filterFolderRows(fullFolderRows, search.query, inv.homeRoot) : folderRows;
```

Change `folderIdx`/`sel` to read from the shown list:

```tsx
  const folderIdx = clampIndex(nav.folder, shownFolderRows.length);
  const sel = shownFolderRows[folderIdx];
```

After `rows` and `globalRows` are built, add the item/global search variants:

```tsx
  const buildItems = (exp: Set<string>) =>
    selFolder ? groupedRows(selFolder.projectScoped, selFolder.local, exp) : [];
  const buildGlobals = (exp: Set<string>) => (selFolder ? groupedRows(inv.global, emptyBucket(), exp) : []);
  const itemsAll = searching && searchPane === 'items' ? buildItems(new Set(allItemGroupIds(rows))) : rows;
  const shownRows = searching && searchPane === 'items' ? filterItemRows(itemsAll, search.query) : rows;
  const globalsAll = searching && searchPane === 'globals' ? buildGlobals(new Set(allItemGroupIds(globalRows))) : globalRows;
  const shownGlobalRows = searching && searchPane === 'globals' ? filterItemRows(globalsAll, search.query) : globalRows;
```

Replace every later use of `folderRows` with `shownFolderRows`, `rows` with `shownRows`, and `globalRows` with `shownGlobalRows` in: the window/clamp computations (`itemIdx`, `gItemIdx`, `fWin`, `pWin`, `gWin`), `projectHasTable`, `globalsShown`, the `folderNav` context object, the `detailList` assignment, and the JSX (`FolderList rows=…`, both `ItemTable rows=…`, both `Position` totals, and the `useEffect` that consumes `pendingFolder`). The height budgets subtract one line for the searched pane:

```tsx
  const listHeight = Math.max(3, rightBudget - TABLE_COST - (paneSearch('folders') ? 1 : 0));
```

and for the two item windows:

```tsx
  const pWin = scrollWindow(shownRows.length, Math.max(1, pVisible - (paneSearch('items') ? 1 : 0)), itemIdx);
  const gWin = scrollWindow(shownGlobalRows.length, Math.max(1, gVisible - (paneSearch('globals') ? 1 : 0)), gItemIdx);
```

The globals section must stay visible while its pane is being searched even with zero matches (spec: the box stays visible with "no matches"):

```tsx
  const globalsShown = !!selFolder && (shownGlobalRows.length > 0 || paneSearch('globals'));
```

Effects — add:

```tsx
  useEffect(() => {
    onSearchActive?.(search.open);
    return () => onSearchActive?.(false);
  }, [search.open, onSearchActive]);
  useEffect(() => {
    if (!search.open) return;
    if (searchPane === 'folders') setNav((s) => ({ ...s, folder: 0 }));
    else if (searchPane === 'items') setNav((s) => ({ ...s, item: 0 }));
    else setNav((s) => ({ ...s, globalItem: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.query]);
```

Input handler — insert at the TOP of the `useInput` callback:

```tsx
    if (search.open) {
      const a = searchAction(input, key);
      if (a.type === 'up' || a.type === 'down') {
        const d = a.type === 'down' ? 1 : -1;
        if (searchPane === 'folders') setNav((s) => ({ ...s, folder: clampIndex(s.folder + d, shownFolderRows.length) }));
        else if (searchPane === 'items') setNav((s) => ({ ...s, item: clampIndex(s.item + d, shownRows.length) }));
        else setNav((s) => ({ ...s, globalItem: clampIndex(Math.max(0, s.globalItem) + d, shownGlobalRows.length) }));
        return;
      }
      if (a.type === 'escape') {
        if (searchPane === 'folders') {
          const idx = folderCursorAfterEscape(folderRows, shownFolderRows, folderIdx);
          search.clear();
          setNav((s) => ({ ...s, folder: idx }));
        } else if (searchPane === 'items') {
          const idx = cursorAfterEscape(rows, shownRows, itemIdx);
          search.clear();
          setNav((s) => ({ ...s, item: idx }));
        } else {
          const idx = cursorAfterEscape(globalRows, shownGlobalRows, gItemIdx);
          search.clear();
          setNav((s) => ({ ...s, globalItem: idx }));
        }
        return;
      }
      if (a.type === 'enter') {
        if (searchPane === 'folders') {
          const target = shownFolderRows[folderIdx];
          const r = revealFolderTarget(buildFolders, nav.folderExpanded, shownFolderRows, folderIdx);
          // Zero matches: Enter is a no-op and the box stays open (spec).
          if (!r) return;
          search.clear();
          // Select the revealed folder; a real project with items also opens
          // its table (same as a plain Enter on a folder row today).
          const openItems = !!target?.folder && (target?.count ?? 0) > 0;
          setNav((s) => ({
            ...s,
            folderExpanded: r.expanded,
            folder: r.index,
            ...(openItems ? { focus: 'items' as const, item: 0 } : {}),
          }));
        } else if (searchPane === 'items') {
          const target = shownRows[itemIdx];
          const r = revealTarget(buildItems, nav.expanded, shownRows, itemIdx);
          // Zero matches: Enter is a no-op and the box stays open (spec).
          if (!r) return;
          search.clear();
          const openDetail = target?.expandState === undefined && !!target?.record;
          setNav((s) => ({
            ...s,
            expanded: r.expanded,
            item: r.index,
            ...(openDetail ? { focus: 'detail' as const, detailItem: r.index, detailFrom: 'items' as const } : {}),
          }));
        } else {
          const target = shownGlobalRows[gItemIdx];
          const r = revealTarget(buildGlobals, nav.globalExpanded, shownGlobalRows, gItemIdx);
          // Zero matches: Enter is a no-op and the box stays open (spec).
          if (!r) return;
          search.clear();
          const openDetail = target?.expandState === undefined && !!target?.record;
          setNav((s) => ({
            ...s,
            globalExpanded: r.expanded,
            globalItem: r.index,
            ...(openDetail ? { focus: 'detail' as const, detailItem: r.index, detailFrom: 'globals' as const } : {}),
          }));
        }
        return;
      }
      search.edit(a);
      return;
    }
    if (input === '/' && nav.focus !== 'detail') {
      const pane = nav.focus === 'folders' ? 'folders' : nav.focus === 'items' ? 'items' : 'globals';
      setSearchPane(pane);
      search.start();
      // Searching the globals section implies looking at its rows: open it and
      // move off the header so ↑/↓ and Enter act on rows immediately.
      if (pane === 'globals') setNav((s) => ({ ...s, globalsOpen: true, globalItem: Math.max(0, s.globalItem) }));
      return;
    }
```

Footer — prepend a search branch to the existing chain:

```tsx
  const footer = search.open
    ? 'type to filter · ↑/↓ move · Enter open · Esc clear'
    : nav.focus === 'folders'
      ? `hidden: ${showHidden ? 'on' : 'off'} · ↑/↓ move · →/Enter open · ← collapse · . hidden · / filter · q quit`
      : nav.focus === 'items'
        ? '↑/↓ move · → expand/open · ← back · Enter open · ↓ globals · / filter · Esc folders · q quit'
        : nav.focus === 'globals'
          ? globalsFooter
          : (yank.toast ? `✓ ${yank.toast} · ` : '') + 'y agent cmd · Y json · Esc/← back · 1/2/3/4 or Tab switch · q quit';
```

JSX — pass the search line to the pane that owns it:

```tsx
        <FolderList
          rows={shownFolderRows.slice(fWin.start, fWin.end)}
          selected={folderIdx - fWin.start}
          dimmed={nav.focus !== 'folders'}
          width={FOLDER_W}
          search={paneSearch('folders') ? { query: search.query, count: folderMatchCount(shownFolderRows, fullFolderRows, search.query, inv.homeRoot) } : undefined}
        />
```

project items table:

```tsx
                  <ItemTable
                    rows={shownRows.slice(pWin.start, pWin.end)}
                    width={tableW}
                    selectedIndex={nav.focus === 'items' ? itemIdx - pWin.start : undefined}
                    search={paneSearch('items') ? { query: search.query, count: itemMatchCount(shownRows, itemsAll) } : undefined}
                  />
```

globals table:

```tsx
                      <ItemTable
                        rows={shownGlobalRows.slice(gWin.start, gWin.end)}
                        width={tableW}
                        selectedIndex={nav.focus === 'globals' && nav.globalItem >= 0 ? gItemIdx - gWin.start : undefined}
                        search={paneSearch('globals') ? { query: search.query, count: itemMatchCount(shownGlobalRows, globalsAll) } : undefined}
                      />
```

Also: the `rows.length === 0` empty-state branch in the JSX (`no project-scoped items…`) must render the ItemTable instead when `paneSearch('items')` is true (so the box + "no matches" show):

```tsx
              {shownRows.length === 0 && !paneSearch('items') ? (
                <Text dimColor>
                  {globalsShown
                    ? 'no project-scoped items — inherited globals below'
                    : 'global only — adds nothing beyond the inherited layer'}
                </Text>
              ) : (
```

- [ ] **Step 2: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: clean. `folderNav.test.ts` must still pass untouched — the reducer is not modified, only bypassed while the box is open.

- [ ] **Step 3: Smoke-check tab 1 in the demo TUI**

- Folder column: `/`, type a folder fragment — tree narrows, ancestors stay, count updates; Enter selects (and opens items when the folder has any); Esc restores with a sane cursor.
- Items pane: focus a folder's table (`→`), `/`, type; Enter opens detail; closing detail lands on that row.
- Globals pane: from the globals header, `/` opens the table and filters it.

- [ ] **Step 4: Commit**

```bash
git add src/render/ink/FoldersView.tsx
git commit -m "feat: / live filter on the Folders tab - focused-pane scope"
```

---

### Task 7: End-to-end verification + docs

**Files:**
- Modify: `README.md:33`

**Interfaces:** none — verification and docs only.

- [ ] **Step 1: Update the README key line**

In `README.md` line 33, change:

```
The default is a live dashboard: arrow keys or `j`/`k` to move between folders, `q` to quit. It re-renders as your config changes, so you can edit a `.mcp.json` in another window and watch it update.
```

to:

```
The default is a live dashboard: arrow keys or `j`/`k` to move between folders, `/` to filter the focused list as you type (Enter opens the selected match, Esc clears), `q` to quit. It re-renders as your config changes, so you can edit a `.mcp.json` in another window and watch it update.
```

- [ ] **Step 2: Full gate**

Run: `npm run typecheck && npm test && npm run build`
Expected: all clean.

- [ ] **Step 3: Drive the TUI end-to-end**

Invoke the project's `verify` skill (Skill tool: `verify`) — it builds and drives the TUI in tmux against the safe `--demo` dataset. Walk this checklist on top of its recipe:

1. Tab 3: `/` → box appears inside the table under the header rule; type → rows narrow live, count reads `n/m`; `q`,`f`,`1`,`s` appear as query text; Tab does nothing.
2. Tab 3: Esc → full list back, cursor sane. `/` + query with 0 hits → "no matches"; Enter does nothing; Esc recovers.
3. Tab 3: query that hits a collapsed group's child → header shows expanded with only hits; Enter on the child → detail opens; Esc from detail → cursor on that row, group now expanded.
4. Tab 2 and Tab 4: same basic narrow/Enter/Esc pass; stats band (tab 4) intact.
5. Tab 1 folder column: narrow to a worktree checkout → repo + worktrees ancestors stay; Enter → folder selected, items open when non-empty.
6. Tab 1 items + globals panes per Task 6 Step 3.
7. Chip filter `f` still works after all of the above, and composes (chips first, then `/`).
8. `q` outside the box still quits from every tab.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README mention of the / live filter"
```

---

## Plan Self-Review (completed)

- **Spec coverage:** interaction model → Tasks 2/4–6; scope per tab → 4 (tab 3), 5 (tabs 2+4), 6 (tab 1); match fields → 1; group behaviour → 1 (filterItemRows/filterFolderRows) + 4–6 (fully-expanded bases); Esc/Enter cursor mapping → 3 + view wiring; composition with chips → untouched Inventory path (verified in Task 7 checklist); app-key suspension → 4; per-view reset lifetime → per-view state, views unmount on tab switch; heights → each wiring task; testing section → Tasks 1–3 unit tests + Task 7 tmux pass.
- **Type consistency:** `searchAction`/`SearchAction`/`SearchKey` (Task 2) consumed verbatim in 4–6; `revealTarget`/`cursorAfterEscape` signatures (Task 3) match all call sites; `select`/`openAt` produced in 3, consumed in 4–5; `search` prop shape `{ query, count }` identical in ItemTable/FolderList and all callers.
- **Note for implementers:** groups keep their original `(N)` child count in the NAME cell while filtered — only the row set narrows; don't "fix" the count to the hit count.
