# Live filter (`/`) — find-as-you-type row filtering

**Date:** 2026-07-17
**Status:** Approved (design), pending implementation plan

## Summary

Pressing `/` in any list opens a one-line find-as-you-type filter box rendered
inside the table, above the first row. Typing narrows the visible rows on every
keystroke. It works on all four tabs; on the Folders tab it filters whichever
pane currently has focus. The filter is display-level only — it never touches
the Inventory, the chip filter, or scan state.

## Interaction model (navigate-while-typing)

- `/` opens the box in the focused list. It renders inside the table, above the
  first row, showing the query, a cursor, and a match count (`7/43`).
- Printable characters append to the query; backspace deletes. Matching is
  **case-insensitive substring**.
- The selection snaps to the **first match** whenever the query changes.
- While the box is open:
  - `↑`/`↓` move the selection through the narrowed rows.
  - `Enter` opens the selected row — the detail pane on item lists, the folder
    on the folder column. Opening a row **closes the box and clears the
    query**; the cursor lands on that row in the restored full list.
  - `Esc` closes the box, clears the query, and restores the full list with the
    cursor on the row that was selected.
  - Cursor mapping on close (both `Enter` and `Esc`): the selected row is
    located in the restored full list by identity (`groupKey`/`nodeId`). If it
    is hidden there — a child of a group the user had collapsed — the cursor
    lands on its group header instead. If the list is empty or nothing was
    selected (zero matches), the cursor falls back to index 0.
  - Every other key — including `q`, `f`, `s`, `.`, `y`, `1`–`4`, Tab, `h`/`j`/
    `k`/`l` — is plain text and goes into the query. App-level and view-level
    key handlers are suspended while the box is open.
- Zero matches: the box stays visible with a dim "no matches" note and an empty
  table; `Enter` does nothing.
- Backspace on an empty query does nothing; `Esc` is the only way out besides
  `Enter`.
- Filter state is **per-view and per-pane**, and resets when the hosting view
  unmounts (tab switch) — the same lifetime as sort mode and group expansion
  today.

## Scope per tab

| Tab | List filtered |
|-----|---------------|
| 1 Folders | The focused pane only: folder column, project items table, or globals table — each with its own independent query; unfocused panes stay full. |
| 2 Project Scope | The single ranked list. |
| 3 User Scope (Global) | The single grouped list. |
| 4 Leaderboard | The single ranked list. |

## Match fields

- **Item rows** (`ItemRow`): match against `name` OR `source` (the SOURCE cell —
  owner/repo, marketplace repo, transport/provider kind). Typing `superpowers`
  narrows to that plugin family.
- **Folder rows** (`FolderRow`): match against `label` and the `nodeId` path
  (so a path fragment like `Projects/skill` works).

## Group behaviour under a live query

- Plugin/source groups are **forced expanded** while the query is non-empty;
  the user's own `expanded` set is untouched and restored when the filter
  clears.
- A group header survives if:
  - its own name/source matches → all its children are shown; or
  - any child matches → only the matching children are shown beneath it.
- Headers never appear childless; a header with no surviving children and no
  own match is dropped.
- Folder tree: a row survives if it matches, or if any descendant matches
  (repo parents and the `worktrees` grouping node stay so the tree remains
  navigable). Ancestors of a match render even when they don't match.

## Composition with existing filters

Chips (`f` — runtimes/kinds) narrow the **Inventory** first, exactly as today.
The text query then narrows the **display rows** — after grouping and after
sort — immediately before the scroll-window slice. Sort order is preserved
within matches. Header counts and chips stay stable while typing.

## Architecture

Per-view filter state with a shared pure core (mirrors how per-view sort works):

- **`src/render/ink/liveFilter.ts`** (new, pure, unit-tested): the testable
  core.
  - `matchesItemRow(row, query)` / `matchesFolderRow(row, query)` — the field
    rules above.
  - `filterItemRows(rows, query)` — group-aware narrowing of an already-built
    `ItemRow[]` (headers, children, forced expansion semantics).
  - `filterFolderRows(rows, query)` — ancestor-preserving narrowing of
    `FolderRow[]`.
  - `matchCount(...)` / label helpers for the `7/43` string.
- **`SearchBox`** (new component): the one-line box — `/` prefix, query text,
  cursor glyph, dim match count. Rendered by the hosting view inside the table
  area, above the first row.
- **`useLiveFilter`** (new hook): open/query state plus an `onInput` handler
  the view calls first when the box is open (printable/backspace/Esc/Enter
  handling; ↑/↓ fall through to the view's own selection movement).
- **View wiring**: `RankedView` (tabs 2+4), `GlobalView` (tab 3), and
  `FoldersView` (three pane-scoped instances) filter their display rows through
  the pure functions. Forced expansion in grouped views is achieved by building
  rows with all groups expanded when a query is live, then filtering.
- **App gating**: the hosting view reports box-open state up via a new
  `onSearchActive(boolean)` callback (same pattern as `onControls`/`onSort`).
  `App` suspends its global `useInput` (`q`, `f`, tab keys) with
  `isActive: !searchActive`. Views already gate on `inputActive`; the hook's
  handler runs inside the view's own `useInput` before other bindings.
- **Hints**: while the box is open the header controls line (via `onControls`)
  reads `type to filter · ↑/↓ move · Enter open · Esc clear`.

## Error handling

There is no failure mode beyond empty results (handled above). The filter is
pure display logic: rescans (`chokidar` → new Inventory) simply re-derive rows;
the query re-applies to the fresh rows on the next render. Selection indices
are re-clamped by the existing `clampIndex`/`scrollWindow` machinery.

## Testing

- **`test/liveFilter.test.ts`**: matching fields (name, source, case
  folding), group survival rules (header match vs child match, childless-header
  drop), forced-expansion output, folder ancestor preservation, match-count
  strings, empty-query passthrough.
- Existing suites (`grouping`, `sortModes`, `folderNav`, `tabs`) are untouched
  — the filter sits after them in the pipeline.
- Interactive behaviour (key routing, box rendering, Esc/Enter lifecycles)
  verified end-to-end with the `/verify` tmux + `--demo` recipe.

## Out of scope

- Fuzzy/subsequence matching and match ranking.
- Persisting queries across tab switches or sessions.
- Filtering the detail pane, stats band, or header counts.
- A global cross-tab search overlay.
