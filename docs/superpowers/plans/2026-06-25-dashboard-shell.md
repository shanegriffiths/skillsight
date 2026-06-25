# Dashboard Shell (Epic A: A1 · A2 · A3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-screen Ink dashboard into a tabbed shell — `Folders | Global | Leaderboard` — adding a scrollable Global list (A2) and a Leaderboard + Stats view (A3), all from data the engine already captures.

**Architecture:** Two new pure, unit-tested modules carry the logic — `scroll.ts` (viewport math) and `stats.ts` (leaderboard + summary aggregations over the existing `mergeBuckets`/`bucketCounts` resolver helpers). Thin Ink components sit on top: a `TabBar`, three views (`FoldersView`, `GlobalView`, `LeaderboardView`), and a shared `ItemTable` extracted from `DetailPane`. `App.tsx` becomes a router holding only `tab` state. Resize-aware viewport height comes from Ink's built-in `useWindowSize()`.

**Tech Stack:** TypeScript (NodeNext ESM, `.js` import specifiers), React 19 + Ink 7.1.0, vitest 4.

## Global Constraints

- **Scope is the Ink dashboard only.** Touch only `src/render/ink/*` (plus its tests). Do **not** modify `src/render/plain.ts`, `src/render/json.ts`, the engine, the resolver, or adapters.
- **`--report` and `--json` output must remain byte-for-byte unchanged.** No task touches those renderers.
- **No new runtime or dev dependencies.** `useInput`, `useWindowSize`, `renderToString`, `Box`, `Text` (Ink) and vitest are already installed.
- **Pure modules stay pure-testable:** `scroll.ts` and `stats.ts` expose pure functions with no stdout/Node side-effects; their tests import only those functions. (A React hook may live alongside the pure functions but is not imported by the tests.)
- **Import specifiers use the `.js` extension** (NodeNext), e.g. `import { itemRows } from './rows.js'`.
- **Tab keys:** `1`/`2`/`3` jump; `Tab`/`Shift+Tab` cycle; `Esc` → Folders tab; `q` quit (Ctrl+C is handled natively by Ink). `←/→` stay **unbound** (reserved for Epic F).
- **Leaderboard ranks skills only** (plugins/MCP carry no `usedBy`); the stats `totals` still count plugins and MCP.
- Run `npm run typecheck` and `npm test` at the end of every task; both must be green before committing.

---

## File Structure

- **Create** `src/render/ink/scroll.ts` — pure `clampIndex` + `scrollWindow`, plus the thin `useScroll` hook.
- **Create** `test/scroll.test.ts` — unit tests for the pure scroll functions.
- **Create** `src/render/ink/stats.ts` — pure `leaderboard(inv)` + `summaryStats(inv)`.
- **Create** `test/stats.test.ts` — unit tests for both.
- **Create** `src/render/ink/ItemTable.tsx` — the KIND/NAME/USED/SOURCE table, extracted from `DetailPane`.
- **Modify** `src/render/ink/DetailPane.tsx` — consume `ItemTable` (output unchanged).
- **Create** `src/render/ink/TabBar.tsx` — the tab strip + `TabId` type.
- **Create** `src/render/ink/FoldersView.tsx` — today's folder screen, extracted.
- **Modify** `src/render/ink/App.tsx` — tab router + global keymap.
- **Create** `src/render/ink/GlobalView.tsx` — scrollable global list (A2).
- **Create** `src/render/ink/LeaderboardView.tsx` — leaderboard + inline stats band (A3).
- **Create (optional, Task 7)** `test/tabbar.test.ts` + a one-line `vitest.config.ts` esbuild tweak — `renderToString` smoke test.

Tasks are ordered so the app runs at every step: pure helpers first (1–2), the no-op table refactor (3), the shell with the Folders tab live and the other two stubbed (4), then each remaining view swapped in (5–6).

---

## Task 1: Pure `scroll.ts` (viewport math) + unit tests

**Files:**
- Create: `src/render/ink/scroll.ts`
- Test: `test/scroll.test.ts`

**Interfaces:**
- Produces:
  - `function clampIndex(index: number, length: number): number` — clamp to `[0, length-1]`; `0` when `length <= 0`.
  - `function scrollWindow(length: number, height: number, selected: number): { start: number; end: number }` — the visible half-open slice `[start, end)`; keeps `selected` visible, centred then clamped at both ends; returns `{ start: 0, end: length }` when `height >= length`.
  - `function useScroll(length: number, height: number): { selected: number; start: number; end: number; moveUp: () => void; moveDown: () => void }` — React hook (thin glue, untested).

- [ ] **Step 1: Write the failing test**

