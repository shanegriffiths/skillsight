# skillsight roadmap

Backlog for the next iteration. v1 (engine + adapters + CLI + default Ink dashboard) shipped on `main`. The theme of **v0.2 is making the dashboard a real interface** — navigation, grouping, richer presentation, and interactive filtering/sorting.

Each task notes its size (S/M/L), whether the data already exists in the engine, and the raw thought it came from.

---

## Epic A — Dashboard shell: tabbed navigation

Foundational; the Global and Leaderboard views hang off this.

- [ ] **A1. Top-level tab nav** — a global nav bar with `Folders | Global | Leaderboard / Stats`. Tab state + keyboard switching (e.g. `tab`/number keys). _(L · new UI)_ — from "leaderboard tab in a global nav. tabs shows folder view | global | leaderboard / stats"
- [ ] **A2. Global tab** — full scrollable list of the global skills/plugins/MCP (today only the count band is shown). _(M · data exists)_ — from "need to see the list of globals"
- [ ] **A3. Leaderboard / Stats tab** — rank skills by how many runtimes use them (usedBy count); summary stats (totals, per-runtime, per-provider, per-folder). _(M · data exists)_ — from "leaderboard tab… / stats" + "count of used times"

## Epic B — Folder list UX

- [ ] **B1. Tree view for nested folders** — replace the flat grouped list with a hierarchy showing real nesting (e.g. `Developer/Projects/foo` under `Developer/Projects`). Collapsible nodes. _(L · needs discovery to emit parent/child or render to build the tree)_ — from "tree structure to show nested folders"
- [ ] **B2. Remove the trailing dots** — drop the `·` "global only" marker after folders; convey it more subtly (dim name / no marker). _(S · quick win)_ — from "remove the dots after the folders"
- [ ] **B3. Show/hide hidden folders** — a toggle to include/exclude hidden folders. _(M · needs a definition of "hidden" — see open questions)_ — from "show hide hidden folders"
- [ ] **B4. Sort options** — sortable folder list: default **most items first**, plus name and others; visible sort indicator. _(M · data exists)_ — from "order by most within a folder. sort options"

## Epic C — Skill presentation & grouping

- [ ] **C1. Group plugin-bundled skills under their plugin** — collapse/expand a plugin to reveal the skills it ships (e.g. all `gsap-skills` together). _(M · `bundledInPlugin` already on records)_ — from "better grouping of skills if they live under a plugin… collapsed and expanded view"
- [ ] **C2. Skills table/grid layout** — restructure the detail pane into a proper table/grid (name · kind · provider · used-by · source) instead of flat lines. _(M · render work)_ — from "improve layout of the list of skills data table, grid"
- [ ] **C3. Show "used N times"** — surface the usedBy count per skill; make it a sort key. _(S · data exists)_ — from "show count of used times" / "sort options"
- [ ] **C4. Show origin URL** — display where a skill lives (GitHub repo / website) from `provider.sourceUrl`; make it copyable/openable. _(S · data exists)_ — from "url of where the skills lives (ie the website, gh repo)"

## Epic D — Visual identity & iconography

- [ ] **D1. Runtime icons/glyphs** — per-runtime marks (claude-code, cursor, codex, …) to show origin and usedBy at a glance. Needs an icon strategy (see open questions). _(M · cross-cutting)_ — from "folder icons, perhaps claude code, cursor, codex icons for where the skills originated"
- [ ] **D2. Interface polish** — overall richness: spacing, color hierarchy, density of the lists. _(M · render work)_ — from "richer interface"

## Epic E — Interactive filtering

- [ ] **E1. In-dashboard runtime filter** — toggle chips to filter by runtime (cc, codex, …) live, reusing the existing `filterInventory`. _(M · engine filter exists; needs UI)_ — from "filter by cc, codex etc"

---

## Suggested sequencing

1. **Quick wins first** (low risk, immediate value): B2 (remove dots), C3 (used count), C4 (origin URL).
2. **Shell** (unblocks views): A1 tabs → A2 Global tab → A3 Leaderboard.
3. **Richer lists**: C1 plugin grouping, C2 table/grid, then D2 polish.
4. **Navigation depth**: B1 tree, B4 sort, B3 hidden toggle.
5. **Cross-cutting last** (touches every view): D1 icons, E1 filter chips.

Most of this is **presentation-layer** (`render/ink/*`, `render/plain.ts`) — the engine already captures `usedBy`, `sourceUrl`, `bundledInPlugin`, `provider.kind`, and supports filtering. B1 (tree) and B3 (hidden) are the main items that may touch `discovery.ts`.

## Open questions (resolve in the planning session)

- **"Hidden folders"** — define it: dot-folders? trees currently pruned by the walk (`Library`, `node_modules`)? folders that are "global only"? The toggle's meaning shapes B3.
- **Icons (D1)** — Nerd Fonts (not universally installed) vs ASCII/letter badges vs colored initials? Suggest graceful default (colored initials) with optional glyphs.
- **"Used times" (C3/A3)** — confirm this means *number of runtimes that use the skill* (we have that), not invocation counts (we don't track those).
- **Leaderboard scope (A3)** — skills only, or plugins/MCP too? Global, or filterable by runtime?
- **Scope of the table/grid (C2)** — dashboard only for now, or also feed the `--report` output and the eventual web UI?

## Beyond v0.2 (carried from v1 plan)

- Web UI consuming `skillsight --json` (React port of the Ink components)
- First-class non-skill units: Cursor **rules**, Gemini **extensions**, Codex/OpenCode **agents**
- Windows path/symlink + managed-settings handling
- Publish: GitHub repo + push + `npm publish`
