# Interactive runtime + kind filter (Epic E: E1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive filter bar of runtime + kind toggle chips to the dashboard that narrows skills/plugins/mcp live across every tab.

**Architecture:** Lift the filter into `App` state (seeded from the CLI `filter` prop) and apply the existing pure `filterInventory(raw, { runtimes, kinds })` live. A `f`-toggled "filter mode" suppresses each view's input via Ink's `useInput(handler, { isActive })` while a new `FilterBar` owns the chips. A new pure `filterChips.ts` builds the chip list and toggles selections. No engine change.

**Tech Stack:** TypeScript (strict), React 19 + Ink 7, vitest. Spec: `docs/superpowers/specs/2026-06-26-runtime-filter-design.md`.

## Global Constraints

- **Presentation-layer only.** Do NOT modify the engine, adapters, resolver, `discovery.ts`, `filter.ts` (`filterInventory` is reused as-is), `plain.ts`, or `json.ts`.
- **No new runtime or dev dependencies.** `useInput`'s `isActive` option and all keys are built-in Ink.
- **TypeScript strict mode** is on; `npm run typecheck` must stay green.
- **ESM with `.js` import specifiers** — import siblings as `./filterChips.js`, `../../types.js`.
- **Tests are pure-module vitest** (no ink-testing-library). Test logic, not components.
- **Commit message trailer:** end every commit body with
  `Claude-Session: https://claude.ai/code/session_01WN9NzXeQZVBH3uTBFweNtC`
- **Branch:** `epic-e-filter` (already checked out).
- Baseline before starting: `npm test` → 106 tests passing.

---

### Task 1: `filterChips.ts` — pure chip model + toggle

**Files:**
- Create: `src/render/ink/filterChips.ts`
- Test: `test/filterChips.test.ts`

**Interfaces:**
- Consumes: `Runtime`, `Kind` from `../../types.js`.
- Produces (Task 2 relies on these exact names/types):
  - `type Chip = { kind: 'runtime'; id: Runtime } | { kind: 'kind'; id: Kind }`
  - `function chips(detected: Runtime[]): Chip[]` — runtimes (given order) then `skill, plugin, mcp`
  - `function isChipSelected(c: Chip, runtimes: ReadonlySet<Runtime>, kinds: ReadonlySet<Kind>): boolean`
  - `function toggleChip(c: Chip, runtimes: ReadonlySet<Runtime>, kinds: ReadonlySet<Kind>): { runtimes: Set<Runtime>; kinds: Set<Kind> }`

- [ ] **Step 1: Write the failing test**

Create `test/filterChips.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chips, isChipSelected, toggleChip } from '../src/render/ink/filterChips.js';
import type { Kind } from '../src/types.js';

describe('chips', () => {
  it('lists detected runtimes (in order) then skill/plugin/mcp', () => {
    expect(chips(['claude-code', 'codex'])).toEqual([
      { kind: 'runtime', id: 'claude-code' },
      { kind: 'runtime', id: 'codex' },
      { kind: 'kind', id: 'skill' },
      { kind: 'kind', id: 'plugin' },
      { kind: 'kind', id: 'mcp' },
    ]);
  });

  it('returns just the three kind chips when no runtimes are detected', () => {
    expect(chips([])).toEqual([
      { kind: 'kind', id: 'skill' },
      { kind: 'kind', id: 'plugin' },
      { kind: 'kind', id: 'mcp' },
    ]);
  });
});

describe('isChipSelected', () => {
  it('checks the matching dimension only', () => {
    const rt = new Set(['codex']);
    const kd = new Set<Kind>(['skill']);
    expect(isChipSelected({ kind: 'runtime', id: 'codex' }, rt, kd)).toBe(true);
    expect(isChipSelected({ kind: 'runtime', id: 'claude-code' }, rt, kd)).toBe(false);
    expect(isChipSelected({ kind: 'kind', id: 'skill' }, rt, kd)).toBe(true);
    expect(isChipSelected({ kind: 'kind', id: 'mcp' }, rt, kd)).toBe(false);
  });
});

describe('toggleChip', () => {
  it('adds a missing id and removes a present one, in the correct dimension', () => {
    const rt0 = new Set<string>();
    const kd0 = new Set<Kind>();

    const added = toggleChip({ kind: 'runtime', id: 'codex' }, rt0, kd0);
    expect([...added.runtimes]).toEqual(['codex']);
    expect([...added.kinds]).toEqual([]);

    const removed = toggleChip({ kind: 'runtime', id: 'codex' }, added.runtimes, added.kinds);
    expect([...removed.runtimes]).toEqual([]);

    const addKind = toggleChip({ kind: 'kind', id: 'plugin' }, rt0, kd0);
    expect([...addKind.kinds]).toEqual(['plugin']);
    expect([...addKind.runtimes]).toEqual([]);
  });

  it('returns new sets without mutating the inputs', () => {
    const rt = new Set(['codex']);
    const kd = new Set<Kind>(['skill']);
    const out = toggleChip({ kind: 'runtime', id: 'claude-code' }, rt, kd);
    expect(out.runtimes).not.toBe(rt);
    expect(out.kinds).not.toBe(kd);
    expect([...rt]).toEqual(['codex']); // input untouched
    expect([...out.runtimes].sort()).toEqual(['claude-code', 'codex']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- filterChips`
