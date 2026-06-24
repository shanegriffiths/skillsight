# Design — dashboard shell (Epic A: tabbed navigation)

Date: 2026-06-24
Roadmap items: **A1** (top-level tab nav), **A2** (Global tab), **A3**
(Leaderboard / Stats tab).

## Goal

Turn the single-screen Ink dashboard into a **real interface** with three
top-level views. Today the dashboard shows only the folder list + detail pane and
a one-line GLOBAL count band — the full global inventory and the cross-runtime
usage data the engine already captures are invisible. This phase adds a tab shell
and the two views that surface that data:

- **Folders** — today's screen, unchanged, now living behind tab 1.
- **Global** — the full, scrollable list of globally-inherited skills / plugins /
  MCP (today only a 3-number band).
- **Leaderboard / Stats** — skills ranked by how many runtimes use them, plus a
  summary band (totals, per-runtime, per-provider).

Everything here is **presentation-layer**: `Inventory.global`, `SkillRecord.usedBy`,
and `runtimesDetected` already exist; the leaderboard and stats are compositions
over the existing `mergeBuckets` / `bucketCounts` resolver helpers.

## Decisions (from brainstorming)

- **Full Epic A in one phase** — A1 + A2 + A3 together; the tabs are wasted effort
  without the views they expose.
- **A3 = Leaderboard *and* Stats band** — the ranked list plus aggregate numbers.
- **Tab switching: `1`/`2`/`3` jump + `Tab`/`Shift+Tab` cycle.** `←/→` are left
  **unused**, reserved for Epic F (drill navigation / column focus).
- **Real scrolling now**, not cap-and-count — a small reusable viewport so the
  ~99-item Global list genuinely scrolls; reused by the leaderboard and by Epic F.

## Scope & boundary

- **In scope:** the Ink dashboard only — `src/render/ink/*` and its tests.
- **Out of scope (byte-for-byte unchanged):** `--report` (`src/render/plain.ts`),
  `--json` (`src/render/json.ts`), the engine, adapters, and the resolver. No task
  touches them; the data they emit already carries everything the new views read.
- **Non-TTY path unchanged:** `index.tsx` still falls back to `renderPlain` on a
  non-TTY; the shell is TTY-only.
- **No new runtime or dev dependencies.** Tabs, scrolling, resize-awareness, and
  the table all use Ink (`useInput`, `useWindowSize`, `Box`, `Text`) + React +
  vitest, all already installed.

## Architecture — pure logic, thin components

The repo's established pattern (see `rows.ts` / `rows.test.ts`): all non-trivial
logic lives in **pure, unit-tested** modules; the Ink components are thin and
follow the "components untested" convention.

### New pure modules (unit-tested)

**`src/render/ink/stats.ts`** — aggregations over an `Inventory`:

- `leaderboard(inv: Inventory): ItemRow[]`
  - Build the deduped universe of skills:
    `mergeBuckets(inv.global, ...inv.folders.flatMap(f => [f.projectScoped, f.local]))`.
    `mergeBuckets` already dedupes skills by `contentId` and unions `usedBy`, so a
    skill that appears globally and inside folders is counted once with the full
    runtime set.
  - Run those skills through the existing `itemRows` (reuses the per-kind
    source/`usedBy` resolution already proven for the DetailPane table).
  - Sort by `used` descending, then `name` ascending. Returns `ItemRow[]` (all
    `kind: 'skill'`).
- `summaryStats(inv: Inventory): SummaryStats` where
  ```ts
  interface SummaryStats {
    totals: { skills: number; plugins: number; mcp: number };      // bucketCounts of the deduped universe
    perRuntime: { runtime: Runtime; skills: number }[];            // distinct skills whose usedBy includes the runtime, desc
    perProvider: { kind: Provider['kind']; skills: number }[];     // skill count by provider.kind, desc
  }
  ```
  `perRuntime` iterates `inv.runtimesDetected`; `perProvider` tallies
  `provider.kind` over the deduped skills.

**`src/render/ink/scroll.ts`** — pure viewport math, no React:

- `clampIndex(index: number, length: number): number` — clamp to `[0, length-1]`
  (and `0` when `length === 0`).
- `scrollWindow(length: number, height: number, selected: number): { start: number; end: number }`
  — the visible half-open slice `[start, end)` of `height` rows that keeps
  `selected` in view (selected scrolls the window only at the edges). When
  `height >= length`, returns `{ start: 0, end: length }`.