Create `test/scroll.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clampIndex, scrollWindow } from '../src/render/ink/scroll.js';

describe('clampIndex', () => {
  it('clamps below zero to zero', () => {
    expect(clampIndex(-3, 10)).toBe(0);
  });
  it('clamps above the last index', () => {
    expect(clampIndex(20, 10)).toBe(9);
  });
  it('returns zero for an empty list', () => {
    expect(clampIndex(5, 0)).toBe(0);
  });
});

describe('scrollWindow', () => {
  it('returns the whole list when height covers it', () => {
    expect(scrollWindow(4, 10, 2)).toEqual({ start: 0, end: 4 });
  });
  it('is safe for an empty list', () => {
    expect(scrollWindow(0, 10, 0)).toEqual({ start: 0, end: 0 });
  });
  it('pins to the top when selected is near the start', () => {
    expect(scrollWindow(100, 10, 0)).toEqual({ start: 0, end: 10 });
  });
  it('centres selected in the middle of a long list', () => {
    // half = floor(10/2) = 5, so start = 50 - 5 = 45
    expect(scrollWindow(100, 10, 50)).toEqual({ start: 45, end: 55 });
  });
  it('pins to the bottom when selected is at the end', () => {
    expect(scrollWindow(100, 10, 99)).toEqual({ start: 90, end: 100 });
  });
  it('keeps selected within the returned window', () => {
    for (const sel of [0, 1, 37, 88, 99]) {
      const { start, end } = scrollWindow(100, 12, sel);
      expect(sel).toBeGreaterThanOrEqual(start);
      expect(sel).toBeLessThan(end);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/scroll.test.ts`
Expected: FAIL — cannot resolve `../src/render/ink/scroll.js` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/render/ink/scroll.ts`:

```ts
import { useState } from 'react';

/** Clamp an index into `[0, length-1]`; `0` for an empty list. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

/**
 * The visible half-open slice `[start, end)` of `height` rows that keeps
 * `selected` on screen — centred, then clamped so the window never runs past
 * either end. Returns the whole list when it fits.
 */
export function scrollWindow(
  length: number,
  height: number,
  selected: number,
): { start: number; end: number } {
  if (height >= length) return { start: 0, end: Math.max(length, 0) };
  const sel = clampIndex(selected, length);
  const half = Math.floor(height / 2);
  const start = Math.max(0, Math.min(sel - half, length - height));
  return { start, end: start + height };
}

/**
 * Thin React glue over the pure functions above: owns the selected index and
 * derives the visible window. Components consume this; tests cover the pure
 * functions directly.
 */
export function useScroll(length: number, height: number) {
  const [selected, setSelected] = useState(0);
  const sel = clampIndex(selected, length);
  const moveUp = () => setSelected(() => clampIndex(sel - 1, length));
  const moveDown = () => setSelected(() => clampIndex(sel + 1, length));
  const { start, end } = scrollWindow(length, height, sel);
  return { selected: sel, start, end, moveUp, moveDown };
}
```

- [ ] **Step 4: Run tests + typecheck to verify they pass**

Run: `npx vitest run test/scroll.test.ts && npm run typecheck`
Expected: all 9 scroll tests PASS; `tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/scroll.ts test/scroll.test.ts
git commit -m "Add pure scroll viewport helper + useScroll hook (A2/A3)"
```

---

## Task 2: Pure `stats.ts` (leaderboard + summary) + unit tests

**Files:**
- Create: `src/render/ink/stats.ts`
- Test: `test/stats.test.ts`

**Interfaces:**
- Consumes: `mergeBuckets`, `bucketCounts` from `../../resolve.js`; `itemRows`, `ItemRow` from `./rows.js`; `Inventory`, `Provider`, `Runtime`, `emptyBucket` from `../../types.js`.
- Produces:
  - `interface SummaryStats { totals: { skills: number; plugins: number; mcp: number }; perRuntime: { runtime: Runtime; skills: number }[]; perProvider: { kind: Provider['kind']; skills: number }[] }`
  - `function leaderboard(inv: Inventory): ItemRow[]` — all distinct skills (deduped by `contentId`), ranked by `used` desc then `name` asc; every row has `kind: 'skill'` and a numeric `used`.
  - `function summaryStats(inv: Inventory): SummaryStats` — counts over the same deduped universe.

- [ ] **Step 1: Write the failing test**

Create `test/stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { leaderboard, summaryStats } from '../src/render/ink/stats.js';
import type {
  Bucket,
  FolderReport,
  Inventory,
  McpRecord,
  PluginRecord,
  Provider,
  SkillRecord,
} from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function skill(
  name: string,
  usedBy: string[],
  opts: { contentId?: string; source?: string; kind?: Provider['kind'] } = {},
): SkillRecord {
  const kind = opts.kind ?? (opts.source ? 'shared-store' : 'project-local');
  return {
    name,
    contentId: opts.contentId ?? name,
    provider: { kind, source: opts.source, path: `/x/${name}` },
    usedBy,
    enabled: true,
    scope: 'project-scoped',
  };
}

