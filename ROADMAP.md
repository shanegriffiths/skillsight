# skillsight roadmap

Backlog for the next iteration. v1 (engine + adapters + CLI + default Ink dashboard) shipped on `main`. The theme of **v0.2 is making the dashboard a real interface** — navigation, grouping, richer presentation, and interactive filtering/sorting.

Each task notes its size (S/M/L), whether the data already exists in the engine, and the raw thought it came from.

---

## Bugs

- [x] **Home directory shows as a project with ~99 duplicate "global" skills.** `/Users/<you>` is in Claude's project registry, so it was discovered as a folder; scanning it read `~/.claude/skills`, `~/.agents/skills`, etc. — the global skill dirs — and re-listed them as `project-scoped` (the `shane +99` row). **Fixed 2026-06-24** — `discovery.ts` now excludes `homeRoot` (and `/`); regression test in `test/discovery.test.ts`.

---

## Epic A — Dashboard shell: tabbed navigation

Foundational; the Global and Leaderboard views hang off this. **Shipped 2026-06-25** (`epic-a-dashboard-shell`, merged to `main` @ `3de5c25`) — see `docs/superpowers/specs/2026-06-24-dashboard-shell-design.md` + `docs/superpowers/plans/2026-06-25-dashboard-shell.md`.

- [x] **A1. Top-level tab nav** — a global nav bar with `Folders | Global | Leaderboard / Stats`. Tab state + keyboard switching (e.g. `tab`/number keys). _(L · new UI)_ — from "leaderboard tab in a global nav. tabs shows folder view | global | leaderboard / stats"
- [x] **A2. Global tab** — full scrollable list of the global skills/plugins/MCP (today only the count band is shown). _(M · data exists)_ — from "need to see the list of globals"
- [x] **A3. Leaderboard / Stats tab** — rank skills by how many runtimes use them (usedBy count); summary stats (totals, per-runtime, per-provider, per-folder). _(M · data exists)_ — from "leaderboard tab… / stats" + "count of used times"

## Epic B — Folder list UX

**B1/B3/B4 shipped 2026-06-26** (`epic-b-folder-ux`) — see `docs/superpowers/specs/2026-06-26-folder-ux-design.md` + `docs/superpowers/plans/2026-06-26-folder-ux.md`. Turned out **presentation-only**: a new pure `render/ink/tree.ts` builds the tree from `folders[].path` (verified against the live 31-folder disk) — **no `discovery.ts` change**. "Hidden" resolved to **dot-segment** paths (any home-relative segment starting with `.`), hidden by default. Counts are **aggregate subtree totals**; single-child synthetic chains are **compressed**.

- [x] **B1. Tree view for nested folders** — replace the flat grouped list with a hierarchy showing real nesting (e.g. `Developer/Projects/foo` under `Developer/Projects`). Collapsible nodes. _(L · render builds the tree; synthetic intermediates + single-child compression)_ — from "tree structure to show nested folders"
- [ ] **B2. Remove the trailing dots** — drop the `·` "global only" marker after folders; convey it more subtly (dim name / no marker). _(S · quick win)_ — from "remove the dots after the folders" — **note:** the current `FolderList` already has no `·` marker (dim + cyan `+N` only), so this appears effectively done; verify and close.
- [x] **B3. Show/hide hidden folders** — `.` toggles dot-segment folders (default hidden); footer shows state. _(M · render predicate `isHiddenPath`)_ — from "show hide hidden folders"
- [x] **B4. Sort options** — `s` cycles **items** (aggregate desc, ties→name) and **name**; default most-items-first; footer shows the mode. _(M · sort siblings at every tree level)_ — from "order by most within a folder. sort options"

## Epic C — Skill presentation & grouping

- [x] **C1. Group plugin-bundled skills under their plugin** — collapse/expand a plugin to reveal the skills it ships (e.g. all `gsap-skills` together). _(M · `bundledInPlugin` already on records; the expand/collapse interaction lives in **F2**)_ — from "better grouping of skills if they live under a plugin… collapsed and expanded view" **Shipped 2026-06-25** with Epic F (`grouping.ts` + F2).
- [ ] **C2. Skills table/grid layout** — restructure the detail pane into a proper table/grid (name · kind · provider · used-by · source) instead of flat lines. _(M · render work)_ — from "improve layout of the list of skills data table, grid"
- [ ] **C3. Show "used N times"** — surface the usedBy count per skill; make it a sort key. _(S · data exists)_ — from "show count of used times" / "sort options"
- [ ] **C4. Show origin URL** — display where a skill lives (GitHub repo / website) from `provider.sourceUrl`; make it copyable/openable. _(S · data exists)_ — from "url of where the skills lives (ie the website, gh repo)"

## Epic D — Visual identity & iconography

- [ ] **D1. Runtime icons/glyphs** — per-runtime marks (claude-code, cursor, codex, …) to show origin and usedBy at a glance. Needs an icon strategy (see open questions). _(M · cross-cutting)_ — from "folder icons, perhaps claude code, cursor, codex icons for where the skills originated"
- [ ] **D2. Interface polish** — overall richness: spacing, color hierarchy, density of the lists. _(M · render work)_ — from "richer interface"

