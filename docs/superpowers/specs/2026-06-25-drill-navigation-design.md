# Design — drill navigation (Epic F: F1/F2/F3 + C1)

Date: 2026-06-25
Roadmap items: **F1** (column focus model), **F2** (expand/collapse plugin groups),
**F3** (skill detail view), folding in **C1** (group plugin-bundled skills under
their plugin).

## Goal

The shell (Epic A) gave us tabs and scrollable lists; it deliberately left `←/→`
unbound and reserved for this phase. Now we add the **drill**: move focus *into* a
folder, walk its items, expand a plugin to reveal the skills it bundles, and open
a skill's full detail — a left → right focus model across the existing two-column
frame. The same detail view is reachable from the Global and Leaderboard lists, so
any cursored row anywhere can be inspected.

Everything here is **presentation-layer**: every field the detail view shows
(`description`, `usedBy[]`, `provider.source`/`sourceUrl`, `scope`, `contentId`,
`bundledInPlugin`, MCP `transport` + `envKeys`/`headerKeys`) already exists on the
records the engine emits.

## Decisions (from brainstorming)

- **Phase = Epic F** (drill navigation), folding in **C1** (plugin grouping is the
  data side of F2).
- **F3 detail = replace the items pane**, not a third Miller column and not a
  modal. Keeps the frame to **two columns** (no width pressure); folder context
  stays visible in col 1.
- **Detail on all three tabs.** `Enter` on a cursored row in the Folders items
  column, the Global list, or the Leaderboard list opens the shared detail.
  **Plugin expand/collapse (F2) is Folders-only** — grouping exists only in the
  Folders items column.
- **`Esc` becomes contextual "back one level"**, owned by each view; the global
  `Esc → Folders tab` binding is **removed** (`1` already covers it).
- **`←/→`** drive expand/collapse and back — exactly what the shell reserved them
  for.
- **`←` overloading (Folders items):** collapse an expanded plugin first; only when
  nothing is expanded does `←` (and `Esc`) step back to the folder column.
  (Roadmap proposed this; adopted.)
- **Leaf actions:** on a skill / standalone plugin / MCP row, `Enter` (and `→` on a
  skill) opens detail. On a plugin **group** header, `Enter` and `→/←` toggle
  expand — no separate "plugin detail" in the Folders column. (Plugins *do* get a
  detail view when opened from Global/Leaderboard, where they are plain rows.)
