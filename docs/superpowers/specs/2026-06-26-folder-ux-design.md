# Design — Folder list UX (Epic B: B1/B4/B3)

Date: 2026-06-26
Roadmap items: **B1** (nested-folder tree view, collapsible hierarchy),
**B4** (sort options — default most-items-first, plus name; visible indicator),
**B3** (show/hide hidden folders toggle).

## Goal

The Folders tab today renders a **flat** list of folder basenames (`FolderList.tsx`)
with a cyan `+N` delta and a dim "global only" treatment. Epic A gave it tabs,
Epic F gave it a drill (folder → items → detail). This phase reshapes the **first
column** into a real, collapsible **tree** that reflects how the discovered folders
actually nest, ordered by where the activity is, with the noise (hidden dot-folders)
filtered out by default.

Everything here is **presentation-layer**. Verified against the live machine (31
folders): the engine already emits a full `path` per `FolderReport`, so the tree,
the hidden-detection, and the sort are all **pure functions of `folders[].path` +
`homeRoot`**. No engine, discovery, adapter, resolver, `--report`, or `--json`
change is needed — Epic B stays presentation-only, exactly like A and F.

## Decisions (from brainstorming)

- **Phase = all of Epic B** (B1 tree + B4 sort + B3 hidden). They share one new
  module (`tree.ts`) and the same two components (`FolderList` / `FoldersView`);
  once the tree exists, sort is "order siblings by key" and hidden is a one-line
  path predicate. Doing them together avoids three rounds of churn on the same code.