The `useScroll` hook (same file — it needs no JSX, so it stays in `scroll.ts`)
wraps these: it owns the `selected` state, exposes `moveUp` / `moveDown`, and
computes the window from a `height` argument. Only the pure functions are tested;
the hook is thin glue.

### Components

- **`App.tsx`** (modified — becomes the router) — owns one piece of state,
  `tab: 'folders' | 'global' | 'leaderboard'`. Renders `Header` → `TabBar` → the
  active view → a context-sensitive footer. One `useInput` for **global** keys
  only. Renders **only the active view** (so an inactive view's hooks/`useInput`
  are unmounted).
- **`TabBar.tsx`** (new) — presentational. `Folders · Global · Leaderboard` with
  the active tab highlighted (`inverse`) and the `1/2/3` hints dimmed.
- **`FoldersView.tsx`** (new) — today's screen extracted verbatim: `GlobalBand` +
  `FolderList` + `DetailPane`. Owns the folder `selected` index and its own
  `useInput` (`↑/↓` `j/k`). `GlobalBand` moves here — it's folder-tab context
  ("+N over the inherited global layer"), redundant on the other tabs.
- **`GlobalView.tsx`** (new, A2) — a scrollable `ItemTable` over
  `itemRows(inv.global)`, with a `[12–31 of 99]` position line. Owns a `useScroll`
  and its own `useInput` (`↑/↓` `j/k`).
- **`LeaderboardView.tsx`** (new, A3) — a scrollable `ItemTable` over
  `leaderboard(inv)` (NAME / USED / SOURCE; `showKind` off since every row is a
  skill) **plus** a `StatsBand` rendering `summaryStats(inv)`. Owns a `useScroll`
  over the leaderboard rows.
- **`ItemTable.tsx`** (new) — the aligned KIND/NAME/USED/SOURCE cell layout,
  extracted from `DetailPane` so Detail, Global, and Leaderboard share one table.
  Props: `rows: ItemRow[]` (already windowed by the caller) + `showKind?: boolean`.
  Renders a header row + the given rows; the caller owns slicing and the position
  indicator (ItemTable stays dumb).
- **`DetailPane.tsx`** (modified) — refactored to render its section header +
  `<ItemTable rows={itemRows(bucket).slice(0, 20)} />`. **Output is unchanged**
  (same columns, same cap-at-20, same "…and N more" line); this is a DRY
  extraction, not a behaviour change.

### Resize-aware viewport height

Scroll height is derived from the **terminal height**, which must stay correct
when the window is resized. Use Ink's built-in **`useWindowSize()`** (returns
`{ columns, rows }` and re-renders on `stdout` `'resize'`):

```
viewportHeight = max(3, useWindowSize().rows - CHROME)
```

where `CHROME` accounts for the header, tab bar, footer, and (on the leaderboard)
the stats band. **Do not** read `process.stdout.rows` during render — on resize
Ink only recomputes Yoga width and repaints; it does **not** re-invoke components,
so that value would go stale. `useWindowSize` is the correct, resize-reactive
source. (Verified against installed source — see appendix.)

## Input model & keymap

Ink delivers every keypress to **all** mounted `useInput` handlers independently
(they are separate listeners on a shared emitter; none consumes the event). So the
global handler and the active view's handler coexist with **disjoint keys**:

| Context | Keys | Action |
|---|---|---|
| Global (`App`, always mounted) | `1` / `2` / `3` | jump to Folders / Global / Leaderboard |
| | `Tab` / `Shift+Tab` | cycle tabs forward / back |
| | `Esc` | return to the Folders tab |
| | `q` / `Ctrl+C` | quit |
| Folders view | `↑/↓` `j/k` | move folder selection |
| Global view | `↑/↓` `j/k` | scroll the global list |
| Leaderboard view | `↑/↓` `j/k` | scroll the leaderboard |

`←/→` are intentionally unbound everywhere — reserved for Epic F.

Raw mode is safe across view unmounts: Ink ref-counts `setRawMode`
(`rawModeEnabledCount`), so a view's `useInput` cleanup decrements the count but
raw mode stays enabled while `App`'s handler is mounted.