Expected: FAIL — `Failed to resolve import "../src/render/ink/filterChips.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/render/ink/filterChips.ts`:

```ts
/**
 * Pure model for the dashboard filter bar: the chip list (detected runtimes,
 * then kinds) and immutable toggling of the two filter sets. The component and
 * App wiring stay thin; this is the testable core.
 */
import type { Runtime, Kind } from '../../types.js';

export type Chip = { kind: 'runtime'; id: Runtime } | { kind: 'kind'; id: Kind };

const KINDS: Kind[] = ['skill', 'plugin', 'mcp'];

/** Linear chip list: detected runtimes (given order) first, then skill/plugin/mcp. */
export function chips(detected: Runtime[]): Chip[] {
  return [
    ...detected.map((id): Chip => ({ kind: 'runtime', id })),
    ...KINDS.map((id): Chip => ({ kind: 'kind', id })),
  ];
}

/** Is this chip currently selected, given the two filter sets? */
export function isChipSelected(c: Chip, runtimes: ReadonlySet<Runtime>, kinds: ReadonlySet<Kind>): boolean {
  return c.kind === 'runtime' ? runtimes.has(c.id) : kinds.has(c.id);
}

/** Flip the chip in its own dimension; returns NEW sets (immutable). */
export function toggleChip(
  c: Chip,
  runtimes: ReadonlySet<Runtime>,
  kinds: ReadonlySet<Kind>,
): { runtimes: Set<Runtime>; kinds: Set<Kind> } {
  const rt = new Set(runtimes);
  const kd = new Set(kinds);
  if (c.kind === 'runtime') {
    if (rt.has(c.id)) rt.delete(c.id);
    else rt.add(c.id);
  } else {
    if (kd.has(c.id)) kd.delete(c.id);
    else kd.add(c.id);
  }
  return { runtimes: rt, kinds: kd };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- filterChips`
Expected: PASS — all `filterChips.test.ts` cases green.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/render/ink/filterChips.ts test/filterChips.test.ts
git commit -m "$(cat <<'EOF'
Add filterChips.ts: pure chip model + immutable toggle (E1)

Chip list (detected runtimes then skill/plugin/mcp), selection check, and
dimension-correct immutable toggle. Fully unit-tested.