- **Nesting is real and common, and comes from the Claude registry**, not the walk
  (the walk stops at the first marker). Discovered folders are frequently ancestors
  of other discovered folders (`Developer` ⊃ `Developer/Projects/*`; `Meta Critical`
  ⊃ `metacritical`; `Documents/LifeOS` ⊃ `Hub` ⊃ `Bookmarks`). The tree must support
  both **synthetic** intermediate nodes (`Developer/Projects`, `Documents` — common
  ancestors that aren't themselves discovered) and nodes that are **both** a real
  folder and a parent (`Meta Critical`, `SnowbridgeMedia`).
- **Counts = aggregate subtree totals.** Every node shows the sum of its whole
  subtree's own-deltas; a leaf shows its own delta. (Approved preview: `Meta
  Critical +6` = own 1 + child `metacritical` 5.)
- **Sort = order siblings at every level**, default `items` (aggregate desc, ties →
  name asc — deterministic), alternate `name` (asc). Visible indicator in the footer.
- **Compress single-child synthetic chains** into one row (VS Code "compact
  folders"). `Library/CloudStorage/…/Guidelines` becomes one leaf; `.od/projects/
  <uuid>` collapses under `open-design`. Real nodes always anchor (never absorbed).
- **Hidden = dot-segment, hidden by default.** A folder is hidden if any segment of
  its home-relative path starts with `.` (`.config`, `.config/sketchybar`, the `.od`
  one — 3 of 31 on disk, all from the registry since the walk already skips
  dot-dirs). `…landing-page.worktree` stays visible — it doesn't *start* with a dot.
  A toggle reveals them.
- **Default expansion = fully expanded** (closest parity to today's "all folders
  visible", now with structure). Implemented via a `collapsed` set (empty = all
  expanded) so newly-appeared folders default to expanded across the live rescan.

## Scope & boundary

- **In scope:** the Ink dashboard's Folders tab — a new `src/render/ink/tree.ts`, an
  extension to `src/render/ink/folderNav.ts`, and the `FolderList.tsx` /
  `FoldersView.tsx` components, plus their tests.
- **Out of scope (byte-for-byte unchanged):** the engine, adapters, resolver,
  `discovery.ts` (no parent/child emission — derivable in render), `--report`
  (`plain.ts`, which keeps its flat `group`-based output — so `groupFor`/
  `FolderReport.group` stay), `--json` (`json.ts`), the Global/Leaderboard tabs, the
  detail view, and the live file-watch loop.
- **B2 (remove trailing dots)** is already effectively done — the current
  `FolderList` has no `·` marker (it uses dim + cyan `+N`). No work needed.
- **No new runtime or dev dependencies.** Tree, sort, hidden, scroll, and the keys
  (`s`, `.`, arrows) are all built-in.

## The tree — `tree.ts` (pure, unit-tested)

A pipeline over the flat `inv.folders`:

1. **Hidden filter** — when `showHidden` is off, drop folders whose home-relative
   path has any segment starting with `.`. Filtering happens *before* the build, so
   hidden leaves never create synthetic parents. (A visible folder can never have a
   hidden ancestor: if an ancestor segment is a dot, that segment is in the folder's
   own path, so the folder is itself hidden.)
2. **Build trie** from each folder's home-relative path segments. Create a
   **synthetic** node (no `FolderReport`) wherever no folder sits. Attach the
   `FolderReport` at its terminal node. A node may be both real *and* have children.
3. **Compress** runs of single-child **synthetic** nodes into their single child,
   prepending the synthetic segment to the child's label (`Studio Brio/studiobrio`,
   `Library/CloudStorage/…/Guidelines`, `.od/projects/<uuid>`). Real nodes anchor and
   are never absorbed; branch points (≥2 children) stop compression.
4. **Aggregate counts** — post-order: `count(node) = ownDelta(node) + Σ count(child)`,
   where `ownDelta` = `bucketCounts(projectScoped) + bucketCounts(local)` summed over
   skills+plugins+mcp (a synthetic node's own delta is 0). Displayed on every node.
5. **Sort siblings** at every level by the active `SortMode`:
   `items` → aggregate count desc, ties broken by label `localeCompare` asc;
   `name` → label `localeCompare` asc. Recursive; fully deterministic.
6. **Flatten** to visible rows, honoring the `collapsed` set (a collapsed node's
   descendants are omitted, but `hasChildren` stays true so the chevron shows).

### Public API

```ts
export type SortMode = 'items' | 'name';

export interface FolderRow {
  nodeId: string;                 // absolute path of the node — stable expand/collapse key
  label: string;                  // basename, or 'a/b/c' for a compressed chain
  depth: number;                  // indent level (0 = root)
  count: number;                  // aggregate subtree delta
  hasChildren: boolean;           // node has children in the full tree
  collapsed: boolean;             // view flag for the chevron
  folder: FolderReport | null;    // null for a synthetic node (not openable)
}

export function isHiddenPath(relPath: string): boolean;   // any segment startsWith('.')

export function buildFolderRows(
  folders: FolderReport[],
  homeRoot: string,
  opts: { sort: SortMode; showHidden: boolean; collapsed: ReadonlySet<string> },
): FolderRow[];
```

`ownDelta` moves into `tree.ts` (today's `delta()` lives in `FolderList.tsx`); the
component stops computing counts and just renders `row.count`.

## Interaction — the folder column becomes a collapsible tree

Mirrors the proven F2 items-column semantics so there's nothing new to learn. Three
row kinds: **leaf** (real, no children), **real-parent** (own items *and* children),
**synthetic** (children only, not openable).

```
[folders]  ↑/↓        move between visible tree rows
           →          expand if collapsed-with-children;
                      else OPEN into items (if the folder has items)
           ←          collapse if expanded; else jump to parent; else no-op
           Enter      OPEN into items (if the folder has items);
                      else toggle expand (so synthetic/empty nodes still respond)
           s          cycle sort  items ⇄ name
           .          toggle hidden folders
[items]    … unchanged from Epic F (→/← expand plugin groups, Enter → detail) …
[detail]   … unchanged from Epic F …
```

"Open into items" uses the selected row's `folder` ref; synthetic rows (folder ===
null) can't be opened (the reducer gates on it). A **real-parent** like `Meta
Critical` is unambiguous: `→`/`←` work its children, `Enter` opens its own items.

### Keymap

| Context | Keys | Action |
|---|---|---|
| **Global** (`App`) | `1`/`2`/`3` · `Tab`/`Shift+Tab` · `q` | tabs · cycle · quit (unchanged) |
| **Folders – folders** | `↑/↓` `j/k` | move tree cursor |
| | `→` | expand collapsed node, else open items |
| | `←` | collapse expanded node, else jump to parent |
| | `Enter` | open items, else toggle expand |
| | `s` | cycle sort (items ⇄ name) |
| | `.` | toggle hidden folders |
| **Folders – items / detail** | (unchanged from Epic F) | |

Footer (Folders, folders focus) shows live state, e.g.:
`sort: items▾ · hidden: off · ↑/↓ move · →/Enter open · s sort · . hidden · q quit`

## Architecture — state & components

### `folderNav.ts` (extended)

```ts
interface NavState {
  focus: 'folders' | 'items' | 'detail';
  folder: number;                 // index into the VISIBLE folder tree rows
  item: number;
  expanded: Set<string>;          // items-column plugin groups (unchanged)
  folderCollapsed: Set<string>;   // NEW — collapsed tree nodeIds (empty = all expanded)
  detailItem: number | null;
}

interface NavContext {
  folderRows: FolderRow[];        // NEW — replaces folderCount / folderHasItems
  rows: ItemRow[];                // items for the currently selected folder (as today)
}
```

Folders-focus transitions read `ctx.folderRows[state.folder]`:

- `down`/`up` → clamp over `folderRows.length`.
- `right` → if `hasChildren && folderCollapsed.has(nodeId)`: expand (delete from set);
  else if `folder && ctx.rows.length > 0`: `focus → items`; else no-op.
- `enter` → if `folder && ctx.rows.length > 0`: `focus → items`;
  else if `hasChildren`: toggle collapse; else no-op.
- `left` → if `hasChildren && !collapsed`: collapse (add to set);
  else move `folder` to the **parent row** (nearest preceding row with smaller
  `depth`); else no-op.

`sortMode` and `showHidden` are **not** in `NavState` — they belong to `FoldersView`
(the reducer only ever sees the already-built `folderRows`). The existing
items/detail branches are unchanged in behavior; only the `NavContext` shape
changes (test helpers update accordingly).

### Components

- **`FolderList.tsx`** (modified) — renders `FolderRow[]`: indent by `depth`, a
  chevron (`▾` expanded / `▸` collapsed / none for leaves), the `›` active cursor,
  the label, and the cyan `+N` (omitted when 0). Count-0 nodes dim, as today. The
  column is now **windowed** (reuses `scroll.ts`) since a tree can exceed the
  viewport — `FoldersView` passes a sliced row range + the in-window selected index,
  mirroring the items column. No per-column position line (cursor + dim convey
  position; keeps the footer clean).
- **`FoldersView.tsx`** (modified) — owns `sortMode` (`useState<'items'|'name'>`,
  default `items`), `showHidden` (`useState(false)`), and the `folderNav` state.
  Builds `folderRows = buildFolderRows(inv.folders, inv.homeRoot, { sort, showHidden,
  collapsed: nav.folderCollapsed })`. Clamps `nav.folder` over `folderRows.length`,
  computes the folder-column scroll window, and when focus is on items builds
  `rows = groupedRows(sel.folder.projectScoped, sel.folder.local, nav.expanded)` from
  the selected row's `folder`. Handles `s` / `.` keys (cycle sort / toggle hidden)
  and renders the dynamic footer.

No new components; `DetailView`, `ItemTable`, `GlobalBand`, `GlobalView`,
`LeaderboardView`, `App` are untouched.

## Data flow

```
scan() → Inventory → filterInventory → inv
   Folders tab:
     buildFolderRows(inv.folders, inv.homeRoot, {sort, showHidden, collapsed})
        → FolderRow[]  → FolderList (windowed, col 1)
     selected row.folder → groupedRows(ps ∪ local, expanded) → ItemTable (col 2)
        → (Enter) detailFields → DetailView (col 2, swap)   [Epic F, unchanged]
```

The live file-watch / rescan loop is untouched; on rescan `folderRows` is rebuilt
and `nav.folder` re-clamped. The `collapsed` set keys on absolute paths, so it
survives rescans (stale ids for vanished folders are harmless set membership).

## Testing

- **`test/tree.test.ts`** (new):
  - **nesting** — two folders under a common, non-discovered ancestor produce a
    synthetic parent; a folder that is both discovered and has discovered
    descendants yields `folder !== null && hasChildren`.
  - **synthetic** — intermediate node has `folder === null`, `hasChildren`.
  - **compression** — a single-child synthetic chain collapses to one row with the
    joined label; a real single-child node is **not** absorbed; a branch point stops
    compression.
  - **aggregate** — parent `count` equals the sum of its subtree's own-deltas
    (e.g. real-parent own 1 + child 5 → 6).
  - **sort** — `items`: siblings ordered by aggregate desc, ties → name asc;
    `name`: alpha asc; both recursive and deterministic.
  - **hidden** — `isHiddenPath` true for a `.`-leading segment, false for
    `name.worktree`; `showHidden:false` drops dot-folders, `true` keeps them.
  - **collapsed** — a node in `collapsed` hides its descendants from the flattened
    output while keeping `hasChildren` true.
  - **edge** — empty folders → `[]`; all-hidden + `showHidden:false` → `[]`.
- **`test/folderNav.test.ts`** (extended) — new folders-focus transitions: tree
  move/clamp over `folderRows`; `→` expand vs open vs no-op; `enter` open vs toggle;
  `←` collapse vs parent-jump vs no-op; existing items/detail transitions still pass
  under the new `NavContext`.
- `scroll.ts` reused (already green). **Components untested** per repo convention
  (no ink-testing-library in the suite); validated by a manual run of the dashboard
  against the real disk.

## File summary

- **Create:** `src/render/ink/tree.ts`, `test/tree.test.ts`.
- **Modify:** `src/render/ink/folderNav.ts` (`folderCollapsed` + tree-nav branch +
  new `NavContext`), `test/folderNav.test.ts` (helpers + new cases),
  `src/render/ink/FolderList.tsx` (render `FolderRow[]` + windowing),
  `src/render/ink/FoldersView.tsx` (tree state, `s`/`.` keys, scroll, footer).
- **Remove:** nothing.

## Deferred / out of scope (future epics)

- Persisting the tree's collapse/sort state across tab switches (each view resets on
  re-mount — matches the shell; easy to lift into `App` later).
- A tree in the `--report` text output (stays flat/`group`-based) and a web UI.
- C2 table/grid, C3 used-count sort key, C4 origin URL, D1 icons, D2 polish, E1
  filter chips — separate phases that compose with this tree.

---

## Appendix — verified against the live machine (2026-06-26)

| Claim | Verdict | Evidence |
|---|---|---|
| Engine emits a full `path` per folder | ✅ | `src/index.ts:78` (`path: dir`); `--json` shows 31 absolute paths |
| Discovered folders genuinely nest | ✅ | `Developer` ⊃ `Developer/Projects/*`; `Meta Critical` ⊃ `metacritical`; `Documents/LifeOS` ⊃ `Hub` ⊃ `Bookmarks` |
| Synthetic intermediates required | ✅ | `Developer/Projects`, `Developer/Tools`, `Documents`, `Library/CloudStorage` are common ancestors, not discovered themselves |
| Hidden = dot-segment is rare & registry-only | ✅ | 3 of 31 (`.config`, `.config/sketchybar`, `…/.od/projects/<uuid>`); walk skips `e.name.startsWith('.')` (`discovery.ts:38`) |
| `…landing-page.worktree` must stay visible | ✅ | segment doesn't *start* with `.` |
| Counts available for sort | ✅ | deltas 47 → 0; 18 of 31 are global-only (delta 0) |
| No discovery/engine change needed | ✅ | tree/hidden/sort are pure over `folders[].path` + `homeRoot` |
| `plain.ts` depends on `FolderReport.group` | ✅ | `plain.ts:67–71` groups by `f.group` — so `groupFor`/`group` stay |
| Tests are pure-module vitest (no render harness) | ✅ | `test/folderNav.test.ts`, `test/scroll.test.ts`, `test/grouping.test.ts` |
