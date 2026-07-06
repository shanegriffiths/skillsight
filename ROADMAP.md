# skillsight roadmap

Backlog for the next iteration. v1 (engine + adapters + CLI + default Ink dashboard) shipped on `main`. The theme of **v0.2 is making the dashboard a real interface** — navigation, grouping, richer presentation, and interactive filtering/sorting.

Each task notes its size (S/M/L), whether the data already exists in the engine, and the raw thought it came from.

---

## Bugs

- [x] **Per-project plugin enablement overrides were ignored.** A user-scope plugin disabled in `~/.claude/settings.json` but enabled by a project's `.claude/settings.json` (`enabledPlugins`) — the flagship "default-off library, enable per project" pattern — was reported as disabled everywhere, and its bundled skills too. skillsight resolved a plugin's `enabled` only at its install layer and never applied a folder's `enabledPlugins` override to inherited plugins. **Fixed 2026-07-06** — `collectForDirectory` surfaces each override as a folder-delta plugin row (`override: 'project'|'local'`, tagged `(override)`, counting toward `+N`); `mergeBuckets` lets it win in `effective`; `refineEffective` cascades the effective enablement onto bundled skills. Symmetric (project can also disable a user-enabled plugin). Adapter + engine + rows tests in `test/`.

- [x] **Home directory shows as a project with ~99 duplicate "global" skills.** `/Users/<you>` is in Claude's project registry, so it was discovered as a folder; scanning it read `~/.claude/skills`, `~/.agents/skills`, etc. — the global skill dirs — and re-listed them as `project-scoped` (the `shane +99` row). **Fixed 2026-06-24** — `discovery.ts` now excludes `homeRoot` (and `/`); regression test in `test/discovery.test.ts`.

---

## Consolidation pass — codebase review (2026-07-03)

**Shipped 2026-07-03** (`code-review-cleanup`) — see `docs/superpowers/specs/2026-07-03-codebase-review-design.md` + `docs/superpowers/plans/2026-07-03-codebase-review.md`. Five parallel review agents over engine/adapters/CLI/render → 38 findings → 22 tasks. Fixed 8 root-caused bugs (`--dir` flag swallowing, `enableAllProjectMcpServers` ignoring `settings.local.json`, Codex disable matching frontmatter names instead of dir names, plugin-bundled skills never reading SKILL.md, latent plain-report delta drift, loose frontmatter fence, missing CLI error boundary, empty-list detail guard). Four spec'd behavior changes: **hub-direct-only skills now visible** (usedBy from the lock's universal agents, no owner fallback), plain report hides dot-path folders (dashboard parity), CLI warns on unknown args, `--provenance` expands MCP (key names only). Consolidation: characterization snapshots for `--report`/`--json`, tabs/keymap/list-detail/band/position single-sourced, one `universe()` per leaderboard render, per-keypress pipelines memoized, claude-code global reads cached per scan, dead `projectSkills` registry field removed. 130 → 183 tests.

## UI restructure — state-first dashboard (2026-07-06)

**Shipped 2026-07-06** (`ui-restructure`) — see `docs/superpowers/specs/2026-07-06-ui-restructure-design.md`. Reshaped the dashboard around the core question ("what is enabled/parked/disabled where") and **superseded several earlier presentation decisions**: the B1 nested folder tree became a **flat project list** (basename labels, dim parent hint on duplicates), the D1 colored letter badges became **plain spaced letters**, and the STATE summary column split into **VISIBILITY + STATUS**. One framed header box now holds title/status, tabs, a per-tab metadata line, and the filter chips (runtimes and kinds on their own lines). Project + Global tables show `NAME · KIND · SCOPE · VISIBILITY · STATUS · SOURCE · RUNTIMES` with real column rules and edge-to-edge cursor rows; USED/reach stays on the Leaderboard. A bundled-skill group header now *is* its plugin's row (matched by `bundledInPlugin === plugin.id` — no duplicate plugin leaf), and the Global tab groups the same way (its `s` sort toggle retired). The project path renders above the item table.

## Epic A — Dashboard shell: tabbed navigation

Foundational; the Global and Leaderboard views hang off this. **Shipped 2026-06-25** (`epic-a-dashboard-shell`, merged to `main` @ `3de5c25`) — see `docs/superpowers/specs/2026-06-24-dashboard-shell-design.md` + `docs/superpowers/plans/2026-06-25-dashboard-shell.md`.

