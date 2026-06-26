# Visual Identity & Iconography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of the 6 detected runtimes a colored letter badge and surface those badges across the dashboard, plus a used-count sort key on the Global list and a clickable origin URL in detail.

**Architecture:** A single pure module (`runtimeMark.ts`) owns the runtime→mark mapping; one presentational component (`Badges.tsx`) renders a packed badge strip; everything else wires those into existing Ink views. Pure data lives in `rows.ts`/`tree.ts` (unit-tested); components are validated by typecheck + build + a final manual smoke (repo convention — no component tests).

**Tech Stack:** TypeScript (ESM), React 19, Ink 7, Vitest, tsup. One new dependency: `terminal-link@5`.

## Global Constraints

- **Presentation-layer only.** No change to `src/index.ts`, adapters, resolver, `discovery.ts`, `filter.ts`, `plain.ts`, `json.ts`, or `src/types.ts`. All edits live under `src/render/ink/*` (+ tests + `package.json` for the one dep).
- **Bounded to 6 detected runtimes:** `claude-code, codex, hermes-agent, gemini-cli, cursor, opencode`. Marks are `usedBy ∩ these six`.
- **Single-cell marks only** — no emoji (width-2 breaks columns).
- **One source of truth** for the runtime→mark mapping: `src/render/ink/runtimeMark.ts`.
- **Letters (forced apart):** `C` claude-code, `X` codex, `H` hermes-agent, `G` gemini-cli, `U` cursor, `O` opencode. **`DETECTED_ORDER`** (strip/badge order) = `['claude-code','codex','hermes-agent','gemini-cli','cursor','opencode']`.
- **`USED` count stays `usedBy.length`** (registry reach); badges show only the installed subset; detail shows the gap as a dim `+N`.
- TDD for pure modules (`runtimeMark`, `rows`, `tree`). Commit after every task. Run `npm test` (vitest), `npm run typecheck`, `npm run build` as gates.

---

### Task 1: `runtimeMark.ts` — pure mark mapping

**Files:**
- Create: `src/render/ink/runtimeMark.ts`
- Test: `test/runtimeMark.test.ts`

**Interfaces:**
- Consumes: `Runtime` from `../../types.js`.
- Produces:
  - `interface RuntimeMark { id: Runtime; letter: string; bg: string; fg: 'black' | 'white' }`
  - `runtimeMark(id: Runtime): RuntimeMark | undefined`
  - `marksFor(usedBy: readonly Runtime[]): RuntimeMark[]` — intersect with the six, dedupe, sort by `DETECTED_ORDER`.
  - `otherCount(usedBy: readonly Runtime[]): number` — count of ids NOT in the six.

- [ ] **Step 1: Write the failing test**

Create `test/runtimeMark.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runtimeMark, marksFor, otherCount, type RuntimeMark } from '../src/render/ink/runtimeMark.js';

describe('runtimeMark', () => {
  it('returns the mark for each of the six detected runtimes', () => {
    expect(runtimeMark('claude-code')).toEqual({ id: 'claude-code', letter: 'C', bg: '#D97757', fg: 'black' });
    expect(runtimeMark('codex')).toEqual({ id: 'codex', letter: 'X', bg: '#10A37F', fg: 'white' });
    expect(runtimeMark('hermes-agent')).toEqual({ id: 'hermes-agent', letter: 'H', bg: '#06B6D4', fg: 'black' });
    expect(runtimeMark('gemini-cli')).toEqual({ id: 'gemini-cli', letter: 'G', bg: '#4285F4', fg: 'white' });
    expect(runtimeMark('cursor')).toEqual({ id: 'cursor', letter: 'U', bg: '#C678DD', fg: 'black' });
    expect(runtimeMark('opencode')).toEqual({ id: 'opencode', letter: 'O', bg: '#EF4444', fg: 'white' });
  });

  it('returns undefined for non-detected runtimes', () => {
    expect(runtimeMark('amp')).toBeUndefined();
    expect(runtimeMark('zed')).toBeUndefined();
  });
});

describe('marksFor', () => {
  it('keeps only detected runtimes, in DETECTED_ORDER regardless of input order', () => {
    const marks = marksFor(['cursor', 'opencode', 'claude-code', 'amp', 'codex']);
    expect(marks.map((m: RuntimeMark) => m.letter)).toEqual(['C', 'X', 'U', 'O']);
  });

  it('dedupes repeated ids and drops non-detected', () => {
    expect(marksFor(['codex', 'codex', 'zed']).map((m) => m.id)).toEqual(['codex']);
  });

  it('returns [] for an empty or all-undetected list', () => {
    expect(marksFor([])).toEqual([]);
    expect(marksFor(['amp', 'warp'])).toEqual([]);
  });
});

describe('otherCount', () => {
  it('counts only the non-detected runtimes', () => {
    expect(otherCount(['claude-code', 'amp', 'zed', 'warp'])).toBe(3);
    expect(otherCount(['claude-code', 'codex'])).toBe(0);
    expect(otherCount([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/runtimeMark.test.ts`
Expected: FAIL — `Failed to resolve import "../src/render/ink/runtimeMark.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/render/ink/runtimeMark.ts`:

