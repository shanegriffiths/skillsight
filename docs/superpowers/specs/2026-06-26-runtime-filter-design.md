# Design — interactive runtime + kind filter (Epic E: E1)

Date: 2026-06-26
Roadmap item: **E1** (in-dashboard runtime filter — toggle chips to filter by
runtime live, reusing `filterInventory`). Extended this phase to also include
**kind** chips (skill/plugin/mcp), since `filterInventory` already ANDs runtime +
kind at no extra engine cost.

## Goal

The engine has always supported `--runtime` / `--kind` filtering, but only as a
one-shot CLI flag baked in at launch. This phase makes it **interactive**: a
filter bar of toggle chips under the tab row that narrows skills/plugins/mcp live
across every tab. It completes the last named pillar of the v0.2 theme — "making
the dashboard a real interface — navigation, grouping, richer presentation, and
**interactive filtering/sorting**."

Everything here is **presentation-layer**. `filterInventory(inv, { runtimes,
kinds })` already exists, is pure, and ANDs the two dimensions (skills by `usedBy`
intersection, plugins/mcp by producing runtime; kinds select which kinds appear).
Because filtering narrows the buckets, the **B1 folder-tree counts, the GlobalBand,
and the Leaderboard stats all re-derive from the filtered inventory for free**.

## Decisions (from brainstorming)