- [x] **A1. Top-level tab nav** — a global nav bar with `Folders | Global | Leaderboard / Stats`. Tab state + keyboard switching (e.g. `tab`/number keys). _(L · new UI)_ — from "leaderboard tab in a global nav. tabs shows folder view | global | leaderboard / stats"
- [x] **A2. Global tab** — full scrollable list of the global skills/plugins/MCP (today only the count band is shown). _(M · data exists)_ — from "need to see the list of globals"
- [x] **A3. Leaderboard / Stats tab** — rank skills by how many runtimes use them (usedBy count); summary stats (totals, per-runtime, per-provider, per-folder). _(M · data exists)_ — from "leaderboard tab… / stats" + "count of used times"

## Epic B — Folder list UX

**B1/B3/B4 shipped 2026-06-26** (`epic-b-folder-ux`, merged to `main` @ `d6a08b6`) — see `docs/superpowers/specs/2026-06-26-folder-ux-design.md` + `docs/superpowers/plans/2026-06-26-folder-ux.md`. Turned out **presentation-only**: a new pure `render/ink/tree.ts` builds the tree from `folders[].path` (verified against the live 31-folder disk) — **no `discovery.ts` change**. "Hidden" resolved to **dot-segment** paths (any home-relative segment starting with `.`), hidden by default. Counts are **aggregate subtree totals**; single-child synthetic chains are **compressed**.

- [x] **B1. Tree view for nested folders** — replace the flat grouped list with a hierarchy showing real nesting (e.g. `Developer/Projects/foo` under `Developer/Projects`). Collapsible nodes. _(L · render builds the tree; synthetic intermediates + single-child compression)_ — from "tree structure to show nested folders" — **superseded 2026-07-06:** the tree turned out noisier than useful; replaced by the flat project list (ui-restructure).
- [x] **B2. Remove the trailing dots** — drop the `·` "global only" marker after folders; convey it more subtly (dim name / no marker). _(S · quick win)_ — from "remove the dots after the folders" — **verified & closed 2026-07-06:** `FolderList` conveys "global only" with a dim name; no marker.
- [x] **B3. Show/hide hidden folders** — `.` toggles dot-segment folders (default hidden); footer shows state. _(M · render predicate `isHiddenPath`)_ — from "show hide hidden folders"
- [x] **B4. Sort options** — `s` cycles **items** (aggregate desc, ties→name) and **name**; default most-items-first; footer shows the mode. _(M · sort siblings at every tree level)_ — from "order by most within a folder. sort options"

## Epic C — Skill presentation & grouping

- [x] **C1. Group plugin-bundled skills under their plugin** — collapse/expand a plugin to reveal the skills it ships (e.g. all `gsap-skills` together). _(M · `bundledInPlugin` already on records; the expand/collapse interaction lives in **F2**)_ — from "better grouping of skills if they live under a plugin… collapsed and expanded view" **Shipped 2026-06-25** with Epic F (`grouping.ts` + F2).
- [x] **C2. Skills table/grid layout** — restructure the item lists into a proper table/grid instead of flat lines. _(M · render work)_ — from "improve layout of the list of skills data table, grid" **Shipped 2026-07-06** with ui-restructure (bordered `NAME · KIND · SCOPE · VISIBILITY · STATUS · SOURCE · RUNTIMES` grid with column rules; the detail pane keeps labelled lines).
- [x] **C3. Show "used N times"** — surface the usedBy count per skill; make it a sort key. _(S · data exists)_ — from "show count of used times" / "sort options" **Shipped 2026-06-26** with Epic D (`sortItemRows` + `s` toggle on the Global list).
- [x] **C4. Show origin URL** — display where a skill lives (GitHub repo / website) from `provider.sourceUrl`; make it copyable/openable. _(S · data exists)_ — from "url of where the skills lives (ie the website, gh repo)" **Shipped 2026-06-26** with Epic D (detail `url` as a `terminal-link` hyperlink).

## Epic D — Visual identity & iconography

**Shipped 2026-06-26** (`epic-d-visual-identity`, merged to `main` @ `65b9692`) — see `docs/superpowers/specs/2026-06-26-visual-identity-design.md` + `docs/superpowers/plans/2026-06-26-visual-identity.md`. Presentation-only (`render/ink/*`): one pure `runtimeMark.ts` maps the 6 detected runtimes (claude-code `C`, codex `X`, hermes-agent `H`, gemini-cli `G`, cursor `U`, opencode `O`) to reverse-video colored letter **badges**, surfaced via `Badges.tsx` across the detail `used by` line (+ dim `+N` remainder), the Leaderboard/Global `USES` column, the Folders items column (a `dense` ItemTable mode) and folder-tree rows, and the GLOBAL/STATS bands. Icon strategy resolved to **colored letters, Nerd Fonts deferred**. Folded in **C3** + **C4**. **Superseded 2026-07-06:** the colored reverse-video badges read as noise at list density; runtimes now render as plain spaced letters (ui-restructure), same letter mapping.