Claude-Session: https://claude.ai/code/session_01WN9NzXeQZVBH3uTBFweNtC
EOF
)"
```

---

### Task 2: Wire the filter bar into the dashboard (FilterBar + App + views)

**Files:**
- Create: `src/render/ink/FilterBar.tsx`
- Modify: `src/render/ink/App.tsx` (full replace)
- Modify: `src/render/ink/FoldersView.tsx`, `src/render/ink/GlobalView.tsx`, `src/render/ink/LeaderboardView.tsx` (each: `inputActive` prop → `useInput` `isActive`; bump `CHROME` by 1 for the new bar row)

**Interfaces:**
- Consumes: `chips`, `toggleChip`, `Chip`, `isChipSelected` from `./filterChips.js`; `clampIndex` from `./scroll.js`; `filterInventory` from `../../filter.js`; `Runtime`/`Kind` from `../../types.js`.
- Produces: no exported API change — `App({ homeRoot, opts, filter, initial })` is still what `runWatch` renders; the views keep their existing call sites (the new `inputActive` prop defaults to `true`).

UI integration; per repo convention components are not unit-tested. Gated by `npm run typecheck`, the full `npm test` suite staying green, a clean `npm run build`, and a manual dashboard smoke (controller performs the interactive run).

- [ ] **Step 1: Create `FilterBar.tsx`**

Create `src/render/ink/FilterBar.tsx`:

```tsx
import { Box, Text } from 'ink';
import type { Runtime, Kind } from '../../types.js';
import { type Chip, isChipSelected } from './filterChips.js';

function ChipText({
  chip,
  index,
  selected,
  cursor,
  filtering,
}: {
  chip: Chip;
  index: number;
  selected: boolean;
  cursor: number;
  filtering: boolean;
}) {
  const onCursor = filtering && index === cursor;
  const marker = selected ? '●' : '○';
  return (
    <Text inverse={onCursor} color={selected ? 'cyan' : undefined} dimColor={!selected && !onCursor}>
      {` ${marker}${chip.id}`}
    </Text>
  );
}

/**
 * One-row filter bar under the tab row. Runtime chips then kind chips; selected
 * chips render bright (●), unselected dim (○). While `filtering`, the chip at
 * `cursor` renders inverse. An empty set for a group shows a dim "(all)" tag.
 */