- **Interaction = a `f`-toggled filter mode.** `f` focuses the filter bar; while
  focused, every view's input is gated off via Ink's `useInput(handler, {
  isActive })`, and the bar owns `←/→` (move chip cursor), `Space` (toggle),
  `a` (clear all), `Esc`/`f`/`Enter` (exit). Chosen over always-live hotkeys
  (collide with `1/2/3` tabs and runtime initials clash) and a single-cycle
  toggle (can't show two runtimes at once).
- **Scope = runtimes + kinds.** Two chip groups in one linear list: runtime chips
  (in `runtimesDetected` order) then `skill · plugin · mcp`.
- **Filter state lives in `App`**, seeded from the CLI `filter` prop; empty set =
  no filter on that dimension. The existing `filterInventory(raw, …)` call is
  unchanged except its argument now comes from state.
- **Bar is always visible** (not only in filter mode) — discoverability plus a
  persistent view of what's currently narrowed.
- **`a` = clear all** (reset both dimensions to "everything"), not select-all.
- **Empty set renders as "(all)"** for that group (neutral/dim); a non-empty set
  renders selected chips bright, unselected dim. The cursor is shown independently
  (inverse), so cursor and selection read separately.

## Scope & boundary

- **In scope:** the Ink dashboard — a new `src/render/ink/filterChips.ts` (pure)
  and `FilterBar.tsx`, plus `App.tsx` and the three view components, and tests.
- **Out of scope (byte-for-byte unchanged):** the engine, adapters, resolver,
  `discovery.ts`, `filter.ts` (`filterInventory` is reused as-is), `plain.ts`,
  `json.ts`. The CLI `--runtime`/`--kind` flags stay; they now seed the dashboard's
  initial filter state (the non-TTY plain path still applies the filter once, as
  today).
- **No new runtime or dev dependencies.** `useInput`'s `isActive` option and all
  keys are built-in Ink.

## State & data flow

`App` owns four pieces of state:

```ts
const [runtimes, setRuntimes] = useState<Set<Runtime>>(() => new Set(filter.runtimes ?? []));
const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(filter.kinds ?? []));
const [filtering, setFiltering] = useState(false);
const [cursor, setCursor] = useState(0);
```

The inventory pipeline becomes:

```ts
const inv = filterInventory(raw, { runtimes: [...runtimes], kinds: [...kinds] });
```

(identical to today's call; the argument is now state, not a static prop). The chip
model is built from `raw.runtimesDetected` (detection is invariant under filtering,
so chips never disappear):

```
chips = [ {runtime}×N  ,  {kind:'skill'}, {kind:'plugin'}, {kind:'mcp'} ]
```

Filtering narrows `global` / `projectScoped` / `local` / `effective` buckets, so all
three tabs and the folder tree recompute from `inv` with no further wiring.

## Interaction & keymap

`filtering` drives a single boolean that gates view input. Each view's `useInput`
gains `{ isActive: inputActive }`; `App` passes `inputActive={!filtering}`.

| Context | Keys | Action |
|---|---|---|
| **Browse** — `App` main `useInput` (always active) | `1`/`2`/`3` · `Tab`/`Shift+Tab` · `q` | tabs / cycle / quit (unchanged) |
| | `f` | enter filter mode (guarded `if (!filtering)`) |
| **Filter mode** — `App` filter `useInput` (`isActive={filtering}`) | `←/→` `h/l` | move chip cursor (`clampIndex` over `chips.length`) |
| | `Space` | toggle the cursored chip via `toggleChip` |
| | `a` | clear all filters (both sets → empty) |
| | `Esc` / `f` / `Enter` | exit filter mode (selections kept) |
| **Views** (`isActive={!filtering}`) | (unchanged) | suppressed entirely while filtering |

Two `useInput` handlers coexist in `App` (verified pattern — Ink delivers input to
all active listeners). The main one only reads `q`/digits/`Tab`/`f`-when-not-
filtering, so it never contends with the filter handler's `←/→/Space/a/Esc`. Tabs
remain switchable while filtering (the bar persists and applies to the new tab).

## Pure module — `filterChips.ts` (unit-tested)

```ts
import type { Runtime, Kind } from '../../types.js';

export type Chip = { kind: 'runtime'; id: Runtime } | { kind: 'kind'; id: Kind };

const KINDS: Kind[] = ['skill', 'plugin', 'mcp'];

/** Linear chip list: detected runtimes first (given order), then skill/plugin/mcp. */
export function chips(detected: Runtime[]): Chip[];

/** Is this chip currently selected, given the two filter sets? */
export function isChipSelected(c: Chip, runtimes: ReadonlySet<Runtime>, kinds: ReadonlySet<Kind>): boolean;

/** Flip the chip in its dimension; returns NEW sets (immutable). */
export function toggleChip(
  c: Chip,
  runtimes: ReadonlySet<Runtime>,
  kinds: ReadonlySet<Kind>,
): { runtimes: Set<Runtime>; kinds: Set<Kind> };
```

Cursor motion reuses `scroll.ts`'s `clampIndex`. This module is the testable core;
the component and `App` wiring stay thin.

## Components

- **`FilterBar.tsx`** (new) — one row under the `TabBar`. Props:
  `{ chips: Chip[]; runtimes: Set<Runtime>; kinds: Set<Kind>; cursor: number; filtering: boolean }`.
  Renders the runtime group then the kind group. Per chip: selected → bright
  (`●name`), unselected → dim (`○name`); when a group's set is empty it shows a dim
  `(all)` tag. While `filtering`, the chip at `cursor` renders `inverse` (the
  cursor), and a trailing hint `←→ move · space toggle · a clear · esc done`
  appears; while browsing, a `f filter` hint and a `(showing all)` / active-filter
  indicator appear instead.
- **`App.tsx`** (modify) — add the four state hooks; build `chips(raw.runtimesDetected)`;
  add the filter `useInput` (`isActive={filtering}`) and the `f`-enter branch to the
  main `useInput`; render `<FilterBar … />` between `<TabBar />` and the views; pass
  `inputActive={!filtering}` to each view.
- **`FoldersView.tsx` / `GlobalView.tsx` / `LeaderboardView.tsx`** (modify) — accept
  `inputActive?: boolean` (default `true`) and pass `{ isActive: inputActive }` as
  the second argument to their existing single `useInput`. No other change.

## Display semantics

`runtimes` empty ⇒ all runtimes shown (group tag `(all)`). `kinds` empty ⇒ all kinds
shown. A non-empty set narrows that dimension; the two AND together (e.g.
`kinds={skill}`, `runtimes={codex}` ⇒ only skills used by codex). Selecting every
chip in a group is equivalent to selecting none (both mean "all") — `toggleChip`
makes no attempt to collapse that; it is harmless and matches `filterInventory`
(`runtimeSet`/`kindSet` are only built when the array is non-empty).

ASCII sketch — filter mode, cursor on `codex`, runtimes `{claude-code, codex}`,
kinds all:

```
1 Folders   2 Global   3 Leaderboard
filter ▸ runtimes ●claude-code [●codex] ○hermes ○cursor   kinds (all) ○skill ○plugin ○mcp    ←→ move · space toggle · a clear · esc done
```

Browse mode, no filter active:

```
filter (f) ▸ runtimes claude-code codex hermes cursor   kinds skill plugin mcp                  (showing all)
```

## Testing

- **`test/filterChips.test.ts`** (new):
  - `chips()` order — runtimes (input order) then exactly `skill, plugin, mcp`;
    empty `detected` ⇒ just the three kind chips.
  - `toggleChip` — adds a missing id and removes a present one in the correct
    dimension; returns **new** sets (input sets untouched); a runtime chip never
    touches `kinds` and vice-versa.
  - `isChipSelected` — true iff the id is in the matching set; respects dimension.
- `clampIndex` (cursor) is already covered in `scroll.test.ts`.
- **Components untested** per repo convention (no ink-testing-library). Validated by
  a real-disk smoke: build `chips()` over the live `runtimesDetected`, toggle a
  runtime and a kind, and confirm `filterInventory` narrows counts as expected
  (folder-tree totals, global list, leaderboard) and that an empty set restores all.

## File summary

- **Create:** `src/render/ink/filterChips.ts`, `src/render/ink/FilterBar.tsx`,
  `test/filterChips.test.ts`.
- **Modify:** `src/render/ink/App.tsx` (filter state + chips + filter `useInput` +
  `f` + render FilterBar + `inputActive` props), `FoldersView.tsx`,
  `GlobalView.tsx`, `LeaderboardView.tsx` (each: `inputActive` prop → `useInput`
  `isActive`).
- **Remove:** nothing.

## Deferred / out of scope (future)

- Persisting filter state across tab switches is already automatic (state lives in
  `App`, which stays mounted); no work needed.
- Kind chips were folded in here; no further filter dimensions (scope, provider)
  this phase — add later if a need appears.
- Surfacing the active filter in `--report`/`--json` beyond today's CLI flags.

---

## Appendix — verified against the codebase (2026-06-26)

| Claim | Verdict | Evidence |
|---|---|---|
| `filterInventory(inv, {runtimes,kinds})` is pure and ANDs the dimensions | ✅ | `src/filter.ts:14–49` |
| App already applies the filter in its render body | ✅ | `src/render/ink/App.tsx:32` (`filterInventory(raw, filter)`) |
| Each view has exactly one `useInput` to gate | ✅ | `FoldersView.tsx:43`, `GlobalView.tsx:18`, `LeaderboardView.tsx:34` |
| `useInput` accepts `{ isActive }` to suppress a handler | ✅ | Ink v7 `useInput(handler, options?: { isActive?: boolean })` |
| Multiple `useInput` handlers coexist without swallowing input | ✅ | shell audit (Epic A/F): independent listeners on Ink's input emitter |
| `runtimesDetected` is invariant under filtering | ✅ | `src/index.ts` sets it from active adapters; `filterInventory` never touches it |
| `f` is unused by existing keymaps | ✅ | App uses `q`/`1`/`2`/`3`/`Tab`; views use arrows/`j`/`k`/`Enter`/`Esc`; Folders adds `s`/`.` |
| Detected runtime ids | ✅ | adapters: `claude-code`, `codex`, `hermes`, `gemini`, `cursor`, `opencode` |
