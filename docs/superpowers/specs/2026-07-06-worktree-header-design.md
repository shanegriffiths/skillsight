# Worktree grouping + ASCII header + bottom filters — design

**Date:** 2026-07-06 · **Status:** approved (Shane picked ANSI Shadow wordmark + `.worktree`-convention detection; design confirmed before build)

Builds on the 2026-07-06 state-first restructure. Three independent changes, all presentation-layer plus one detection helper.

## 1. Worktree grouping + drill-down

Shane's convention: a `<repo>.worktree/` folder is a container holding one git-worktree checkout per subfolder. Today those checkouts scatter into the flat list as bare basenames (`animation`), disconnected from their repo.

- **Detection (`.worktree` convention only):** a discovered folder is a *worktree checkout* when a home-relative **strict-ancestor** segment ends in `.worktree`. The container node path = homeRoot + segments up to and including that segment. (No git `.git`-pointer reads — Shane's convention is consistent.)
- **Grouping:** checkouts sharing a container collapse under one synthetic **worktree-group row** (`kind: 'worktree'`, `folder: null`). Label = container basename with `.worktree` stripped + a dim `·wt` tag. Children render at `depth: 1`, labelled by their path relative to the container. Default **collapsed**.
- **Single child still groups** — the whole point is to see *that* it's a worktree and drill in.
- The main repo (a sibling of the container, e.g. `snowbridge-media`) stays its own top-level leaf row — not nested under the group.
- **Sort:** groups participate in the top-level sort by aggregate delta (`items`) or label (`name`); children sort within by the same mode.
- **Duplicate-label hint** applies across top-level rows (project basenames + group labels).

### `FolderRow` (revised)
```ts
{ nodeId, label, hint?, count, depth, kind: 'project'|'worktree', hasChildren, collapsed, folder: FolderReport|null }
```

### Navigation (`folderNav`) — scoped collapse
- `NavState` gains `folderExpanded: Set<string>` (expanded container nodeIds; empty = all collapsed = default).
- Folders focus:
  - **worktree-group row:** `→` expands (if collapsed) · `Enter` toggles · `←` collapses (if expanded).
  - **project leaf (depth 0 or 1):** `→`/`Enter` enters its item table (only when it has items).
  - **child (depth 1), `←`:** collapse the parent group and move selection to its header.
  - `↑/↓` move across the flattened rows; `s` sort, `.` hidden unchanged.
- Selecting a group header shows a dim "→ expand to drill in" hint in the right pane (no item table).

## 2. ASCII wordmark + bordered tabs (HeaderBox)

- **ANSI Shadow "skillsight"** wordmark (hardcoded 6-line constant, no runtime figlet dep) replaces the plain title at the top of the header box. homeRoot path renders dim beneath it; `● live`/`● rescanning` status top-right.
- **Responsive:** art renders only when `columns ≥ 74` and `rows ≥ 30`; otherwise falls back to bold `skillsight` text so narrow/short terminals never wrap the art.
- **Tabs** become individual rounded-border chips with `paddingX`, side by side, active chip emphasized (bold text + accent border; inactive dim). A blank line below the row for spacing.
- Per-tab metadata line (GLOBAL/EVERYTHING counts + runtime letters) stays below the tabs.
- HeaderBox **loses** the filter props (chips/runtimes/kinds/cursor/filtering) — filters move out (§3).
- Outer header frame kept initially; if art-in-box + tab-chips reads too busy against the live render, drop the outer border and let the wordmark carry it. (Finalize against the capture.)

## 3. Filters move to the bottom, grouped with sort

- The two filter lines leave the header. `FilterBar` is re-created as a **bottom** component; `App` renders it below the active view with `marginTop: 1` for spacing.
- Result — a grouped control block at the bottom of every tab (the view's sort/keys footer, then the filter lines):
```
sort: items · hidden: off · ↑/↓ move · →/Enter open · s sort · . hidden · q quit

filter  runtimes (all)  ○ claude-code  ○ codex  ○ hermes-agent …
        kinds (all)     ○ skill  ○ plugin  ○ mcp          f filter
```
- `f` toggles filter mode; chip nav (`←/→`, space, `a`) and live filtering unchanged — only the position moves.

## Height budget

Header ≈ 14 rows with art (6 art + 1 path + 3 tab chips + 1 gap + 1 meta + 2 border); bottom filter ≈ 3 rows. View `CHROME` constants updated to subtract both. When the art falls back on a small terminal the header is shorter than the static estimate, so a view simply shows a few fewer rows than it could — harmless (scroll windows clamp).

## Out of scope / unchanged

- Engine, adapters, `--json`, plain report: untouched (detection lives in `render/ink/tree.ts`).
- Item table columns, runtime letters, plugin grouping in the item column: unchanged.
- Generic (non-`.worktree`) git-worktree detection: deferred.

## Test impact

`tree.test.ts` (worktree grouping, sort, single-child, collapse) and `folderNav.test.ts` (group expand/collapse, child drill-in, `←` to parent) updated.