- [x] **D1. Runtime icons/glyphs** — per-runtime marks (claude-code, cursor, codex, …) to show origin and usedBy at a glance. Needs an icon strategy (see open questions). _(M · cross-cutting)_ — from "folder icons, perhaps claude code, cursor, codex icons for where the skills originated"
- [x] **D2. Interface polish** — overall richness: spacing, color hierarchy, density of the lists. _(M · render work)_ — from "richer interface"

## Epic E — Interactive filtering

**E1 shipped 2026-06-26** (`epic-e-filter`, merged to `main` @ `bb198e2`) — see `docs/superpowers/specs/2026-06-26-runtime-filter-design.md` + `docs/superpowers/plans/2026-06-26-runtime-filter.md`. Presentation-only: filter state lifted into `App`, applied via the existing `filterInventory` live; a `f`-toggled filter bar owns the chips while view input is gated with Ink's `useInput({ isActive })`. **Kind chips (skill/plugin/mcp) folded in** alongside runtimes. Folder-tree counts / GlobalBand / stats re-derive from the filtered inventory for free.

- [x] **E1. In-dashboard runtime + kind filter** — `f` opens a chip bar; `←/→` move, `Space` toggles, `a` clears; runtimes (by `usedBy`/producing runtime) **and** kinds, ANDed. _(M · reused `filterInventory`; new `filterChips.ts` + `FilterBar.tsx`)_ — from "filter by cc, codex etc"

## Epic F — Drill navigation (left-to-right focus / Miller columns)

A keyboard focus model that lets you move *into* a folder, walk its contents, expand plugin groups, and open a skill's detail — navigating left → right. **Shipped 2026-06-25** (`epic-f-drill-navigation`, merged to `main` @ `cb25e5b`) — see `docs/superpowers/specs/2026-06-25-drill-navigation-design.md` + `docs/superpowers/plans/2026-06-25-drill-navigation.md`. F3 detail **replaces the items pane** (two columns, not a third Miller column) and is reachable from all three tabs.

- [x] **F1. Column focus model** — `Enter` on a folder moves focus from the folder list (col 1) into the items column (col 2); ↑/↓ then navigate items there. A clear indicator shows which column is active. `Esc` (and `←` at the top level) returns focus to the folders. _(L · new interaction layer in `render/ink`)_ — from "navigate a folder and press Enter… takes you to the second column"
- [x] **F2. Expand/collapse plugin groups** — in the focused items column, `→` expands a collapsed plugin to reveal its nested skills; `←` collapses it (or, at the top level, steps back to the folder column). This is the interaction for **C1**. _(M, with C1)_ — from "pressing the right arrow on a collapsed plug-in list… would open it"
- [x] **F3. Skill detail view** — `Enter` on a skill opens an info view: description, provider (origin repo + URL), used-by runtimes, bundled-in-plugin, scope, content hash, path. Surfaces the data from **C2/C4**. _(M · data exists; needs a detail pane/modal)_ — from "pressing Enter on a skill would show information about that skill"

**Shipped keymap** (as of the 2026-07-06 flat list)

- _Folders col:_ `↑/↓` move · `Enter`/`→` focus items · `s` sort · `.` hidden · `q` quit
- _Items col:_ `↑/↓` move · `→` expand plugin / open detail · `←` collapse / back to folders · `Enter` detail (or expand, if a plugin group) · `Esc` back to folders
- _Detail:_ `Esc` / `←` back

---

## Suggested sequencing

**All v0.2 epics shipped as of 2026-07-06** — sequencing list removed; the architectural takeaway stands:

Most of this is **presentation-layer** (`render/ink/*`, `render/plain.ts`) — the engine already captures `usedBy`, `sourceUrl`, `bundledInPlugin`, `provider.kind`, and supports filtering. (B1/B3 were expected to maybe touch `discovery.ts`, but shipped purely in `render/ink/*` — the tree, hidden filter, and sort are all pure functions of `folders[].path`.)

## Open questions (resolve in the planning session)