export function FilterBar({
  chips,
  runtimes,
  kinds,
  cursor,
  filtering,
}: {
  chips: Chip[];
  runtimes: Set<Runtime>;
  kinds: Set<Kind>;
  cursor: number;
  filtering: boolean;
}) {
  const runtimeChips = chips.filter((c) => c.kind === 'runtime');
  const kindChips = chips.filter((c) => c.kind === 'kind');
  const active = runtimes.size > 0 || kinds.size > 0;
  const hint = filtering
    ? '   ←→ move · space toggle · a clear · esc done'
    : active
      ? '   f filter'
      : '   f filter · showing all';

  return (
    <Box>
      <Text dimColor>{filtering ? 'FILTER' : 'filter'} </Text>
      <Text dimColor>runtimes{runtimes.size === 0 ? ' (all)' : ''}</Text>
      {runtimeChips.map((c, i) => (
        <ChipText
          key={`r:${c.id}`}
          chip={c}
          index={i}
          selected={isChipSelected(c, runtimes, kinds)}
          cursor={cursor}
          filtering={filtering}
        />
      ))}
      <Text dimColor>   kinds{kinds.size === 0 ? ' (all)' : ''}</Text>
      {kindChips.map((c, i) => (
        <ChipText
          key={`k:${c.id}`}
          chip={c}
          index={runtimeChips.length + i}
          selected={isChipSelected(c, runtimes, kinds)}
          cursor={cursor}
          filtering={filtering}
        />
      ))}
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
```

Note: the `index` passed matches `chips()` ordering (runtime chips `0..R-1`, kind chips `R..R+2`), so `cursor` from `App` lines up. The bar has no `marginBottom` (the views' `CHROME` is bumped by 1 in Step 3 to account for this single new row).

- [ ] **Step 2: Replace `App.tsx`**

Replace the entire contents of `src/render/ink/App.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import chokidar from 'chokidar';
import type { Inventory, Runtime, Kind } from '../../types.js';
import { scan, type ScanOptions } from '../../index.js';
import { filterInventory, type FilterOptions } from '../../filter.js';
import { computeWatchPaths } from './watchpaths.js';
import { clampIndex } from './scroll.js';
import { chips as buildChips, toggleChip } from './filterChips.js';
import { Header } from './Header.js';
import { TabBar, type TabId } from './TabBar.js';
import { FilterBar } from './FilterBar.js';
import { FoldersView } from './FoldersView.js';
import { GlobalView } from './GlobalView.js';
import { LeaderboardView } from './LeaderboardView.js';

const TABS: TabId[] = ['folders', 'global', 'leaderboard'];

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
  const [runtimes, setRuntimes] = useState<Set<Runtime>>(() => new Set(filter.runtimes ?? []));
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(filter.kinds ?? []));
  const [filtering, setFiltering] = useState(false);
  const [cursor, setCursor] = useState(0);
  const { exit } = useApp();

  const inv = filterInventory(raw, { runtimes: [...runtimes], kinds: [...kinds] });
  const chipList = buildChips(raw.runtimesDetected);

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
    if (input === '1') setTab('folders');
    if (input === '2') setTab('global');
    if (input === '3') setTab('leaderboard');
    if (key.tab && !key.shift) setTab((t) => TABS[(TABS.indexOf(t) + 1) % TABS.length]!);
    if (key.tab && key.shift) setTab((t) => TABS[(TABS.indexOf(t) + TABS.length - 1) % TABS.length]!);
  });

  useInput(
    (input, key) => {
      if (key.escape || key.return || input === 'f') {
        setFiltering(false);
        return;
      }
      if (key.leftArrow || input === 'h') {
        setCursor((c) => clampIndex(c - 1, chipList.length));
        return;
      }
      if (key.rightArrow || input === 'l') {
        setCursor((c) => clampIndex(c + 1, chipList.length));
        return;
      }
      if (input === ' ') {
        const chip = chipList[clampIndex(cursor, chipList.length)];
        if (chip) {
          const next = toggleChip(chip, runtimes, kinds);
          setRuntimes(next.runtimes);
          setKinds(next.kinds);
        }
        return;
      }
      if (input === 'a') {
        setRuntimes(new Set());
        setKinds(new Set());
      }
    },
    { isActive: filtering },
  );

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
      <FilterBar chips={chipList} runtimes={runtimes} kinds={kinds} cursor={cursor} filtering={filtering} />
      {tab === 'folders' ? <FoldersView inv={inv} inputActive={!filtering} /> : null}
      {tab === 'global' ? <GlobalView inv={inv} inputActive={!filtering} /> : null}
      {tab === 'leaderboard' ? <LeaderboardView inv={inv} inputActive={!filtering} /> : null}
    </Box>
  );
}
```

- [ ] **Step 3: Gate each view's input + bump CHROME**

Three small edits per view. Apply each exactly.

**`src/render/ink/FoldersView.tsx`:**

(a) Bump CHROME — change:
```tsx
const CHROME = 11;
```
to:
```tsx
const CHROME = 12;
```

(b) Add the prop — change:
```tsx
export function FoldersView({ inv }: { inv: Inventory }) {
```
to:
```tsx
export function FoldersView({ inv, inputActive = true }: { inv: Inventory; inputActive?: boolean }) {
```

(c) Gate the input — change:
```tsx
    setNav((s) => folderNav(s, action, { folderRows, rows }));
  });
```
to:
```tsx
    setNav((s) => folderNav(s, action, { folderRows, rows }));
  }, { isActive: inputActive });
```

**`src/render/ink/GlobalView.tsx`:**

(a) Change `const CHROME = 8;` to `const CHROME = 9;`

(b) Change:
```tsx
export function GlobalView({ inv }: { inv: Inventory }) {
```
to:
```tsx
export function GlobalView({ inv, inputActive = true }: { inv: Inventory; inputActive?: boolean }) {
```

(c) Change:
```tsx
    if (key.return || key.rightArrow) setDetail(true);
  });
```
to:
```tsx
    if (key.return || key.rightArrow) setDetail(true);
  }, { isActive: inputActive });