## Epic E — Interactive filtering

- [ ] **E1. In-dashboard runtime filter** — toggle chips to filter by runtime (cc, codex, …) live, reusing the existing `filterInventory`. _(M · engine filter exists; needs UI)_ — from "filter by cc, codex etc"

## Epic F — Drill navigation (left-to-right focus / Miller columns)

A keyboard focus model that lets you move *into* a folder, walk its contents, expand plugin groups, and open a skill's detail — navigating left → right. **Shipped 2026-06-25** (`epic-f-drill-navigation`, merged to `main` @ `cb25e5b`) — see `docs/superpowers/specs/2026-06-25-drill-navigation-design.md` + `docs/superpowers/plans/2026-06-25-drill-navigation.md`. F3 detail **replaces the items pane** (two columns, not a third Miller column) and is reachable from all three tabs.

- [x] **F1. Column focus model** — `Enter` on a folder moves focus from the folder list (col 1) into the items column (col 2); ↑/↓ then navigate items there. A clear indicator shows which column is active. `Esc` (and `←` at the top level) returns focus to the folders. _(L · new interaction layer in `render/ink`)_ — from "navigate a folder and press Enter… takes you to the second column"
- [x] **F2. Expand/collapse plugin groups** — in the focused items column, `→` expands a collapsed plugin to reveal its nested skills; `←` collapses it (or, at the top level, steps back to the folder column). This is the interaction for **C1**. _(M, with C1)_ — from "pressing the right arrow on a collapsed plug-in list… would open it"
- [x] **F3. Skill detail view** — `Enter` on a skill opens an info view: description, provider (origin repo + URL), used-by runtimes, bundled-in-plugin, scope, content hash, path. Surfaces the data from **C2/C4**. _(M · data exists; needs a detail pane/modal)_ — from "pressing Enter on a skill would show information about that skill"

**Proposed keymap**

- _Folders col:_ `↑/↓` move · `Enter` focus items · `q` quit
- _Items col:_ `↑/↓` move · `→` expand plugin · `←` collapse / back to folders · `Enter` skill detail (or expand, if a plugin) · `Esc` back to folders
- _Detail:_ `Esc` / `←` back

---

## Suggested sequencing

1. **Quick wins first** (low risk, immediate value): B2 (remove dots), C3 (used count), C4 (origin URL).
2. **Shell** (unblocks views): A1 tabs → A2 Global tab → A3 Leaderboard.
3. **Richer lists**: C1 plugin grouping, C2 table/grid, then D2 polish.
4. **Navigation depth**: B1 tree, B4 sort, B3 hidden toggle.
5. **Cross-cutting last** (touches every view): D1 icons, E1 filter chips.

Most of this is **presentation-layer** (`render/ink/*`, `render/plain.ts`) — the engine already captures `usedBy`, `sourceUrl`, `bundledInPlugin`, `provider.kind`, and supports filtering. (B1/B3 were expected to maybe touch `discovery.ts`, but shipped purely in `render/ink/*` — the tree, hidden filter, and sort are all pure functions of `folders[].path`.)

## Open questions (resolve in the planning session)

- ~~**"Hidden folders"** — define it: dot-folders? trees currently pruned by the walk (`Library`, `node_modules`)? folders that are "global only"?~~ **Resolved (B3):** dot-segment paths (any home-relative segment starting with `.`), hidden by default. On the live disk only 3 of 31 qualify (`.config`, `.config/sketchybar`, `…/.od/projects/<uuid>`), all from the registry since the walk already skips dot-dirs.
- **Icons (D1)** — Nerd Fonts (not universally installed) vs ASCII/letter badges vs colored initials? Suggest graceful default (colored initials) with optional glyphs.
- **"Used times" (C3/A3)** — confirm this means *number of runtimes that use the skill* (we have that), not invocation counts (we don't track those).
- **Leaderboard scope (A3)** — skills only, or plugins/MCP too? Global, or filterable by runtime?
- **Scope of the table/grid (C2)** — dashboard only for now, or also feed the `--report` output and the eventual web UI?
- **Skill detail (F3) presentation** — a third Miller column, a modal overlay, or replace the items pane?
- **`←` overloading (F2)** — when focused in the items column, should `←` collapse an expanded plugin first and only step back to folders when nothing is expanded? (proposed: yes.)
- **Leaf actions (F3)** — on a plain skill, do both `Enter` and `→` open the detail? And on a collapsed plugin, does `Enter` expand or open a "plugin detail"?

## Beyond v0.2 (carried from v1 plan)

- Web UI consuming `skillsight --json` (React port of the Ink components)
- First-class non-skill units: Cursor **rules**, Gemini **extensions**, Codex/OpenCode **agents**
- Windows path/symlink + managed-settings handling
- Publish: GitHub repo + push + `npm publish`
