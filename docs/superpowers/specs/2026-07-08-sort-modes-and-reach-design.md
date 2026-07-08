# Extra sort modes, label renames, and an honest reach metric

**Date:** 2026-07-08
**Status:** approved

## 1. Reach metric (correctness)

`used` is runtime reach (how many runtimes have the skill available), not an
invocation count — skillsight is a static file inventory. It was also inflated:
`resolve.ts` credited every shared-store skill with the lock's
`lastSelectedAgents` (universal, hub-direct agents), a flat bonus on every hub
skill. ChartLI read 14 (1 real symlink + 13 universal) despite never being used.

- Drop `universalUsedBy` from `enrichBucket` + `sharedStoreBucket`; remove the
  `UNIVERSAL` set, the function, and `EnrichContext.lastSelectedAgents`
  (+ the assignment in `index.ts`). `reach` = only runtimes that symlink the
  skill. ChartLI → 1.
- Rename the leaderboard column header `USED` → `REACH` (`ItemTable.tsx`). The
  sort label is already `reach`.
- Tradeoff (accepted): hub-direct agents (warp/zed/cline/deepagents…) no longer
  appear in reach/RUNTIMES.

## 2. Label renames (labels match their column)

- `footprint` → `locations` (it's `locations.length`).
- `default` (User Scope native) → `grouped`.
- Every sort label names its column: `name`, `locations`, `reach`, `kind`,
  `scope`, `visibility`, `enabled`, `grouped`.

## 3. `s` cycles a per-tab list of sort modes

`s` cycles the tab's modes (wraps to native), instead of a 2-state toggle.

| Tab | cycle (native first) |
|-----|----------------------|
| Leaderboard | reach → name → enabled → kind |
| Project Scope | locations → name → enabled → scope → kind |
| User Scope | grouped → name → enabled → visibility → scope → kind |
| Folders | unchanged (items/name folder-column sort) |

`enabled` sinks disabled to the bottom; others sort by that attribute then name.

## 4. Sort ⨯ grouping

Generalise `sortGroupedByName` → `sortGroupedBy(rows, cmp)`: partition into
header+children units, sort children by name, sort units by `cmp(head)`. A row
comparator per key (byName/byEnabled/byKind/byScope/byVisibility/byReach/
byLocations), each tie-breaking on name. Native modes are identity (rows already
built in native order).

Limitation: a unit sorts by its head's value, so disabled/off items hidden
inside a collapsed group don't individually re-sort. In practice disabled/off
items are top-level (plugins, mcp, visibility-off leaves), so they sink.

## Architecture

- `sortRows.ts`: `sortGroupedBy(rows, cmp)`; keep `sortGroupedByName` as the
  `byName` wrapper.
- `sortModes.ts` (new): the row comparators + a `SortMode { label, apply }`
  registry and the three per-tab ordered lists.
- `useItemSort(modes: SortMode[])`: holds the cycle index, exposes
  `{ label, apply, handleKey }`; `handleKey('s')` advances the index; the index
  is the list reset key (cursor to top on change).
- `RankedView` takes a `sortModes` prop (Leaderboard vs Project Scope lists);
  `GlobalView` uses the User Scope list; `App` passes the right list.

## Testing

- `resolve`: reach excludes universal agents (a shared-store skill with
  `lastSelectedAgents` set reports only its symlink runtimes).
- `sortRows`: `sortGroupedBy` orders units by an arbitrary comparator; children
  stay name-ordered; existing `sortGroupedByName` cases still pass.
- `sortModes`: each comparator orders correctly and tie-breaks on name; enabled
  sinks disabled; native mode is identity.