`Tab`/`Shift+Tab`/`Esc` are free to use: Ink's focus manager registers a separate
input listener but **early-returns when there are zero focusable components**, and
this design uses **no `useFocus`**. So Ink's focus handling is a permanent no-op
and never swallows those keys.

## Data flow

```
scan() → Inventory (raw)
      → filterInventory(raw, filter)   [App already does this]
      → inv
         ├─ Folders     : inv.folders            → FolderList / DetailPane
         ├─ Global      : inv.global             → itemRows → ItemTable (windowed)
         └─ Leaderboard : leaderboard(inv)       → ItemTable (windowed)
                          summaryStats(inv)       → StatsBand
```

The live file-watch / rescan loop in `App.tsx` is untouched: it keeps updating
`raw`; all three views read from the recomputed `inv`, so they stay live.

## Testing

- **`test/stats.test.ts`** (new) — `leaderboard`: descending-by-`used` then
  name order; dedup so a skill present globally *and* in a folder counts once with
  unioned `usedBy`; empty inventory → `[]`. `summaryStats`: `totals` match a known
  fixture; `perRuntime` counts distinct skills per runtime and sorts desc;
  `perProvider` tallies by `provider.kind`.
- **`test/scroll.test.ts`** (new) — `scrollWindow`: window at top, mid-list, and
  bottom; `height >= length` returns the whole list; `length === 0` is safe.
  `clampIndex`: below 0, above `length-1`, and empty list.
- **Components untested** per repo convention. **Optional final task:** a
  `renderToString` smoke test for `TabBar` + `GlobalView` (same opt-in esbuild
  `jsx: 'automatic'` tweak the quick-wins plan documented for Task 4).

## File summary

- **Create:** `stats.ts`, `scroll.ts`, `TabBar.tsx`, `FoldersView.tsx`,
  `GlobalView.tsx`, `LeaderboardView.tsx`, `ItemTable.tsx`, `test/stats.test.ts`,
  `test/scroll.test.ts`.
- **Modify:** `App.tsx` (tab router + global keymap), `DetailPane.tsx` (consume
  `ItemTable`).

## Deferred / out of scope (future epics)

- Persisting scroll position across tab switches — each view resets to top on
  re-mount for now (simple; easy to lift state into `App` later).
- Per-runtime filtering of the leaderboard (E1), icons/glyphs (D1), plugin
  grouping (C1), folder tree (B1), drill-into-folder navigation (Epic F) — all
  build on this shell but are separate phases.
- Plugins/MCP do not carry a `usedBy` metric, so the leaderboard ranks **skills
  only** by design; the stats `totals` still count plugins and MCP.

---

## Appendix — verified against Ink v7.1.0 (disk) + official README

Every Ink API this design relies on was checked against the installed source under
`node_modules/ink/build` **and** the official README, in two passes:

| Claim | Verdict | Evidence |
|---|---|---|
| `useInput(handler, { isActive })` | ✅ | `hooks/use-input.js`; README ("multiple `useInput` hooks used at once") |
| Multiple `useInput` coexist, none swallows input | ✅ | independent listeners on `internal_eventEmitter`; README |
| `setRawMode` ref-counted (view-unmount safe) | ✅ | `components/App.js:32` `rawModeEnabledCount`; disabled only at 0 |
| `key.tab` / `key.shift` present | ✅ | `hooks/use-input.js`; README |
| `Shift+Tab` detectable | ✅ | `parse-keypress.js` `'[Z' → 'tab'` + `isShiftKey('[Z')` ⇒ `tab && shift` |
| `Tab` / `Esc` not consumed by focus manager | ✅ | `components/App.js:371` early-returns with 0 focusables; this design uses no `useFocus` |
| `useWindowSize() → { columns, rows }`, re-renders on resize | ✅ | `hooks/use-window-size.js` (`useState` + `stdout.on('resize')`); README |
| `renderToString` exported | ✅ | `index.d.ts:4` |
| No new dependency required | ✅ | `useWindowSize`, `useInput`, `measureElement` are built-in exports |

**Corrected during review:** an earlier draft sized the viewport from
`process.stdout.rows` read during render and assumed a resize re-renders
components. It does not — Ink's `resized()` recomputes Yoga **width** and repaints
without re-invoking components. Fixed to use `useWindowSize()`, which is
purpose-built to re-render on resize.