```

**`src/render/ink/LeaderboardView.tsx`:**

(a) Change `const CHROME = 12;` to `const CHROME = 13;`

(b) Change:
```tsx
export function LeaderboardView({ inv }: { inv: Inventory }) {
```
to:
```tsx
export function LeaderboardView({ inv, inputActive = true }: { inv: Inventory; inputActive?: boolean }) {
```

(c) Change:
```tsx
    if (key.return || key.rightArrow) setDetail(true);
  });
```
to:
```tsx
    if (key.return || key.rightArrow) setDetail(true);
  }, { isActive: inputActive });
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all files green (the prior 106 plus the new `filterChips.test.ts` cases). No existing test references the changed view signatures (the new prop is optional).

- [ ] **Step 6: Build and manual smoke check**

Run: `npm run build`
Expected: clean build, no type errors.

Manual check (interactive TUI — confirm visually):

Run: `npx tsx src/cli.ts`
Expected:
- A `filter … runtimes … kinds …` bar appears under the tab row, showing `(all)` for both groups initially.
- `f` enters filter mode (the bar shows `FILTER` + the `←→ move · space toggle · a clear · esc done` hint); arrow keys move the cursor (inverse) across runtime then kind chips.
- `Space` toggles the cursored chip (it turns bright `●`); the Folders tree counts / Global list / Leaderboard shrink to match, live.
- `a` clears all chips back to `(all)` (everything shown again).
- `Esc` / `f` exits filter mode; the view's keys work again; tab switching (`1/2/3`) and `q` work throughout.

- [ ] **Step 7: Commit**

```bash
git add src/render/ink/FilterBar.tsx src/render/ink/App.tsx src/render/ink/FoldersView.tsx src/render/ink/GlobalView.tsx src/render/ink/LeaderboardView.tsx
git commit -m "$(cat <<'EOF'
Add interactive filter bar: runtime + kind chips (E1)

App holds filter state (seeded from CLI), applies filterInventory live, and a
`f`-toggled filter mode owns the chips while views' input is gated via Ink
useInput isActive. New FilterBar renders the two chip groups; views gain an
inputActive prop and a +1 CHROME bump for the new bar row.

Claude-Session: https://claude.ai/code/session_01WN9NzXeQZVBH3uTBFweNtC
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- Filter mode via `f`, view input gated by `isActive` → Task 2 (App two `useInput` + `inputActive` props). ✅
- Runtime + kind chips, two groups, linear cursor → Task 1 (`chips`) + Task 2 (FilterBar + cursor). ✅
- Filter state in App, seeded from CLI `filter`, empty = no filter, live `filterInventory` → Task 2 App. ✅
- `←/→` move, `Space` toggle, `a` clear-all, `Esc`/`f`/`Enter` exit → Task 2 filter `useInput`. ✅
- Always-visible bar; empty = "(all)"; selected bright / unselected dim / cursor inverse → Task 2 FilterBar. ✅
- Chips from `runtimesDetected` (invariant under filtering) → Task 2 (`buildChips(raw.runtimesDetected)`). ✅
- Tree counts / GlobalBand / stats re-derive from filtered `inv` → automatic (views read `inv`). ✅
- Non-goals (engine/filter.ts/discovery/plain/json untouched, no deps) → Global Constraints. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every command states expected output. ✅

**3. Type consistency:** `Chip`, `chips`, `isChipSelected`, `toggleChip` defined in Task 1 and consumed with identical signatures in Task 2 (`buildChips` is the local alias for `chips`). `inputActive?: boolean` added to all three views and passed as `{ isActive: inputActive }`. `filterInventory(raw, { runtimes: [...runtimes], kinds: [...kinds] })` matches `FilterOptions`. ✅

**4. Note for the implementer:** Task 2 Step 3 makes three small edits to each of three view files — the `useInput` `});` → `}, { isActive: inputActive });` snippet is the same shape in GlobalView and LeaderboardView, so match each within its own file. The new `inputActive` prop is optional (`= true`), so no other call site breaks.