- **Drill state resets on tab switch** — switching tabs unmounts the view (the
  shell's established behaviour); persisting drill position is deferred.

## Scope & boundary

- **In scope:** the Ink dashboard only — `src/render/ink/*` and its tests.
- **Out of scope (byte-for-byte unchanged):** the engine, adapters, resolver,
  `--report` (`plain.ts`), `--json` (`json.ts`), and the non-TTY fallback. No task
  touches them; the data the detail reads already lives on the records.
- **No new runtime or dev dependencies.** `useInput` already delivers
  `key.leftArrow` / `key.rightArrow` / `key.return` / `key.escape`
  (verified on disk — see appendix).

## Interaction model

### Layout — two columns, never three

Detail **replaces the items pane**. Each tab is a small state machine over the
same two-column frame:

```
Folders tab     folders  ⇄  items  ⇄  detail
                ┌ FolderList ┐┌ items list   │ swaps to │   detail ┐
Global tab      list  ⇄  detail          (single column)
Leaderboard     list  ⇄  detail          (single column)
```

### Focus state machine

**Folders tab** (`focus: folders → items → detail`):

```
[folders]  ↑/↓ move folder
           Enter → [items]      (no-op if the folder is global-only / empty)
[items]    ↑/↓ move item
           →  expand plugin group
           ←  collapse it; if nothing expanded, ← / Esc → [folders]
           Enter on a skill / standalone plugin / mcp → [detail]
           Enter on a plugin GROUP header → toggle expand (no detail)
[detail]   Esc / ← → [items]
```

**Global & Leaderboard tabs** (`mode: list → detail`):

```
[list]    ↑/↓ scroll (today's behaviour) · Enter on a row → [detail]
[detail]  Esc / ← → [list]
```

### Keymap

Global keys (owned by `App`) stay disjoint from the active view's keys, so the two
`useInput` handlers coexist without contention (the shell's verified model).

| Context | Keys | Action |
|---|---|---|
| **Global** (`App`, always mounted) | `1` / `2` / `3` | jump to Folders / Global / Leaderboard |
| | `Tab` / `Shift+Tab` | cycle tabs (unmounts the view → drill state resets) |
| | `q` / `Ctrl+C` | quit |
| **Folders – folders** | `↑/↓` `j/k` · `Enter` | move folder · focus items |
| **Folders – items** | `↑/↓` `j/k` · `→` `←` · `Enter` · `Esc` | move · expand/collapse · open detail / toggle group · back |
| **Global/Leaderboard – list** | `↑/↓` `j/k` · `Enter` | scroll · open detail |
| **any – detail** | `Esc` `←` | back |

### Active-column affordance

The focused column renders bright (its header + the `›` cursor); the unfocused
column **dims** — the folder list greys when focus is in the items column — so it
is always obvious where keys land.

## Architecture — pure logic, thin components

### `ItemRow` gains the record (the linchpin)

`ItemRow` today keeps only `name/used/source` and drops the underlying record.
Extending it so a cursored row carries its record is what makes "detail on all
three tabs" nearly free — every list already renders `ItemRow[]`.

```ts
export interface ItemRow {
  kind: ItemKind;
  name: string;
  used: number | null;
  source: string | null;
  sourceDim: boolean;
  // NEW:
  record: SkillRecord | PluginRecord | McpRecord;   // discriminated by `kind`
  depth?: number;                                    // 1 for a group's children
  expandState?: 'collapsed' | 'expanded';            // only on group-header rows
}
```

`itemRows(bucket)` (the existing flat builder) attaches `record` and leaves
`depth`/`expandState` unset — Global, Leaderboard, and the unfocused preview keep
rendering exactly as today.

### New pure modules (unit-tested)

**`src/render/ink/grouping.ts`** — the Folders-column view builder:

- `groupedRows(bucket: Bucket, expanded: Set<string>): ItemRow[]`
  - Skills with `bundledInPlugin` collapse under a **plugin-group header** row
    (`kind: 'plugin'`, `expandState`, child count shown beside the `▸/▾` marker —
    not in the `USED` column, which stays runtime-only). When the plugin's id is in
    `expanded`, its child skill rows follow at `depth: 1`; otherwise they are
    hidden.
  - Skills with no `bundledInPlugin`, the bucket's own `plugins`, and `mcp` render
    as top-level leaf rows.
  - Built from `project-scoped ∪ local` (matching today's DetailPane content);
    each row carries its `scope` via the record. Returns a flat, windowable
    `ItemRow[]` the existing `scroll.ts` + `ItemTable` consume unchanged.
  - Stable order: groups first (by name), then standalone skills, plugins, mcp.

**`src/render/ink/detail.ts`** — record → labelled fields:

```ts
export interface DetailField { label: string; value: string; dim?: boolean; href?: string }
export function detailFields(row: ItemRow): DetailField[]
```

- **skill** → description, used-by (runtime list), source + `sourceUrl` (`href`),
  scope, bundled-in-plugin, enabled, path, short `contentId`.
- **plugin** → provides-counts (skills/commands/agents/mcp), marketplace + repo,
  scope, version.
- **mcp** → transport kind, command/url, **`envKeys` / `headerKeys` names only**
  (privacy rule — asserted in tests), timeout, scope.
- Absent optionals (no description, no `sourceUrl`) are omitted, not blanked.

**`src/render/ink/folderNav.ts`** — pure reducer for the Folders state machine:

```ts
type Focus = 'folders' | 'items' | 'detail';
interface NavState { focus: Focus; folder: number; item: number; expanded: Set<string>; }
function folderNav(state: NavState, action: NavAction, ctx: NavContext): NavState
```

Encodes the tricky transitions — Enter folders→items only when the folder is
non-empty; `→` expand / `←` collapse-then-back; Enter on a group toggles vs Enter
on a skill opens detail; Esc from detail→items. The component dispatches
keypresses; all branching logic is here and fully tested.

### Components

- **`DetailView.tsx`** (new) — renders `detailFields(row)` as aligned label/value
  lines plus a wrapped description; shared by all three tabs.
- **`ItemTable.tsx`** (modified) — when a row has `expandState`, render a `▸/▾`
  marker and indent `depth: 1` rows. Rows without `expandState` (flat lists) are
  byte-for-byte unchanged.
- **`FoldersView.tsx`** (modified) — owns `folderNav` state; renders `FolderList`
  (col 1, **dimmed when focus ≠ folders**) beside either the grouped items list
  (windowed via `useScroll`) or `DetailView` (col 2). Renders its own focus-aware
  footer. Replaces today's `DetailPane`.
- **`GlobalView.tsx` / `LeaderboardView.tsx`** (modified) — add `mode: list | detail`;
  `Enter` on the cursored row → `DetailView`; `Esc/←` → list. Each renders its own
  footer.
- **`App.tsx`** (modified) — **remove the global `Esc → folders`**; **remove the
  `FOOTER` map** (footers move into the views). Keeps `1/2/3`, `Tab/Shift+Tab`, `q`.
- **`DetailPane.tsx`** — **removed**; its `ItemTable` role migrates into the Folders
  items column, and the cap-at-20 becomes real scrolling.

## Data flow

```
scan() → Inventory → filterInventory → inv
   ├─ Folders     : groupedRows(ps ∪ local, expanded) → ItemTable (windowed)
   │                Enter on a row's `record` → detailFields → DetailView
   ├─ Global      : itemRows(inv.global)      → ItemTable → (Enter) DetailView
   └─ Leaderboard : leaderboard(inv)          → ItemTable → (Enter) DetailView
```

The live file-watch / rescan loop in `App.tsx` is untouched; all views read the
recomputed `inv`, so they stay live. On rescan the selected index is re-clamped
(existing `clampIndex`).

## Testing

- **`test/grouping.test.ts`** (new) — collapsed hides children / expanded reveals
  them at `depth 1`; standalone vs grouped partition; stable ordering; empty bucket
  → `[]`; a skill whose `bundledInPlugin` has no matching plugin record still groups
  under a header.
- **`test/detail.test.ts`** (new) — fields per kind from known fixtures; used-by
  formatting; **privacy: env/header *values* never appear, only key names**; absent
  optionals omitted; `sourceUrl` surfaced as `href`.
- **`test/folderNav.test.ts`** (new) — every transition: folders→items, no-op Enter
  on an empty folder, item move clamping, `→` expand, `←` collapse-then-back, Enter
  on a group (toggle) vs a skill (detail), Esc from detail→items.
- `scroll.ts` is reused (already green). **Components untested** per repo
  convention. **Optional final task:** a `renderToString` smoke test for
  `DetailView` (the esbuild `jsx: 'automatic'` tweak the quick-wins plan documented).

## File summary

- **Create:** `grouping.ts`, `detail.ts`, `folderNav.ts`, `DetailView.tsx`,
  `test/grouping.test.ts`, `test/detail.test.ts`, `test/folderNav.test.ts`.
- **Modify:** `rows.ts` (extend `ItemRow` + attach `record`), `ItemTable.tsx`
  (marker/indent), `FoldersView.tsx` (nav state machine + col-2 swap),
  `GlobalView.tsx` + `LeaderboardView.tsx` (list↔detail), `App.tsx` (drop global
  `Esc` + `FOOTER`).
- **Remove:** `DetailPane.tsx`.

## Deferred / out of scope (future epics)

- Persisting drill state across tab switches — each view resets to its top focus on
  re-mount (matches the shell; easy to lift into `App` later).
- Runtime icons/glyphs (D1), live runtime filter chips (E1), nested-folder tree
  (B1), sort options (B4), hidden-folder toggle (B3) — separate phases that build
  on this drill.
- A bespoke "plugin detail" beyond the basic field set; richer MCP introspection.

---

## Appendix — verified against Ink v7.1.0 (disk) + earlier shell audit

| Claim | Verdict | Evidence |
|---|---|---|
| `key.leftArrow` / `key.rightArrow` delivered by `useInput` | ✅ | `ink/build/hooks/use-input.js:44–45` |
| `key.return` (Enter) / `key.escape` delivered | ✅ | `use-input.js:50–51` |
| `key.upArrow` / `key.downArrow` delivered | ✅ | `use-input.js:42–43` |
| Multiple `useInput` coexist; none swallows input | ✅ | shell audit (independent listeners on `internal_eventEmitter`) |
| `setRawMode` ref-counted — safe across detail/list mount swaps | ✅ | shell audit (`components/App.js` `rawModeEnabledCount`) |
| Detail/plugin/MCP fields exist on the records | ✅ | `src/types.ts` `SkillRecord` / `PluginRecord` / `McpRecord` / `Provider` |
| No new dependency required | ✅ | all keys + rendering are built-in Ink + React |

**Privacy note carried from the engine:** `McpTransport` stores `envKeys` /
`headerKeys` (names only — never values); the detail view renders those name lists
verbatim and never reaches for values, preserving the engine's privacy rule.