```ts
/**
 * The single source of truth for runtime → visual mark. Pure data + functions,
 * no React — so tests never need Ink. Bounded to the 6 detected ("deep") runtimes;
 * everything else has no mark (callers render a neutral dim '·' / nothing).
 *
 * Letters are forced apart because claude-code / codex / cursor all start with "C";
 * color carries identity, the letter is the no-color / colorblind tiebreak. `fg` is
 * picked per-hue for contrast against the badge background.
 */
import type { Runtime } from '../../types.js';

export interface RuntimeMark {
  id: Runtime;
  /** Single ASCII cell. */
  letter: string;
  /** Badge background hue (hex; chalk degrades on lesser terminals). */
  bg: string;
  /** Letter color, chosen for contrast against `bg`. */
  fg: 'black' | 'white';
}

/** Canonical strip/badge order — mirrors DEEP_RUNTIMES so badges read like the filter chips. */
const MARKS: RuntimeMark[] = [
  { id: 'claude-code', letter: 'C', bg: '#D97757', fg: 'black' },
  { id: 'codex', letter: 'X', bg: '#10A37F', fg: 'white' },
  { id: 'hermes-agent', letter: 'H', bg: '#06B6D4', fg: 'black' },
  { id: 'gemini-cli', letter: 'G', bg: '#4285F4', fg: 'white' },
  { id: 'cursor', letter: 'U', bg: '#C678DD', fg: 'black' },
  { id: 'opencode', letter: 'O', bg: '#EF4444', fg: 'white' },
];

const BY_ID = new Map(MARKS.map((m) => [m.id, m]));
const ORDER = new Map(MARKS.map((m, i) => [m.id, i]));

export function runtimeMark(id: Runtime): RuntimeMark | undefined {
  return BY_ID.get(id);
}

/** usedBy ∩ detected six, deduped, in DETECTED_ORDER. */
export function marksFor(usedBy: readonly Runtime[]): RuntimeMark[] {
  const seen = new Set<Runtime>();
  const out: RuntimeMark[] = [];
  for (const id of usedBy) {
    const m = BY_ID.get(id);
    if (m && !seen.has(id)) {
      seen.add(id);
      out.push(m);
    }
  }
  return out.sort((a, b) => ORDER.get(a.id)! - ORDER.get(b.id)!);
}

/** How many usedBy runtimes fall outside the six (the dim "+N" remainder in detail). */
export function otherCount(usedBy: readonly Runtime[]): number {
  return usedBy.filter((id) => !BY_ID.has(id)).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/runtimeMark.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/runtimeMark.ts test/runtimeMark.test.ts
git commit -m "Add runtimeMark.ts: pure runtime→badge mapping (D1)"
```

---

### Task 2: `rows.ts` — `usedRuntimes` field + `sortItemRows`

**Files:**
- Modify: `src/render/ink/rows.ts`
- Test: `test/rows.test.ts`

**Interfaces:**
- Consumes: `Runtime` from `../../types.js`.
- Produces:
  - `ItemRow.usedRuntimes?: Runtime[]` — a skill's `usedBy`, or a plugin/mcp's single declaring `runtime` (`[]` when absent).
  - `type ItemSort = 'used' | 'name'`
  - `sortItemRows(rows: ItemRow[], mode: ItemSort): ItemRow[]` — new array; `used` desc (null last) then name; `name` localeCompare.

- [ ] **Step 1: Write the failing tests**

Edit `test/rows.test.ts`. First, **update the 5 existing `toEqual` blocks** to include the new `usedRuntimes` key (adding a required-shape key the implementation now emits):

In the `'maps a shared-store skill...'` test, change the expected object to:
```ts
      { kind: 'skill', name: 'systematic-debugging', used: 2, source: 'obra/superpowers', sourceDim: false, record: s, usedRuntimes: ['cc', 'codex'] },
```
In `'maps a skill with no usedBy...'`:
```ts
      { kind: 'skill', name: 'local-thing', used: 0, source: 'project-local', sourceDim: true, record: s, usedRuntimes: [] },
```
In `'maps a plugin to used:null...'`:
```ts
      { kind: 'plugin', name: 'chrome-devtools', used: null, source: 'anthropics/claude-code', sourceDim: false, record: p, usedRuntimes: [] },
```
In `'falls back to dim marketplace name...'`:
```ts
      { kind: 'plugin', name: 'local-plugin', used: null, source: 'official', sourceDim: true, record: p, usedRuntimes: [] },
```
In `'maps an mcp server to used:null...'`:
```ts
      { kind: 'mcp', name: 'linear', used: null, source: 'http', sourceDim: true, record: m, usedRuntimes: [] },
```

Then **add** these new tests at the end of the file (before the final `});` of the `describe('itemRows', …)` block, add the `usedRuntimes` cases; after that block, add a new `describe` for sorting). Insert before the closing `});` of `describe('itemRows', …)`:

```ts
  it('sets usedRuntimes from a skill usedBy list', () => {
    const s = skill('x', ['claude-code', 'codex']);
    expect(itemRows({ ...emptyBucket(), skills: [s] })[0]!.usedRuntimes).toEqual(['claude-code', 'codex']);
  });

  it('sets usedRuntimes to the single declaring runtime for a plugin', () => {
    const p = { ...plugin('p', 'o/r'), runtime: 'claude-code' as const };
    expect(itemRows({ ...emptyBucket(), plugins: [p] })[0]!.usedRuntimes).toEqual(['claude-code']);
  });

  it('sets usedRuntimes to the single declaring runtime for an mcp server', () => {
    const m = { ...mcp('m', 'stdio' as const), runtime: 'codex' as const };
    expect(itemRows({ ...emptyBucket(), mcp: [m] })[0]!.usedRuntimes).toEqual(['codex']);
  });

  it('sets usedRuntimes to [] for a plugin/mcp with no declaring runtime', () => {
    expect(itemRows({ ...emptyBucket(), plugins: [plugin('p')] })[0]!.usedRuntimes).toEqual([]);
    expect(itemRows({ ...emptyBucket(), mcp: [mcp('m', 'stdio')] })[0]!.usedRuntimes).toEqual([]);
  });
```