- ~~**"Hidden folders"** — define it: dot-folders? trees currently pruned by the walk (`Library`, `node_modules`)? folders that are "global only"?~~ **Resolved (B3):** dot-segment paths (any home-relative segment starting with `.`), hidden by default. On the live disk only 3 of 31 qualify (`.config`, `.config/sketchybar`, `…/.od/projects/<uuid>`), all from the registry since the walk already skips dot-dirs.
- ~~**Icons (D1)** — Nerd Fonts (not universally installed) vs ASCII/letter badges vs colored initials?~~ **Resolved (D1):** reverse-video **colored single-letter badges** (one ASCII cell each, truecolor bg + contrast letter), bounded to the 6 detected runtimes; Nerd-Font glyphs deferred (module shaped for a later opt-in). Verified rendering in-terminal (single-cell, correct hues/contrast, aligned columns).
- ~~**"Used times" (C3/A3)** — confirm this means *number of runtimes that use the skill* (we have that), not invocation counts (we don't track those).~~ **Resolved (C3):** yes — `usedBy.length` (registry-wide runtime reach); the `USED` count + `s` sort key both use it, while badges show the installed subset (detail adds a dim `+N` for the rest).
- ~~**Leaderboard scope (A3)** — skills only, or plugins/MCP too? Global, or filterable by runtime?~~ **Resolved:** skills only (reach is a skill concept — plugins/MCP have one declaring runtime); universe is the whole machine; the E1 filter chips apply to it like every view.
- ~~**Scope of the table/grid (C2)** — dashboard only for now, or also feed the `--report` output and the eventual web UI?~~ **Resolved (2026-07-06):** dashboard only; `--report` stays a plain grouped listing.
- ~~**Skill detail (F3) presentation** — a third Miller column, a modal overlay, or replace the items pane?~~ **Resolved (F3):** replaces the items pane.
- ~~**`←` overloading (F2)** — should `←` collapse an expanded plugin first and only step back to folders when nothing is expanded?~~ **Resolved:** yes — `←` collapses the expanded header (from a child it collapses the parent and lands on it); otherwise it steps back to folders.
- ~~**Leaf actions (F3)** — on a plain skill, do both `Enter` and `→` open the detail? And on a collapsed plugin, does `Enter` expand or open a "plugin detail"?~~ **Resolved:** both open a leaf's detail; on a group header `Enter` toggles expansion (the header *is* the plugin row since 2026-07-06, so its state is already visible without a detail hop).

## Epic G — Claude Code skill visibility (`skillOverrides`)

**Shipped 2026-07-04** (`skill-visibility` + `state-column` + follow-ups) — see `docs/superpowers/specs/2026-07-04-skill-visibility-design.md`. skillsight previously ignored Claude Code's `skillOverrides` (on / name-only / user-invocable-only / off), so the effective view over-reported: parked/off skills rendered as fully enabled. Layering verified empirically on v2.1.201: all three settings layers work, per-key merge, `local > project > user`. The interim STATE summary column split into **VISIBILITY + STATUS** in the 2026-07-06 ui-restructure.

- [x] **G1. Resolve visibility in the claude-code adapter** — read `skillOverrides` from user/project/local layers, attach `visibility` + `visibilitySource` to `SkillRecord`; `off` → `enabled: false`. _(M · spec has the algorithm; fixture-driven)_
- [x] **G2. Surface it** — `--json` additive fields, detail view line, dim parked rows, `--provenance` in plain report. _(S–M · render)_

## Beyond v0.2 (carried from v1 plan)

- **Folders view mode: delta ↔ full effective.** The Folders tab deliberately shows each project's *delta* (project-scope installs + per-project enablement overrides) — what it adds/changes beyond the inherited global layer — so user-enabled globals (e.g. superpowers) live only in the Global tab, not repeated under all 34 projects. A toggle (e.g. `e`) would flip a selected project to its **full effective** set — inherited global + delta together — for when you want the complete "what's actually live here" picture in the dashboard (already available via `--report --full` / `--json`). Inherited rows would render dim / tagged `inherited` to stay distinct from the project's own deltas. _(S–M · render only; `effective` is already computed per folder)_
- Web UI consuming `skillsight --json` (React port of the Ink components)
- Project-level `.agents/skills` hub scanning (deferred from the 2026-07-03 consolidation pass — needs usedBy semantics + fixtures; `runtimes.ts`'s dead `projectSkills` field was removed, codex comment fixed)
- Configurable personal-repo path (`~/Developer/Skills` is a hardcoded personal convention in `skillscan.ts` — other users' repos classify as user/project-local)
- First-class non-skill units: Cursor **rules**, Gemini **extensions**, Codex/OpenCode **agents**
- Windows path/symlink + managed-settings handling
- Publish: GitHub repo + push + `npm publish`