function plugin(id: string): PluginRecord {
  return {
    id,
    name: id,
    marketplace: 'official',
    version: '1.0.0',
    scope: 'user',
    enabled: true,
    provides: { skills: [], commands: [], agents: [], mcpServers: [] },
    supportsRuntimes: [],
  };
}

function mcp(name: string): McpRecord {
  return {
    name,
    transport: { kind: 'stdio' },
    provider: { kind: 'user', path: `/x/${name}` },
    scope: 'project-scoped',
    enabled: true,
  };
}

function bucket(b: Partial<Bucket>): Bucket {
  return { ...emptyBucket(), ...b };
}

function folder(b: Partial<Pick<FolderReport, 'projectScoped' | 'local'>>): FolderReport {
  return {
    path: '/p',
    group: 'g',
    runtimes: [],
    global: emptyBucket(),
    projectScoped: b.projectScoped ?? emptyBucket(),
    local: b.local ?? emptyBucket(),
    effective: emptyBucket(),
  };
}

function inv(p: { global?: Bucket; folders?: FolderReport[]; runtimes?: string[] }): Inventory {
  return {
    generatedAt: '2026-06-25',
    homeRoot: '/home',
    runtimesDetected: p.runtimes ?? [],
    warnings: [],
    global: p.global ?? emptyBucket(),
    folders: p.folders ?? [],
  };
}

describe('leaderboard', () => {
  it('ranks skills by usedBy count desc, then name asc', () => {
    const i = inv({
      global: bucket({
        skills: [
          skill('zeta', ['cc', 'codex', 'cursor']),
          skill('beta', ['cc', 'codex']),
          skill('alpha', ['cc', 'codex']),
          skill('gamma', ['cc']),
        ],
      }),
    });
    const rows = leaderboard(i);
    expect(rows.map((r) => r.name)).toEqual(['zeta', 'alpha', 'beta', 'gamma']);
    expect(rows.map((r) => r.used)).toEqual([3, 2, 2, 1]);
  });

  it('dedupes a skill present globally and in a folder, unioning usedBy', () => {
    const i = inv({
      global: bucket({ skills: [skill('sd', ['cc'], { contentId: 'h1', source: 'o/r' })] }),
      folders: [
        folder({ projectScoped: bucket({ skills: [skill('sd', ['codex'], { contentId: 'h1', source: 'o/r' })] }) }),
      ],
    });
    const rows = leaderboard(i);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'sd', used: 2, source: 'o/r' });
  });

  it('returns an empty array for an empty inventory', () => {
    expect(leaderboard(inv({}))).toEqual([]);
  });
});

