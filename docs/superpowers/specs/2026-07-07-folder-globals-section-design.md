# Folders detail: inherited-globals section

**Goal:** In the Folders tab's project detail (right pane), show the folder's
inherited global layer as a **separate, collapsed table** below the project's
delta items — keyboard-reachable, expandable, with the globals plugin-grouped
just like the delta table, and each global openable to its detail.

## Why

The project detail today shows only the folder's *delta* —
`groupedRows(selFolder.projectScoped, selFolder.local)` — the items it adds
beyond the inherited layer. That's the tool's thesis. But to see the *full
effective* set active in a project you must leave for the User Scope tab. This
surfaces the inherited layer in-context while preserving the delta-vs-inherited
separation.

## Data

Source is `Inventory.global` — the machine-wide inherited layer. (Each
`FolderReport.global` is intentionally empty; the inherited layer is not
duplicated per folder — see `index.ts`.) Rendered via the existing
`groupedRows(inv.global, emptyBucket(), globalExpanded)`, so columns and plugin
sub-grouping match the delta table (SCOPE reads `user`). It is the same list for
every folder — "inherited everywhere".

## Layout (right pane, top → bottom)

1. Path line (unchanged).
2. Project items table — the delta, exactly as today.
3. Globals header — one line, always shown when `globalRows` is non-empty:
   `▸ globals (N) — inherited everywhere` (dim when unfocused; `▾` when open).
4. Globals table — only when expanded.

The umbrella collapse is a **section-level boolean**, not a table row, so the
globals table keeps the normal one-level nesting (plugin → skill); the depth
model is untouched.

Height: collapsed globals = the 1-line header only (project table keeps full
height). Expanded = the two tables split the content height, the **focused**
table getting ~⅔ (min 3 rows each), each scrolling independently with its own
position line.

## Navigation — new fourth focus `globals`

`globalItem` is `-1` on the header, `>= 0` within the globals rows.

| Where | Key | Action |
|---|---|---|
| Project items, last row | `↓` | move to globals header (only if globals non-empty) |
| Globals header, collapsed | `→` / `Enter` | expand |
| Globals header, expanded | `←` | collapse · `↓` descend into rows · `Enter` toggle |
| Globals header | `↑` / `Esc` | back to project items |
| Globals rows | `↑/↓ · → expand/open · ← collapse/back · Enter open` | same as delta table |
| Globals row 0 | `↑` | back to header |
| Global leaf | `Enter` | open detail (`Esc` returns to globals) |

## Implementation

- **Shared `listStep` helper** in `folderNav.ts`: the up/down/expand/open/edge
  logic is extracted from the current `items` reducer and reused for both the
  `items` and `globals` focuses, keyed on the relevant rows + expanded set.
  Edge results (`topEdge` / `bottomEdge` / `back`) are mapped per-focus by the
  caller (items: bottomEdge → globals, back → folders; globals rows: topEdge/
  back → header).
- `NavState` gains `globalsOpen`, `globalItem`, `globalExpanded`, and detail
  gains `detailFrom: 'items' | 'globals'` so `Esc` returns to the right table.
- `NavContext.globalRows?` (optional, defaults `[]`) so existing item-nav
  behavior/tests are unchanged when no globals are present.
- `FoldersView` computes `globalRows`, renders the header + optional table,
  splits the height, and selects the detail source by `detailFrom`.

## Empty states

- Global-only folder (empty delta): the "adds nothing beyond the inherited
  layer" note stays, with the globals section rendered below it.
- `globals (0)`: header not rendered; `↓` past the last delta item stays put.

## Out of scope

Tab-to-cross-tables (dropped — `Tab` stays the app-level tab switch); a
delta↔effective view-mode toggle (separate roadmap item).