Add this new top-level `describe` at the end of the file (after the `describe('itemRows', …)` block), plus extend the imports on line 2:

```ts
// line 2 becomes:
import { itemRows, sortItemRows, type ItemRow } from '../src/render/ink/rows.js';
```

```ts
describe('sortItemRows', () => {
  const r = (name: string, used: number | null): ItemRow => ({
    kind: 'skill', name, used, source: null, sourceDim: false, usedRuntimes: [],
  });

  it('used: descending, null last, ties broken by name asc', () => {
    const rows = [r('b', 3), r('a', 3), r('z', null), r('m', 5)];
    expect(sortItemRows(rows, 'used').map((x) => x.name)).toEqual(['m', 'a', 'b', 'z']);
  });

  it('name: alphabetical asc', () => {
    const rows = [r('b', 3), r('a', 9), r('c', 1)];
    expect(sortItemRows(rows, 'name').map((x) => x.name)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const rows = [r('b', 1), r('a', 2)];
    sortItemRows(rows, 'used');
    expect(rows.map((x) => x.name)).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/rows.test.ts`
Expected: FAIL — `sortItemRows` is not exported, and the existing `toEqual` blocks fail because the implementation does not yet emit `usedRuntimes`.

- [ ] **Step 3: Write the implementation**

Edit `src/render/ink/rows.ts`. Change the import on line 1 and the `ItemRow` interface, the three row builders, and append `sortItemRows`:

```ts
import type { Bucket, SkillRecord, PluginRecord, McpRecord, Runtime } from '../../types.js';
```

Add to the `ItemRow` interface (after the `sourceDim` field):

```ts
  /** Runtimes to badge: a skill's usedBy, or a plugin/mcp's single declaring runtime. Absent on synthetic group headers. */
  usedRuntimes?: Runtime[];
```

Update the three builders:

```ts
function skillRow(s: SkillRecord): ItemRow {
  return {
    kind: 'skill',
    name: s.name,
    used: s.usedBy.length,
    source: s.provider.source ?? s.provider.kind,
    sourceDim: !s.provider.source,
    record: s,
    usedRuntimes: s.usedBy,
  };
}

function pluginRow(p: PluginRecord): ItemRow {
  return {
    kind: 'plugin',
    name: p.name,
    used: null,
    source: p.marketplaceRepo ?? p.marketplace,
    sourceDim: !p.marketplaceRepo,
    record: p,
    usedRuntimes: p.runtime ? [p.runtime] : [],
  };
}

function mcpRow(m: McpRecord): ItemRow {
  return {
    kind: 'mcp',
    name: m.name,
    used: null,
    source: m.transport.kind,
    sourceDim: true,
    record: m,
    usedRuntimes: m.runtime ? [m.runtime] : [],
  };
}
```

Append at the end of the file:

```ts
export type ItemSort = 'used' | 'name';

/** Sort a copy of `rows`: `used` desc (null last) then name; `name` alphabetical. */
export function sortItemRows(rows: ItemRow[], mode: ItemSort): ItemRow[] {
  const byName = (a: ItemRow, b: ItemRow) => a.name.localeCompare(b.name);
  if (mode === 'name') return [...rows].sort(byName);
  return [...rows].sort((a, b) => (b.used ?? -1) - (a.used ?? -1) || byName(a, b));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/rows.test.ts`
Expected: PASS (updated + new tests).

- [ ] **Step 5: Run the full suite + typecheck (guard against ripple)**

