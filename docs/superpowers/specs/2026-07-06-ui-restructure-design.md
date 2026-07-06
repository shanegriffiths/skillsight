# Dashboard UI restructure — design

**Date:** 2026-07-06 · **Status:** approved-in-principle (Shane dictated the changes verbatim; decisions below fill the gaps — flag anything wrong and it's cheap to adjust)

## Goal

The dashboard's job is: *per project, what is enabled / user-invokable / parked / disabled / available — across skills, plugins, and MCPs — and the same picture at the global level.* The current tree + colored-badge UI buries that. This restructure puts state (kind / scope / visibility / status) front and centre and reframes the chrome.

## Changes

### 1. Flat project list (was: nested folder tree)

- The Folders column lists **only discovered project directories** — no parent rows, no synthetic intermediates, no chevrons, no indentation.
- Label = directory **basename**; when two visible projects share a basename, a dim relative-parent hint disambiguates (e.g. `docs  ~ Sun Plot/sunplot`).
- Folders outside `homeRoot` keep their full path as the label.
- Sort modes unchanged (`items` delta desc / `name`), hidden-dotfile filter unchanged.
- `folderNav` loses all collapse handling; ←/Esc are no-ops in the folder column.

### 2. Runtime letters, never colored chips

- The colored reverse-video badges are gone everywhere. Runtimes render as **plain spaced letters** (`C X H G U O`), same letter mapping as before (claude-code C · codex X · hermes H · gemini G · cursor U · opencode O).
- The folder list no longer shows runtimes at all; the per-item RUNTIMES column (project + global tables) and the header metadata line carry them.

### 3. One framed header box

Everything that "controls" the app lives in a single bordered box at the top:

```
╭──────────────────────────────────────────────────────────────────────╮
│ skillsight  ~                                               ● live   │
│ 1 Folders   2 Global   3 Leaderboard                                 │
│ GLOBAL inherited everywhere · 279 skills · 31 plugins · 9 mcp · C X… │
│ filter  runtimes (all)  ○ claude-code ○ codex ○ hermes-agent …       │
│         kinds (all)     ○ skill ○ plugin ○ mcp    f filter           │
╰──────────────────────────────────────────────────────────────────────╯
```

- Metadata line is **per-tab**: Folders/Global → global-layer counts; Leaderboard → distinct-universe counts.
- Runtime filter chips get their own line; kind chips + hint on the next line. Chip cursor (f, ←/→, space) unchanged.
- `Header`, `TabBar`, `FilterBar`, `GlobalBand` fold into this one component; the GLOBAL band disappears from the Folders tab body.

### 4. Project view = state table (was: NAME/USED/USES)

- Right pane shows the **full folder path** first, then the item table.
- Columns: `NAME │ KIND │ SCOPE │ VISIBILITY │ STATUS │ SOURCE │ RUNTIMES`.
  - **SCOPE** — `user` / `project` / `local` (project-scoped → `project`; global & plugin-user → `user`).
  - **VISIBILITY** — skills only: `on` (default) / `name-only` / `user-only` / `off`, mirroring the /skills menu labels; `—` for plugins & MCP.
  - **STATUS** — `enabled` (dim green) / `disabled` (red), straight from `record.enabled`.
  - **SOURCE** — owner/repo, marketplace repo, else dim provider/transport kind. Bundled skills fall back to the plugin's marketplace repo before the dim kind.
- USED/USES leave this view (they stay on the Leaderboard, which is about reach).
- **Plugin membership**: bundled skills stay grouped under their plugin header, and the header now **is** the plugin row (record attached by `bundledInPlugin === plugin.id`) — its scope/status/source render on the header; the duplicate plugin leaf row is removed. Expanded children indent under it.
- The Global tab uses the same grouped table (so plugin membership + visibility read the same way); its sort toggle goes away. Leaderboard keeps `NAME │ USED │ RUNTIMES`.

### 5. Table chrome

- Tables (and the project list) sit in bordered boxes; a `│` separator runs between columns with a `─┼─` rule under the header. Rows are manually padded single-line strings so the grid is exact.
- The cursor row highlights **full-width** (inverse across every column), not just the name.

## Out of scope

- Runtimes stay multi-runtime (no Claude-Code-only simplification needed — the letters are cheap).
- Plain/JSON renderers, adapters, engine: untouched.
- Detail view keeps its current field list (already shows kind/scope/visibility/plugin/source).

## Test impact

`tree`, `folderNav`, `rows`, `grouping`, `runtimeMark` unit tests updated alongside; component-free pure logic keeps carrying the coverage.
