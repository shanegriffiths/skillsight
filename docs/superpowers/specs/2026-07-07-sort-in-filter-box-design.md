# Sort control in the filter box

**Date:** 2026-07-07
**Status:** approved

## Problem

The only interactive sort lives on the Folders tab (`s` toggles the folder
column between `items`/`name`), surfaced in the bottom key-hint footer. The three
item-list tabs — Project Scope, User Scope, Leaderboard — are pre-ranked with no
way to re-sort. We want a single sort control, relocated into the filter box as a
row above `filter`, and item-sort wired into all three item tabs.

Filtering already works on every tab (applied globally to `inv`); no change there
beyond the chips keeping their place in the box.

## Design

### Box layout

`FilterBar` gains a `sort` row at the top, same 10-col label alignment as the
other rows. Height `FILTER_BAR_HEIGHT` 5 → 6 (all three views import the constant
for scroll math, so it cascades).

```
┌──────────────────────────────────────┐
│ sort      (s) · reach                 │
│ filter    (f) · showing all           │
│ runtimes  (all)  ○ (C) Claude Code …  │
│ kinds     (all)  ○ skill  ○ plugin …  │
└──────────────────────────────────────┘
```

### Per-tab native ⇄ name toggle

`s` toggles the active tab between its native order and alphabetical:

| Tab           | native label | toggles to |
|---------------|--------------|------------|
| Leaderboard   | `reach`      | `name`     |
| Project Scope | `footprint`  | `name`     |
| User Scope    | `default`    | `name`     |
| Folders       | `items`      | `name` (existing folder-column sort, untouched) |

Sort state is **per-tab** (each view owns its own), so switching tabs restores
that tab's mode and each tab keeps its meaningful default.

### Sort composes with grouping

The lists are grouped (plugin groups, source groups). Sort runs **after**
grouping and reorders the **top-level units**: a group header carries its
children, children sort by name within the group. Sorting the Leaderboard by
name places the `heygen-com/hyperframes` group under **H** (by its own label),
children alphabetised inside. Native mode is the existing order untouched
(identity — no risk to current behaviour).

One shared pure function: `sortGroupedByName(rows)` — partition into
header+children units, sort children by name, sort units by head name, flatten.

### State & wiring

- New `sortRows.ts` — `sortGroupedByName(rows: ItemRow[]): ItemRow[]` (pure, tested).
- New `useItemSort(nativeLabel)` hook — holds `'native' | 'name'`, returns
  `{ label, apply, handleKey }`. `apply(rows)` = identity in native mode,
  `sortGroupedByName` in name mode. `handleKey('s')` toggles and returns handled.
  Resets the owning view's selection to top on toggle.
- `RankedView` + `GlobalView` adopt the hook; `RankedView` takes a
  `nativeSortLabel` prop (`reach` / `footprint`). Each reports its active label up
  via a callback (the existing `onControls` header pattern) so the app-level
  `FilterBar` renders it.
- `FoldersView` keeps its own sort; reports its label (`items` / `name`) up too.
- `App` holds the reported `sortLabel` and passes it to `FilterBar`.
- `s` stays inside each view's `useInput` (gated by `!filtering`), so no key
  conflicts and no tab-dispatch in `App`.

## Testing

- `sortRows.test.ts`: units reorder by head name; children sort within a group;
  lone leaves interleave; collapsed headers (no children) place by name; native
  input returned unchanged when not name-sorted.
- Extend view-level behaviour where cheap; the pure function carries the weight.

## Out of scope

- Folders item-sort (its detail item list) — folder-column sort stays as-is.
- Additional sort keys (footprint/reach as explicit cycle) — native ⇄ name only.