describe('summaryStats', () => {
  it('counts deduped totals across global and folders', () => {
    const i = inv({
      global: bucket({ skills: [skill('a', []), skill('b', [])], plugins: [plugin('p1')], mcp: [mcp('m1')] }),
      folders: [folder({ projectScoped: bucket({ skills: [skill('c', [])] }) })],
    });
    expect(summaryStats(i).totals).toEqual({ skills: 3, plugins: 1, mcp: 1 });
  });

  it('counts distinct skills per detected runtime, sorted desc', () => {
    const i = inv({
      runtimes: ['cc', 'codex', 'cursor'],
      global: bucket({
        skills: [skill('s1', ['cc', 'codex']), skill('s2', ['cc']), skill('s3', ['codex', 'cursor'])],
      }),
    });
    expect(summaryStats(i).perRuntime).toEqual([
      { runtime: 'cc', skills: 2 },
      { runtime: 'codex', skills: 2 },
      { runtime: 'cursor', skills: 1 },
    ]);
  });

  it('tallies skills by provider kind, sorted desc', () => {
    const i = inv({
      global: bucket({
        skills: [
          skill('s1', [], { source: 'o/r' }),
          skill('s2', [], { source: 'o/r' }),
          skill('s3', []),
        ],
      }),
    });
    expect(summaryStats(i).perProvider).toEqual([
      { kind: 'shared-store', skills: 2 },
      { kind: 'project-local', skills: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/stats.test.ts`
Expected: FAIL — cannot resolve `../src/render/ink/stats.js` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/render/ink/stats.ts`:

```ts
import type { Bucket, Inventory, Provider, Runtime } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { bucketCounts, mergeBuckets } from '../../resolve.js';
import { itemRows, type ItemRow } from './rows.js';

export interface SummaryStats {
  totals: { skills: number; plugins: number; mcp: number };
  /** Distinct skills each detected runtime uses, highest first. */
  perRuntime: { runtime: Runtime; skills: number }[];
  /** Skill count by provider kind, highest first. */
  perProvider: { kind: Provider['kind']; skills: number }[];
}

/** Dedupe every skill/plugin/mcp across global + all folder layers. */
function universe(inv: Inventory): Bucket {
  return mergeBuckets(inv.global, ...inv.folders.flatMap((f) => [f.projectScoped, f.local]));
}

/** All distinct skills ranked by how many runtimes use them (desc, then name). */
export function leaderboard(inv: Inventory): ItemRow[] {
  const skills = universe(inv).skills;
  return itemRows({ ...emptyBucket(), skills }).sort(
    (a, b) => (b.used ?? 0) - (a.used ?? 0) || a.name.localeCompare(b.name),
  );
}

export function summaryStats(inv: Inventory): SummaryStats {
  const all = universe(inv);
  const totals = bucketCounts(all);

  const perRuntime = inv.runtimesDetected
    .map((runtime) => ({
      runtime,
      skills: all.skills.filter((s) => s.usedBy.includes(runtime)).length,
    }))
    .sort((a, b) => b.skills - a.skills || a.runtime.localeCompare(b.runtime));

  const byKind = new Map<Provider['kind'], number>();
  for (const s of all.skills) byKind.set(s.provider.kind, (byKind.get(s.provider.kind) ?? 0) + 1);
  const perProvider = [...byKind.entries()]
    .map(([kind, skills]) => ({ kind, skills }))
    .sort((a, b) => b.skills - a.skills || a.kind.localeCompare(b.kind));

  return { totals, perRuntime, perProvider };
}
```

- [ ] **Step 4: Run tests + typecheck to verify they pass**

Run: `npx vitest run test/stats.test.ts && npm run typecheck`
Expected: all 6 stats tests PASS; `tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/stats.ts test/stats.test.ts
git commit -m "Add pure leaderboard + summaryStats helper (A3)"
```

---

## Task 3: Extract `ItemTable`; refactor `DetailPane` to use it

**Files:**
- Create: `src/render/ink/ItemTable.tsx`
- Modify: `src/render/ink/DetailPane.tsx` (full rewrite)

**Interfaces:**
- Consumes: `ItemRow` from `./rows.js`.
- Produces: `function ItemTable({ rows, showKind }: { rows: ItemRow[]; showKind?: boolean }): JSX.Element` — renders a header row + the given rows (caller pre-slices). `showKind` defaults to `true`; when `false`, the KIND column is omitted.

**Goal of this task:** a pure DRY extraction. `DetailPane`'s on-screen output must be **identical** to before (same columns, same `slice(0, 20)` cap, same "…and N more" line).

- [ ] **Step 1: Create `ItemTable.tsx`**

Create `src/render/ink/ItemTable.tsx` with the cell layout lifted verbatim from `DetailPane` (same `KIND_W`/`USED_W`/`SOURCE_W` widths), parameterised by `showKind`:

```tsx
import { Box, Text } from 'ink';
import type { ItemRow } from './rows.js';

const KIND_W = 6;
const USED_W = 4;
const SOURCE_W = 22;

function HeaderRow({ showKind }: { showKind: boolean }) {
  return (
    <Box>
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
      <Box width={SOURCE_W}>
        <Text dimColor bold>
          SOURCE
        </Text>
      </Box>
    </Box>
  );
}

function Row({ row, showKind }: { row: ItemRow; showKind: boolean }) {
  const used = row.used === null ? '—' : row.used === 0 ? '·' : String(row.used);
  const usedDim = row.used === null || row.used === 0;
  return (
    <Box>
      {showKind ? (
        <Box width={KIND_W} marginRight={1}>
          <Text dimColor>{row.kind}</Text>
        </Box>
      ) : null}
      <Box flexGrow={1} marginRight={1}>
        <Text wrap="truncate-end">{row.name}</Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor={usedDim}>{used}</Text>
      </Box>
      <Box width={SOURCE_W}>
        <Text wrap="truncate-end" dimColor={row.sourceDim}>
          {row.source ?? ''}
        </Text>
      </Box>
    </Box>
  );
}

export function ItemTable({ rows, showKind = true }: { rows: ItemRow[]; showKind?: boolean }) {
  return (
    <Box flexDirection="column">
      <HeaderRow showKind={showKind} />
      {rows.map((r, i) => (
        <Row key={i} row={r} showKind={showKind} />
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Rewrite `DetailPane.tsx` to consume `ItemTable`**

Replace the entire contents of `src/render/ink/DetailPane.tsx` with:

```tsx
import { Box, Text } from 'ink';
import type { Bucket, FolderReport } from '../../types.js';
import { itemRows } from './rows.js';
import { ItemTable } from './ItemTable.js';

function Section({ title, b }: { title: string; b: Bucket }) {
  const rows = itemRows(b);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 20);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        {title} <Text dimColor>({rows.length})</Text>
      </Text>
      <ItemTable rows={shown} />
      {rows.length > shown.length ? (
        <Text dimColor>
          {'  '}…and {rows.length - shown.length} more
        </Text>
      ) : null}
    </Box>
  );
}

export function DetailPane({ folder }: { folder: FolderReport | undefined }) {
  if (!folder) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text dimColor>select a folder</Text>
      </Box>
    );
  }
  const empty = itemRows(folder.projectScoped).length + itemRows(folder.local).length === 0;
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold underline>
        {folder.path}
      </Text>
      {empty ? <Text dimColor>global only — adds nothing beyond the inherited layer</Text> : null}
      <Section title="project-scoped" b={folder.projectScoped} />
      <Section title="local" b={folder.local} />
    </Box>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0 (`ItemTable` resolves; `DetailPane` no longer declares the cell components).

- [ ] **Step 4: Run the full suite (no regressions)**

Run: `npm test`
Expected: PASS — all existing tests plus Tasks 1–2 (61 tests). No test asserts DetailPane's internal structure, so nothing should break; if one fails, stop and report rather than editing it.

- [ ] **Step 5: Manual visual smoke (no assertion, just look)**

Run: `npm run dev`, arrow to a folder with project-scoped or local items.
Expected: the detail pane looks exactly as before — `KIND NAME USED SOURCE` header then aligned rows, `…and N more` past 20. Press `q`. (Skip if non-interactive; Steps 3–4 gate.)

- [ ] **Step 6: Commit**

```bash
git add src/render/ink/ItemTable.tsx src/render/ink/DetailPane.tsx
git commit -m "Extract shared ItemTable from DetailPane (C2 reuse)"
```

---

## Task 4: Tab shell — `TabBar` + `FoldersView` + `App` router

**Files:**
- Create: `src/render/ink/TabBar.tsx`
- Create: `src/render/ink/FoldersView.tsx`
- Modify: `src/render/ink/App.tsx` (full rewrite)

**Interfaces:**
- `TabBar.tsx` produces: `type TabId = 'folders' | 'global' | 'leaderboard'` and `function TabBar({ active }: { active: TabId }): JSX.Element`.
- `FoldersView.tsx` produces: `function FoldersView({ inv }: { inv: Inventory }): JSX.Element` — today's `GlobalBand` + `FolderList` + `DetailPane`, owning folder selection.
- `App.tsx` consumes: `TabId`/`TabBar`, `FoldersView`; renders placeholder `Text` for the Global and Leaderboard tabs (filled in Tasks 5–6).

- [ ] **Step 1: Create `TabBar.tsx`**

Create `src/render/ink/TabBar.tsx`:

```tsx
import { Box, Text } from 'ink';

export type TabId = 'folders' | 'global' | 'leaderboard';

const TABS: { id: TabId; key: string; label: string }[] = [
  { id: 'folders', key: '1', label: 'Folders' },
  { id: 'global', key: '2', label: 'Global' },
  { id: 'leaderboard', key: '3', label: 'Leaderboard' },
];

export function TabBar({ active }: { active: TabId }) {
  return (
    <Box marginBottom={1}>
      {TABS.map((t) => (
        <Box key={t.id} marginRight={2}>
          <Text dimColor>{t.key}</Text>
          <Text inverse={t.id === active} bold={t.id === active}>
            {` ${t.label} `}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Create `FoldersView.tsx`** (today's screen, lifted out of `App`)

Create `src/render/ink/FoldersView.tsx`:

```tsx
import { useState } from 'react';
import { Box, useInput } from 'ink';
import type { Inventory } from '../../types.js';
import { GlobalBand } from './GlobalBand.js';
import { FolderList } from './FolderList.js';
import { DetailPane } from './DetailPane.js';

export function FoldersView({ inv }: { inv: Inventory }) {
  const folders = inv.folders;
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.downArrow || input === 'j') {
      setSelected((s) => Math.min(s + 1, Math.max(folders.length - 1, 0)));
    }
    if (key.upArrow || input === 'k') {
      setSelected((s) => Math.max(s - 1, 0));
    }
  });

  const clamped = Math.min(selected, Math.max(folders.length - 1, 0));

  return (
    <Box flexDirection="column">
      <GlobalBand inv={inv} />
      <Box>
        <FolderList folders={folders} selected={clamped} />
        <DetailPane folder={folders[clamped]} />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Rewrite `App.tsx` as the router**

Replace the entire contents of `src/render/ink/App.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import chokidar from 'chokidar';
import type { Inventory } from '../../types.js';
import { scan, type ScanOptions } from '../../index.js';
import { filterInventory, type FilterOptions } from '../../filter.js';
import { computeWatchPaths } from './watchpaths.js';
import { Header } from './Header.js';
import { TabBar, type TabId } from './TabBar.js';
import { FoldersView } from './FoldersView.js';

const TABS: TabId[] = ['folders', 'global', 'leaderboard'];

const FOOTER: Record<TabId, string> = {
  folders: '↑/↓ navigate · 1/2/3 or Tab switch · q quit',
  global: '↑/↓ scroll · 1/2/3 or Tab switch · Esc folders · q quit',
  leaderboard: '↑/↓ scroll · 1/2/3 or Tab switch · Esc folders · q quit',
};

export function App({
  homeRoot,
  opts,
  filter,
  initial,
}: {
  homeRoot: string;
  opts: ScanOptions;
  filter: FilterOptions;
  initial: Inventory;
}) {
  const [raw, setRaw] = useState<Inventory>(initial);
  const [status, setStatus] = useState<'idle' | 'rescanning'>('idle');
  const [tab, setTab] = useState<TabId>('folders');
  const { exit } = useApp();

  const inv = filterInventory(raw, filter);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    if (key.escape) {
      setTab('folders');
      return;
    }
    if (input === '1') setTab('folders');
    if (input === '2') setTab('global');
    if (input === '3') setTab('leaderboard');
    if (key.tab && !key.shift) setTab((t) => TABS[(TABS.indexOf(t) + 1) % TABS.length]!);
    if (key.tab && key.shift) setTab((t) => TABS[(TABS.indexOf(t) + TABS.length - 1) % TABS.length]!);
  });

  useEffect(() => {
    const watcher = chokidar.watch(computeWatchPaths(homeRoot, raw, opts.env ?? process.env), {
      ignoreInitial: true,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const trigger = () => {
      setStatus('rescanning');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setRaw(scan(homeRoot, opts));
        setStatus('idle');
      }, 150);
    };
    watcher.on('all', trigger);
    return () => {
      void watcher.close();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <Box flexDirection="column">
      <Header inv={inv} status={status} />
      <TabBar active={tab} />
      {tab === 'folders' ? <FoldersView inv={inv} /> : null}
      {tab === 'global' ? <Text dimColor>Global view — arrives in Task 5</Text> : null}
      {tab === 'leaderboard' ? <Text dimColor>Leaderboard view — arrives in Task 6</Text> : null}
      <Text dimColor>{FOOTER[tab]}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. (The `!` non-null assertions on `TABS[...]` satisfy `noUncheckedIndexedAccess` if enabled; if the project does not use it, they are harmless.)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (no component tests assert App/FoldersView structure; this confirms no collateral breakage).

- [ ] **Step 6: Manual visual smoke**

Run: `npm run dev`. The Folders tab shows today's screen; `↑/↓`/`j`/`k` move folders. Press `2` / `3` / `Tab` / `Shift+Tab` to switch tabs (Global & Leaderboard show a placeholder line); `Esc` returns to Folders; `1` jumps to Folders; `q` quits.

- [ ] **Step 7: Commit**

```bash
git add src/render/ink/TabBar.tsx src/render/ink/FoldersView.tsx src/render/ink/App.tsx
git commit -m "Add tab shell: TabBar, FoldersView, App router (A1)"
```

---

## Task 5: `GlobalView` — scrollable global list (A2)

**Files:**
- Create: `src/render/ink/GlobalView.tsx`
- Modify: `src/render/ink/App.tsx` (swap the Global placeholder for `GlobalView`)

**Interfaces:**
- Consumes: `itemRows` from `./rows.js`; `ItemTable` from `./ItemTable.js`; `useScroll` from `./scroll.js`; `useWindowSize` from `ink`.
- Produces: `function GlobalView({ inv }: { inv: Inventory }): JSX.Element`.

- [ ] **Step 1: Create `GlobalView.tsx`**

Create `src/render/ink/GlobalView.tsx`:

```tsx
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { itemRows } from './rows.js';
import { ItemTable } from './ItemTable.js';
import { useScroll } from './scroll.js';

// Header + tab bar + view title + position line + footer + margins.
const CHROME = 8;

export function GlobalView({ inv }: { inv: Inventory }) {
  const rows = itemRows(inv.global);
  const height = Math.max(3, useWindowSize().rows - CHROME);
  const { start, end, moveUp, moveDown } = useScroll(rows.length, height);

  useInput((input, key) => {
    if (key.downArrow || input === 'j') moveDown();
    if (key.upArrow || input === 'k') moveUp();
  });

  const shown = rows.slice(start, end);

  return (
    <Box flexDirection="column">
      <Text bold>
        global <Text dimColor>({rows.length}) — inherited everywhere</Text>
      </Text>
      {rows.length === 0 ? (
        <Text dimColor>no global items</Text>
      ) : (
        <ItemTable rows={shown} />
      )}
      {rows.length > height ? (
        <Text dimColor>
          {start + 1}–{end} of {rows.length}
        </Text>
      ) : null}
    </Box>
  );
}
```

- [ ] **Step 2: Wire `GlobalView` into `App.tsx`**

In `src/render/ink/App.tsx`, add the import beside the other view imports:

```tsx
import { GlobalView } from './GlobalView.js';
```

and replace the Global placeholder line:

```tsx
      {tab === 'global' ? <Text dimColor>Global view — arrives in Task 5</Text> : null}
```

with:

```tsx
      {tab === 'global' ? <GlobalView inv={inv} /> : null}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (unchanged count; no new tests this task — `GlobalView` is a thin component covered by the optional Task 7 smoke and the pure helpers it composes).

- [ ] **Step 5: Manual visual smoke**

Run: `npm run dev`, press `2`. The Global tab lists every global item as a `KIND NAME USED SOURCE` table; `↑/↓`/`j`/`k` scroll; the `N–M of TOTAL` line tracks the window. Resize the terminal taller/shorter and confirm the visible row count adjusts. Press `q`.

- [ ] **Step 6: Commit**

```bash
git add src/render/ink/GlobalView.tsx src/render/ink/App.tsx
git commit -m "Add scrollable Global tab (A2)"
```

---

## Task 6: `LeaderboardView` — ranked skills + stats band (A3)

**Files:**
- Create: `src/render/ink/LeaderboardView.tsx`
- Modify: `src/render/ink/App.tsx` (swap the Leaderboard placeholder for `LeaderboardView`)

**Interfaces:**
- Consumes: `leaderboard`, `summaryStats`, `SummaryStats` from `./stats.js`; `ItemTable` from `./ItemTable.js`; `useScroll` from `./scroll.js`; `useWindowSize` from `ink`.
- Produces: `function LeaderboardView({ inv }: { inv: Inventory }): JSX.Element`. (A local `StatsBand` component renders `SummaryStats`; it is co-located, not exported.)

- [ ] **Step 1: Create `LeaderboardView.tsx`**

Create `src/render/ink/LeaderboardView.tsx`:

```tsx
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { ItemTable } from './ItemTable.js';
import { leaderboard, summaryStats, type SummaryStats } from './stats.js';
import { useScroll } from './scroll.js';

// Header + tab bar + view title + position line + stats band (~5 lines) + footer.
const CHROME = 12;

function StatsBand({ stats }: { stats: SummaryStats }) {
  const runtimes = stats.perRuntime.map((r) => `${r.runtime} ${r.skills}`).join(' · ') || 'none';
  const providers = stats.perProvider.map((p) => `${p.kind} ${p.skills}`).join(' · ') || 'none';
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text>
        <Text bold>STATS</Text> {stats.totals.skills} skills · {stats.totals.plugins} plugins ·{' '}
        {stats.totals.mcp} mcp
      </Text>
      <Text dimColor>by runtime {runtimes}</Text>
      <Text dimColor>by source {providers}</Text>
    </Box>
  );
}

export function LeaderboardView({ inv }: { inv: Inventory }) {
  const rows = leaderboard(inv);
  const stats = summaryStats(inv);
  const height = Math.max(3, useWindowSize().rows - CHROME);
  const { start, end, moveUp, moveDown } = useScroll(rows.length, height);

  useInput((input, key) => {
    if (key.downArrow || input === 'j') moveDown();
    if (key.upArrow || input === 'k') moveUp();
  });

  const shown = rows.slice(start, end);

  return (
    <Box flexDirection="column">
      <Text bold>
        leaderboard <Text dimColor>({rows.length}) — skills by runtime reach</Text>
      </Text>
      {rows.length === 0 ? (
        <Text dimColor>no skills</Text>
      ) : (
        <ItemTable rows={shown} showKind={false} />
      )}
      {rows.length > height ? (
        <Text dimColor>
          {start + 1}–{end} of {rows.length}
        </Text>
      ) : null}
      <StatsBand stats={stats} />
    </Box>
  );
}
```

- [ ] **Step 2: Wire `LeaderboardView` into `App.tsx`**

In `src/render/ink/App.tsx`, add the import:

```tsx
import { LeaderboardView } from './LeaderboardView.js';
```

and replace the Leaderboard placeholder line:

```tsx
      {tab === 'leaderboard' ? <Text dimColor>Leaderboard view — arrives in Task 6</Text> : null}
```

with:

```tsx
      {tab === 'leaderboard' ? <LeaderboardView inv={inv} /> : null}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (unchanged count; `LeaderboardView` is thin glue over the Task 2 pure helpers, which are already tested).

- [ ] **Step 5: Manual visual smoke**

Run: `npm run dev`, press `3`. The Leaderboard tab shows skills ranked by `USED` desc (NAME/USED/SOURCE, no KIND column); `↑/↓`/`j`/`k` scroll; the STATS band below shows totals, per-runtime, and per-source counts. Press `q`.

- [ ] **Step 6: Commit**

```bash
git add src/render/ink/LeaderboardView.tsx src/render/ink/App.tsx
git commit -m "Add Leaderboard + Stats tab (A3)"
```

---

## Task 7 (OPTIONAL): `renderToString` smoke test for `TabBar`

Per the repo convention components stay untested; this optional task adds one direct render check using Ink's built-in `renderToString` (no new dependency). It targets `TabBar` specifically — a pure presentational component with no `useInput`/`useWindowSize`, so it renders cleanly to a string. Skip if keeping components untested is preferred.

**Files:**
- Modify: `vitest.config.ts`
- Create: `test/tabbar.test.ts`

- [ ] **Step 1: Enable automatic JSX in vitest's esbuild**

Replace the contents of `vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 2: Write the smoke test**

Create `test/tabbar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'ink';
import { TabBar } from '../src/render/ink/TabBar.js';

describe('TabBar', () => {
  it('renders all three tab labels', () => {
    const out = renderToString(h(TabBar, { active: 'global' }), { columns: 80 });
    expect(out).toContain('Folders');
    expect(out).toContain('Global');
    expect(out).toContain('Leaderboard');
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run test/tabbar.test.ts`
Expected: PASS. (If it fails to resolve JSX in `TabBar.tsx`, confirm Step 1's `esbuild` block was saved.)

- [ ] **Step 4: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: both green.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts test/tabbar.test.ts
git commit -m "Add renderToString smoke test for TabBar"
```

---

## Self-Review

**Spec coverage:**
- A1 tab nav (`1/2/3` + `Tab`/`Shift+Tab` + `Esc`→folders, `←/→` unbound) → Task 4 (`TabBar`, `App` keymap). ✓
- A2 Global tab, full scrollable list → Task 5 (`GlobalView` + `useScroll` + `useWindowSize`). ✓
- A3 Leaderboard (skills by `usedBy` desc) + Stats band → Task 2 (`leaderboard`/`summaryStats`) + Task 6 (`LeaderboardView`/`StatsBand`). ✓
- Real scroll, resize-aware via `useWindowSize().rows` → Task 1 (`scroll.ts`) + Tasks 5–6. ✓
- Pure logic in tested modules; thin components → Tasks 1–2 tested, components untested w/ optional Task 7. ✓
- Shared `ItemTable` extracted from `DetailPane`, output unchanged → Task 3. ✓
- `--report`/`--json`/engine/resolver untouched → enforced by Global Constraints; no task edits those files. ✓
- Non-TTY path untouched (`index.tsx`) → not in any task's file list. ✓
- Leaderboard skills-only; totals still count plugins/MCP → Task 2 (`leaderboard` ranks `universe.skills`; `summaryStats.totals` uses `bucketCounts` of the full bucket). ✓

**Placeholder scan:** none — every code/command step is concrete. The `CHROME` constants (8, 12) are deliberate heuristics with comments; a slightly-off value only changes how many rows show, never correctness (`scrollWindow` clamps safely).

**Type consistency:** `ItemRow` (from `rows.ts`) flows unchanged through `leaderboard` (Task 2), `ItemTable` (Task 3), `GlobalView` (Task 5), `LeaderboardView` (Task 6). `TabId` is defined in `TabBar.tsx` (Task 4) and imported by `App.tsx`. `SummaryStats` defined in `stats.ts` (Task 2) is consumed by `StatsBand` (Task 6). `useScroll` returns `{ selected, start, end, moveUp, moveDown }` (Task 1) and is destructured as `{ start, end, moveUp, moveDown }` in Tasks 5–6. `scrollWindow`/`clampIndex` signatures match between `scroll.ts` and `test/scroll.test.ts`. Test record builders match `SkillRecord`/`PluginRecord`/`McpRecord`/`FolderReport`/`Inventory` from `src/types.ts`.