Run: `npm test && npm run typecheck`
Expected: PASS. (Confirms `grouping.ts`'s synthetic header — which omits the now-optional `usedRuntimes` — still typechecks, and no other consumer broke.)

- [ ] **Step 6: Commit**

```bash
git add src/render/ink/rows.ts test/rows.test.ts
git commit -m "Add ItemRow.usedRuntimes + sortItemRows (D1 + C3)"
```

---

### Task 3: `tree.ts` — `FolderRow.runtimes` subtree aggregation

**Files:**
- Modify: `src/render/ink/tree.ts`
- Test: `test/tree.test.ts`

**Interfaces:**
- Consumes: `Runtime` from `../../types.js`; `FolderReport.runtimes` (existing).
- Produces: `FolderRow.runtimes: Runtime[]` — the union of `folder.runtimes` over the subtree, sorted ascending. (Render intersects with the six via `marksFor`.)

- [ ] **Step 1: Write the failing tests**

Edit `test/tree.test.ts`. Change the `folder()` helper (lines 18–29) to accept runtimes:

```ts
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
```

Add a new `describe` block at the end of the file:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tree.test.ts`
Expected: FAIL — `FolderRow.runtimes` is `undefined` (property does not exist yet).

- [ ] **Step 3: Write the implementation**

Edit `src/render/ink/tree.ts`:

Change the import on line 11:
```ts
import type { FolderReport, Runtime } from '../../types.js';
```

Add to the `FolderRow` interface (after the `count` field):
```ts
  /** Union of `folder.runtimes` over this subtree, sorted asc (render intersects with the six). */
  runtimes: Runtime[];
```

Add to the `TreeNode` interface (after its `count` field):
```ts
  runtimes: Set<Runtime>; // aggregate, filled post-order
```

In `buildTrie`, set `runtimes` on node creation (line ~68):
```ts
        node = { path: acc, segments: [seg], folder: null, children: new Map(), count: 0, runtimes: new Set() };
```

In `compress`, add `runtimes` to the rebuilt node object (the `n = { … }` block, ~line 83):
```ts
      n = {
        path: child.path,
        segments: [...n.segments, ...child.segments],
        folder: child.folder,
        children: child.children,
        count: 0,
        runtimes: new Set(),
      };
```

Replace `aggregate` (lines ~96–102) so it rolls up runtimes alongside count:
```ts
/** Post-order: count = ownDelta(self) + Σ count(children); runtimes = ∪ subtree folder.runtimes. */
function aggregate(node: TreeNode): { count: number; runtimes: Set<Runtime> } {
  let sum = node.folder ? ownDelta(node.folder) : 0;
  const runtimes = new Set<Runtime>(node.folder?.runtimes ?? []);
  for (const c of node.children.values()) {
    const r = aggregate(c);
    sum += r.count;
    for (const id of r.runtimes) runtimes.add(id);
  }
  node.count = sum;
  node.runtimes = runtimes;
  return { count: sum, runtimes };
}
```

In `buildFolderRows`, add `runtimes` to the pushed row object (the `out.push({ … })` block, ~line 131):
```ts
      out.push({
        nodeId: n.path,
        label: labelOf(n),
        depth,
        count: n.count,
        hasChildren,
        collapsed,
        folder: n.folder,
        runtimes: [...n.runtimes].sort(),
      });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tree.test.ts`
Expected: PASS (new aggregation tests + all existing tree tests still green — they read individual fields, not full `FolderRow` objects).

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/tree.ts test/tree.test.ts
git commit -m "Aggregate FolderRow.runtimes over the subtree (D1)"
```

---

### Task 4: `Badges.tsx` — the packed badge strip component

**Files:**
- Create: `src/render/ink/Badges.tsx`

**Interfaces:**
- Consumes: `RuntimeMark` from `./runtimeMark.js`.
- Produces: `Badges({ marks, plus }: { marks: RuntimeMark[]; plus?: number }): JSX.Element | null`.

> Components have no unit tests in this repo (no ink-testing-library). Gate = typecheck + build; visual behavior verified in Task 11.

- [ ] **Step 1: Write the component**

Create `src/render/ink/Badges.tsx`:

```tsx
import { Text } from 'ink';
import type { RuntimeMark } from './runtimeMark.js';

/**
 * A packed strip of reverse-video runtime badges: each mark is a single hue-filled
 * cell with a contrast letter, packed with no separators (color boundaries divide
 * them). An optional dim `+N` trails the strip (the detail "used by" remainder).
 * Renders nothing when there is nothing to show.
 */
export function Badges({ marks, plus }: { marks: RuntimeMark[]; plus?: number }) {
  if (marks.length === 0 && !plus) return null;
  return (
    <Text>
      {marks.map((m, i) => (
        <Text key={i} backgroundColor={m.bg} color={m.fg}>
          {m.letter}
        </Text>
      ))}
      {plus ? <Text dimColor>{marks.length ? ' ' : ''}+{plus}</Text> : null}
    </Text>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS (no type errors; tsup bundles).

- [ ] **Step 3: Commit**

```bash
git add src/render/ink/Badges.tsx
git commit -m "Add Badges.tsx: packed runtime badge strip (D1)"
```

---

### Task 5: `ItemTable.tsx` — `USES` column (`showMarks`) + `dense` mode

**Files:**
- Modify: `src/render/ink/ItemTable.tsx`

**Interfaces:**
- Consumes: `Badges` from `./Badges.js`, `marksFor` from `./runtimeMark.js`, `ItemRow.usedRuntimes`.
- Produces: `ItemTable` now accepts `showMarks?: boolean` (default `false`) and `dense?: boolean` (default `false`). `dense` forces `showKind=false` and drops the SOURCE column so name + USES fit the cramped Folders column.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/render/ink/ItemTable.tsx`:

```tsx
import { Box, Text } from 'ink';
import type { ItemRow } from './rows.js';
import { Badges } from './Badges.js';
import { marksFor } from './runtimeMark.js';

const CURSOR_W = 2;
const KIND_W = 6;
const USED_W = 4;
const USES_W = 6; // max 6 badges, one cell each
const SOURCE_W = 22;

function HeaderRow({
  showKind,
  showMarks,
  showSource,
  withCursor,
}: {
  showKind: boolean;
  showMarks: boolean;
  showSource: boolean;
  withCursor: boolean;
}) {
  return (
    <Box>
      {withCursor ? <Box width={CURSOR_W} /> : null}
      {showKind ? (
        <Box width={KIND_W} marginRight={1}>
          <Text dimColor bold>
            KIND
          </Text>
        </Box>
      ) : null}
      <Box flexGrow={1} marginRight={1}>
        <Text dimColor bold>
          NAME
        </Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor bold>
          USED
        </Text>
      </Box>
      {showMarks ? (
        <Box width={USES_W} marginRight={1}>
          <Text dimColor bold>
            USES
          </Text>
        </Box>
      ) : null}
      {showSource ? (
        <Box width={SOURCE_W}>
          <Text dimColor bold>
            SOURCE
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

function Row({
  row,
  showKind,
  showMarks,
  showSource,
  withCursor,
  active,
}: {
  row: ItemRow;
  showKind: boolean;
  showMarks: boolean;
  showSource: boolean;
  withCursor: boolean;
  active: boolean;
}) {
  const isGroup = row.expandState !== undefined;
  const marker = row.expandState === 'expanded' ? '▾' : row.expandState === 'collapsed' ? '▸' : '';
  const label = isGroup ? `${marker} ${row.name} (${row.used})` : row.depth ? `  ${row.name}` : row.name;
  const used = isGroup ? '' : row.used === null ? '—' : row.used === 0 ? '·' : String(row.used);
  const usedDim = row.used === null || row.used === 0;
  const source = isGroup ? '' : row.source ?? '';
  const marks = showMarks ? marksFor(row.usedRuntimes ?? []) : [];
  return (
    <Box>
      {withCursor ? (
        <Box width={CURSOR_W}>
          <Text color="cyan" bold>
            {active ? '›' : ' '}
          </Text>
        </Box>
      ) : null}
      {showKind ? (
        <Box width={KIND_W} marginRight={1}>
          <Text dimColor>{row.kind}</Text>
        </Box>
      ) : null}
      <Box flexGrow={1} marginRight={1}>
        <Text wrap="truncate-end" inverse={active} bold={active || isGroup}>
          {label}
        </Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor={usedDim}>{used}</Text>
      </Box>
      {showMarks ? (
        <Box width={USES_W} marginRight={1}>
          <Badges marks={marks} />
        </Box>
      ) : null}
      {showSource ? (
        <Box width={SOURCE_W}>
          <Text wrap="truncate-end" dimColor={row.sourceDim}>
            {source}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function ItemTable({
  rows,
  showKind = true,
  showMarks = false,
  dense = false,
  selectedIndex,
}: {
  rows: ItemRow[];
  showKind?: boolean;
  /** Render the USES badge column. */
  showMarks?: boolean;
  /** Cramped Folders column: drop KIND + SOURCE so name + USES fit at 80 cols. */
  dense?: boolean;
  /** Index (within `rows`) of the highlighted row; omit for no cursor (e.g. an unfocused preview). */
  selectedIndex?: number;
}) {
  const withCursor = selectedIndex !== undefined;
  const effShowKind = showKind && !dense;
  const showSource = !dense;
  return (
    <Box flexDirection="column">
      <HeaderRow showKind={effShowKind} showMarks={showMarks} showSource={showSource} withCursor={withCursor} />
      {rows.map((r, i) => (
        <Row
          key={i}
          row={r}
          showKind={effShowKind}
          showMarks={showMarks}
          showSource={showSource}
          withCursor={withCursor}
          active={i === selectedIndex}
        />
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Typecheck + build + existing tests**

Run: `npm run typecheck && npm run build && npm test`
Expected: PASS. Default call sites (no `showMarks`/`dense`) render exactly as before.

- [ ] **Step 3: Commit**

```bash
git add src/render/ink/ItemTable.tsx
git commit -m "ItemTable: add USES badge column + dense mode (D1)"
```

---

### Task 6: Detail view — `used by` badges + clickable origin URL (C4)

**Files:**
- Modify: `src/render/ink/detail.ts`, `src/render/ink/DetailView.tsx`, `package.json`
- Test: `test/detail.test.ts`

**Interfaces:**
- Consumes: `Badges`, `marksFor`, `otherCount`, `terminalLink` (new dep).
- Produces: `DetailField` gains `runtimes?: Runtime[]` and `link?: boolean`. `detail.ts` is purely additive (existing `value`/assertions unchanged); `DetailView` prefers badges when `runtimes` is non-empty and wraps `link` fields with `terminal-link`.

- [ ] **Step 1: Install the dependency**

Run: `npm install terminal-link@^5`
Expected: adds `terminal-link` to `dependencies`; lockfile updates.

- [ ] **Step 2: Write the failing tests**

Edit `test/detail.test.ts`. Extend the imports on line 4:
```ts
import type { McpRecord, PluginRecord, SkillRecord, Runtime } from '../src/types.js';
```
Add inside `describe('detailFields — skill', …)` (after the existing `it`s):
```ts
  it('carries the raw usedBy on the used-by field for badge rendering', () => {
    const f = detailFields(skillRow({ usedBy: ['claude-code', 'codex', 'amp'] as Runtime[] }));
    expect(f.find((x) => x.label === 'used by')?.runtimes).toEqual(['claude-code', 'codex', 'amp']);
  });

  it('flags the url field as a link', () => {
    const f = detailFields(skillRow({}));
    expect(f.find((x) => x.label === 'url')).toMatchObject({ value: 'https://github.com/h/animejs', link: true });
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/detail.test.ts`
Expected: FAIL — `runtimes` and `link` are `undefined` on the fields.

- [ ] **Step 4: Implement `detail.ts` (additive)**

Edit `src/render/ink/detail.ts`. Add the two optional fields to `DetailField`:
```ts
export interface DetailField {
  label: string;
  value: string;
  dim?: boolean;
  /** When present, the view renders runtime badges instead of `value`. */
  runtimes?: Runtime[];
  /** When true, the view renders `value` as a terminal hyperlink. */
  link?: boolean;
}
```
In `skillFields`, change the `used by` push to carry `runtimes`, and add `link: true` to the url push:
```ts
  f.push({ label: 'used by', value: fmtRuntimes(s.usedBy), runtimes: s.usedBy, dim: s.usedBy.length === 0 });
  if (s.provider.source) {
    f.push({ label: 'source', value: s.provider.source });
    if (s.provider.sourceUrl) f.push({ label: 'url', value: s.provider.sourceUrl, dim: true, link: true });
  } else {
    f.push({ label: 'source', value: s.provider.kind, dim: true });
  }
```
In `mcpFields`, add `link: true` to the url push:
```ts
  if (t.url) f.push({ label: 'url', value: t.url, link: true });
```

- [ ] **Step 5: Implement `DetailView.tsx`**

Replace the entire contents of `src/render/ink/DetailView.tsx`:

```tsx
import { Box, Text } from 'ink';
import terminalLink from 'terminal-link';
import type { ItemRow } from './rows.js';
import { detailFields, type DetailField } from './detail.js';
import { Badges } from './Badges.js';
import { marksFor, otherCount } from './runtimeMark.js';

function FieldValue({ f }: { f: DetailField }) {
  if (f.runtimes && f.runtimes.length > 0) {
    return <Badges marks={marksFor(f.runtimes)} plus={otherCount(f.runtimes)} />;
  }
  const value = f.link ? terminalLink(f.value, f.value, { fallback: (t) => t }) : f.value;
  return (
    <Text wrap="truncate-end" dimColor={f.dim}>
      {value}
    </Text>
  );
}

export function DetailView({ row }: { row: ItemRow | undefined }) {
  if (!row) {
    return (
      <Box flexGrow={1}>
        <Text dimColor>nothing selected</Text>
      </Box>
    );
  }
  const fields = detailFields(row);
  const labelW = Math.max(4, ...fields.map((f) => f.label.length));
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold underline>
        {row.name}
      </Text>
      {fields.map((f, i) => (
        <Box key={i}>
          <Box width={labelW + 2}>
            <Text dimColor>{f.label}</Text>
          </Box>
          <Box flexGrow={1}>
            <FieldValue f={f} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
```

> Note: an empty `used by` keeps `runtimes: []` (length 0), so `FieldValue` falls through to render the dim `value: 'none'` — preserving today's behavior.

- [ ] **Step 6: Run tests + typecheck + build**

Run: `npx vitest run test/detail.test.ts && npm test && npm run typecheck && npm run build`
Expected: PASS — new assertions green, all existing detail assertions (`used by` value `'claude-code, codex'`, url value, `'none'` dim) still green.

- [ ] **Step 7: Commit**

```bash
git add src/render/ink/detail.ts src/render/ink/DetailView.tsx test/detail.test.ts package.json package-lock.json
git commit -m "Detail: used-by badges + clickable origin URL (D1 + C4)"
```

---

### Task 7: `LeaderboardView.tsx` — `USES` column + badged STATS band

**Files:**
- Modify: `src/render/ink/LeaderboardView.tsx`

**Interfaces:**
- Consumes: `Badges`, `marksFor`, `ItemTable` (`showMarks`).
- Produces: no new exports.

- [ ] **Step 1: Edit the imports**

In `src/render/ink/LeaderboardView.tsx`, add after the existing imports:
```ts
import { Badges } from './Badges.js';
import { marksFor } from './runtimeMark.js';
```

- [ ] **Step 2: Badge the STATS band's "by runtime" line**

Replace the `StatsBand` function body's `runtimes` line. Change:
```tsx
  const runtimes = stats.perRuntime.map((r) => `${r.runtime} ${r.skills}`).join(' · ') || 'none';
```
to delete that line, and replace the `<Text dimColor>by runtime {runtimes}</Text>` element with:
```tsx
      <Text>
        <Text dimColor>by runtime </Text>
        {stats.perRuntime.length === 0 ? (
          <Text dimColor>none</Text>
        ) : (
          stats.perRuntime.map((r, i) => (
            <Text key={r.runtime}>
              {i ? '  ' : ''}
              <Badges marks={marksFor([r.runtime])} /> <Text dimColor>{r.skills}</Text>
            </Text>
          ))
        )}
      </Text>
```

- [ ] **Step 3: Pass `showMarks` to the list**

Change the `ItemTable` call (currently `showKind={false}`):
```tsx
        <ItemTable rows={shown} showKind={false} showMarks selectedIndex={selected - start} />
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/LeaderboardView.tsx
git commit -m "Leaderboard: USES column + badged STATS band (D1)"
```

---

### Task 8: `GlobalView.tsx` — `USES` column + `s` sort key (C3)

**Files:**
- Modify: `src/render/ink/GlobalView.tsx`

**Interfaces:**
- Consumes: `sortItemRows`, `type ItemSort` from `./rows.js`.
- Produces: no new exports.

- [ ] **Step 1: Edit imports + add sort state**

In `src/render/ink/GlobalView.tsx`, change the rows import line:
```ts
import { itemRows, sortItemRows, type ItemSort } from './rows.js';
```
Inside the component, after the `const [detail, setDetail] = useState(false);` line add:
```ts
  const [sort, setSort] = useState<ItemSort>('used');
```
Change the rows derivation:
```ts
  const rows = sortItemRows(itemRows(inv.global), sort);
```

- [ ] **Step 2: Add the `s` key**

In the `useInput` handler, after the `if (detail) { … return; }` block and before `if (key.downArrow …)`, add:
```ts
    if (input === 's') {
      setSort((m) => (m === 'used' ? 'name' : 'used'));
      return;
    }
```

- [ ] **Step 3: Pass `showMarks` + update the footer**

Change the `ItemTable` call:
```tsx
        <ItemTable rows={shown} showMarks selectedIndex={selected - start} />
```
Change the footer line:
```tsx
      <Text dimColor>↑/↓ scroll · Enter detail · s sort ({sort}) · 1/2/3 or Tab switch · q quit</Text>
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/GlobalView.tsx
git commit -m "Global: USES column + s sort key (D1 + C3)"
```

---

### Task 9: Folders surface — dense marks + folder-tree badges

**Files:**
- Modify: `src/render/ink/FoldersView.tsx`, `src/render/ink/FolderList.tsx`

**Interfaces:**
- Consumes: `Badges`, `marksFor`, `FolderRow.runtimes`, `ItemTable` (`showMarks`, `dense`).
- Produces: no new exports.

- [ ] **Step 1: Pass `showMarks dense` to the Folders items column**

In `src/render/ink/FoldersView.tsx`, change the `ItemTable` call (currently inside the `<>` fragment):
```tsx
                <ItemTable
                  rows={rows.slice(start, end)}
                  showMarks
                  dense
                  selectedIndex={nav.focus === 'items' ? itemIdx - start : undefined}
                />
```

- [ ] **Step 2: Refactor `FolderList.tsx` to a flex row with trailing badges**

Replace the entire contents of `src/render/ink/FolderList.tsx`:

```tsx
import { Box, Text } from 'ink';
import type { FolderRow } from './tree.js';
import { Badges } from './Badges.js';
import { marksFor } from './runtimeMark.js';

/**
 * The folder-tree column. Renders pre-windowed `FolderRow[]`: indent by depth, a
 * chevron for nodes with children, the `›` active cursor, a cyan `+N` aggregate
 * count, and a trailing runtime badge strip (which of the six work in this subtree).
 * The label flexes + truncates so the badges stay visible; badges are hidden while
 * the column is unfocused (`dimmed`). `selected` is the in-window index.
 */
export function FolderList({
  rows,
  selected,
  dimmed = false,
}: {
  rows: FolderRow[];
  selected: number;
  dimmed?: boolean;
}) {
  return (
    <Box flexDirection="column" width={42} marginRight={1}>
      {rows.length === 0 ? <Text dimColor>no folders discovered</Text> : null}
      {rows.map((r, i) => {
        const active = i === selected;
        const chevron = r.hasChildren ? (r.collapsed ? '▸' : '▾') : ' ';
        const indent = '  '.repeat(r.depth);
        const globalOnly = r.count === 0;
        const prefix = `${active ? '›' : ' '} ${indent}${chevron} `;
        const marks = dimmed ? [] : marksFor(r.runtimes ?? []);
        return (
          <Box key={r.nodeId}>
            <Box flexGrow={1} marginRight={marks.length ? 1 : 0}>
              <Text inverse={active && !dimmed} dimColor={dimmed || (globalOnly && !active)} wrap="truncate-end">
                {prefix}
                {r.label}
                {r.count > 0 ? <Text color="cyan"> +{r.count}</Text> : null}
              </Text>
            </Box>
            {marks.length ? <Badges marks={marks} /> : null}
          </Box>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/render/ink/FoldersView.tsx src/render/ink/FolderList.tsx
git commit -m "Folders: dense USES marks + folder-tree runtime badges (D1)"
```

---

### Task 10: `theme.ts` + GLOBAL band badges + Header tokens (D2)

**Files:**
- Create: `src/render/ink/theme.ts`
- Modify: `src/render/ink/GlobalBand.tsx`, `src/render/ink/Header.tsx`

**Interfaces:**
- Consumes: `Badges`, `marksFor`.
- Produces: `theme` — semantic color tokens (`accent`, `good`, `warn`, `border`).

- [ ] **Step 1: Create `theme.ts`**

Create `src/render/ink/theme.ts`:

```ts
/**
 * Semantic color tokens for the Ink dashboard — one home for the non-runtime
 * palette so color hierarchy stays consistent. Runtime hues live in runtimeMark.ts.
 */
export const theme = {
  accent: 'cyan', // +N counts, cursor
  good: 'green', // live
  warn: 'yellow', // rescanning / warnings
  border: 'gray', // band borders
} as const;
```

- [ ] **Step 2: Badge the GLOBAL band's runtimes line**

Replace the entire contents of `src/render/ink/GlobalBand.tsx`:

```tsx
import { Box, Text } from 'ink';
import type { Inventory } from '../../types.js';
import { Badges } from './Badges.js';
import { marksFor } from './runtimeMark.js';
import { theme } from './theme.js';

export function GlobalBand({ inv }: { inv: Inventory }) {
  const g = inv.global;
  return (
    <Box borderStyle="round" borderColor={theme.border} paddingX={1} flexDirection="column">
      <Text>
        <Text bold>GLOBAL</Text> <Text dimColor>inherited everywhere</Text>
      </Text>
      <Text>
        {g.skills.length} skills · {g.plugins.length} plugins · {g.mcp.length} mcp{'   '}
        <Text dimColor>runtimes: </Text>
        {inv.runtimesDetected.length ? (
          <Badges marks={marksFor(inv.runtimesDetected)} />
        ) : (
          <Text dimColor>none</Text>
        )}
      </Text>
    </Box>
  );
}
```

- [ ] **Step 3: Wire theme tokens into `Header.tsx`**

Replace the entire contents of `src/render/ink/Header.tsx`:

```tsx
import { Box, Text } from 'ink';
import type { Inventory } from '../../types.js';
import { theme } from './theme.js';

export function Header({ inv, status }: { inv: Inventory; status: 'idle' | 'rescanning' }) {
  return (
    <Box justifyContent="space-between">
      <Text>
        <Text bold>skillsight</Text> <Text dimColor>{inv.homeRoot}</Text>
      </Text>
      <Text>
        {status === 'rescanning' ? (
          <Text color={theme.warn}>● rescanning</Text>
        ) : (
          <Text color={theme.good}>● live</Text>
        )}
        {inv.warnings.length > 0 ? <Text color={theme.warn}> · ⚠ {inv.warnings.length}</Text> : null}
      </Text>
    </Box>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/theme.ts src/render/ink/GlobalBand.tsx src/render/ink/Header.tsx
git commit -m "Add theme.ts tokens + badged GLOBAL band (D2)"
```

---

### Task 11: Integration smoke + final verification

**Files:**
- Modify: `ROADMAP.md`

**Interfaces:** none.

- [ ] **Step 1: Full automated gate**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 2: Manual dashboard smoke at 80 columns**

Run (interactive — open in a real terminal):
```bash
COLUMNS=80 npx tsx src/cli.ts
```
Verify each, against the live inventory:
- **Leaderboard (`3`):** a `USES` badge strip on each row aligns with the `USED` column; the `STATS` "by runtime" line shows badges + counts.
- **Global (`2`):** `USES` strip present; pressing `s` flips the order between `used` and `name` (footer shows the mode); `Enter` opens detail with `used by` badges + a `+N` remainder, and the `url` line is a hyperlink (Cmd-click opens in a supporting terminal; plain selectable text otherwise).
- **Folders (`1`):** the folder tree shows a trailing runtime strip per folder (hidden when the column is unfocused); drilling into a folder (`Enter`) shows a dense items column (name + `USED` + `USES`, no KIND/SOURCE) with no overflow/wrapping at 80 cols.
- **GLOBAL band:** runtimes render as badges.
- No column misalignment anywhere; quit with `q`.

If any misalignment appears, the most likely culprit is a badge wider than one cell — confirm `runtimeMark` letters are single ASCII chars and `Badges` adds no stray spaces.

- [ ] **Step 3: Tick the roadmap**

In `ROADMAP.md`, mark D1, D2, C3, C4 done. Change their `- [ ]` lines to `- [x]` and append ` **Shipped 2026-06-26** (epic-d-visual-identity)` to the Epic D heading note area. (The merge SHA is filled in when the branch is finished/merged.) Specifically:
- Line for **C3**: `- [x] **C3. Show "used N times"** …`
- Line for **C4**: `- [x] **C4. Show origin URL** …`
- Line for **D1**: `- [x] **D1. Runtime icons/glyphs** …`
- Line for **D2**: `- [x] **D2. Interface polish** …`

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md
git commit -m "Check off Epic D (D1+D2) + C3/C4 in roadmap"
```

---

## Self-Review

**Spec coverage:**
- D1 runtime marks → Tasks 1 (mapping), 4 (component), 5/7/8/9/10 (surfaces). ✅
- D1 detail `used by` badges + `+N` → Task 6. ✅
- D1 folder-tree badges → Tasks 3 (aggregation) + 9 (render). ✅
- D1 GLOBAL/STATS band badges → Tasks 7 + 10. ✅
- D2 theme.ts + alignment → Tasks 10 + 5. ✅
- C3 used sort key (Global) → Tasks 2 (`sortItemRows`) + 8 (wiring). ✅
- C4 clickable URL → Task 6 (`terminal-link`). ✅
- Bounded-to-six + `USED` semantics + letters/order → Global Constraints + Task 1. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows full assertions. ✅

**Type consistency:** `RuntimeMark`, `marksFor`, `otherCount` (Task 1) are used with matching signatures in Tasks 4/5/6/7/9/10. `ItemRow.usedRuntimes` (Task 2) consumed in Tasks 5/9. `ItemSort`/`sortItemRows` (Task 2) consumed in Task 8. `FolderRow.runtimes` (Task 3) consumed in Task 9. `DetailField.runtimes`/`link` (Task 6) consumed in the same task's `DetailView`. `ItemTable` `showMarks`/`dense` (Task 5) consumed in Tasks 7/8/9. ✅

**Note on test ripple:** Adding `usedRuntimes` to `ItemRow` is handled as optional, so only `rows.test.ts`'s 5 `toEqual` blocks need updating (done in Task 2); `grouping.ts` and `detail.test.ts` literals stay valid. `detail.ts` changes are additive so existing `detail.test.ts` value assertions stay green (Task 6).
