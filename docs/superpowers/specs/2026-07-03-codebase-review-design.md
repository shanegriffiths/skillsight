# Design — codebase review & consolidation pass

Date: 2026-07-03
Branch: `code-review-cleanup`
Baseline: 130 tests / 19 files green, `tsc --noEmit` clean, on `main` @ `35f2abd`.

## Context

Everything for v0.2 ("make the dashboard a real interface") is shipped. Before
the UI/UX polish sweep, this pass consolidates the codebase: five parallel
review agents (engine / adapters / CLI+output / render pure-logic / render
components) produced 38 findings; every claimed correctness bug was then
independently re-verified against source and root-caused. This spec covers the
**worthy** subset — bugs, the safety net that protects the refactor, and the
consolidations that clearly pay off. Churn that doesn't earn its keep is listed
under *Out of scope* with reasons.

**Stance:** consolidation, not rewrite. Observable behavior does not change
except for the eight deliberate changes in §Spec'd behavior changes, each of
which was decided explicitly (see §Decisions).

## Decisions (from brainstorming)

1. **Hub-direct skills become visible** (recommended option accepted). The
   engine already gathers every `~/.agents/skills` entry with lock provenance;
   skills used only by hub-direct universal agents (warp/zed/cline) are
   currently invisible, and `SharedSkill.name`/`description`/`contentId` are
   dead. We surface them rather than delete the machinery.
2. **Project-level `.agents/skills` hubs: clean up + defer.** Scanning them is
   feature work (usedBy semantics, fixtures). This pass fixes the contradicting
   codex comment, deletes the dead `projectSkills` registry field, and records
   the limitation in ROADMAP.
3. **Plain report hides dot-path folders**, matching the dashboard default
   (verified divergence: registry-sourced projects bypass any dot filter).
4. **Both small CLI behavior fixes land:** warn on unrecognized args / no-match
   filter values, and `--provenance` gains an MCP expansion.

## Spec'd behavior changes (the ONLY intentional output changes)

1. **Hub-direct skills appear** in the global bucket → Global tab, GLOBAL
   report section, `--json`, leaderboard. Skills with no symlink and no
   universal-agent selection appear with `usedBy: []` (honest: installed,
   unused).
2. **Dot-segment folders disappear from the plain report** (default and
   `--full` alike — plain has no toggle; the dashboard's `.` toggle remains the
   way to see them).
3. **Unrecognized flags/positionals warn on stderr**; `--kind`/`--runtime`
   values not in the known kind list / runtime registry warn on stderr at
   parse time. (A registry-valid but undetected runtime still yields empty
   output silently — future hardening.) Stdout and exit codes unchanged.
4. **`--provenance` expands MCP lines** (transport detail + env/header key
   *names* + scope), consistent with skills/plugins. Key names only — the
   privacy invariant already guarantees values are never stored.
5. **`--dir` no longer swallows a following flag** (`--dir --json` becomes an
   error instead of silently scanning a folder named `--json`).
6. **`enableAllProjectMcpServers` is honored from `settings.local.json`** as
   well as `settings.json` (bug fix — consistent with plugin enablement).
7. **Codex `[[skills.config]]` disablement matches by directory name** even
   when SKILL.md frontmatter declares a different `name` (bug fix).
8. **Plugin-bundled skills read SKILL.md frontmatter** → they gain
   `description` and honor a frontmatter `name` (bug fix; previously always
   directory basename, no description).

Everything else — dashboard look/behavior, column widths, JSON shape, report
layout — stays byte-identical, protected by new characterization tests.

## Workstream 0 — safety net (lands first)

Characterization tests written against **current** behavior before anything
moves; the spec'd changes above then update these snapshots deliberately, each
in its own task.

- **`renderPlain` / `renderJson` snapshot tests** over a constructed fixture
  inventory (default / `--full` / `--global` / `--provenance`; json).
  Normalize `generatedAt` + `homeRoot`; force color off (picocolors emits ANSI
  on TTY only — pin it so tests don't flake).
- **Adapter `collectForDirectory` coverage** (currently zero for the universal
  adapters): codex/gemini/opencode project paths, claude-code
  `defaultEnabled: true` fallback, `gemini-extension.json` supportsRuntimes
  branch, manifest-vs-sidecar MCP merge, opencode command-array `args` slice.
- **`resolve.test.ts`**: `mergeSkill` PROVIDER_RANK precedence, `usedBy` union,
  `description`/`bundledInPlugin` backfill; `parseFrontmatter`
  malformed/no-fence inputs.
- **Edge tests**: `tree.ts` outside-home branch; `scroll.ts`
  `height === length` boundary; `decideMode` watch>report precedence.

## Workstream 1 — verified bug fixes (each: failing test → fix)

All root-caused by direct code reading; file:line refs verified.

1. **`cli.ts:95`** `--dir` takes the next token unguarded, unlike
   `--runtime`/`--kind`. Guard with `isFlag`; error to stderr when the value is
   missing.
2. **`claude-code.ts:257`** `enableAllProjectMcpServers` read from
   `settings.json` only; merge with `settings.local.json` like `projEnabled`.
3. **`codex.ts:49` vs `:115`** disable set holds `basename(entry.path)` but is
   matched against the frontmatter-derived name. Match on the scanned directory
   entry name. Gemini's `skills.disabled` has the same *shape*
   (`gemini.ts:65-68`) but unverified semantics — check Gemini docs; if
   unverifiable, leave and comment.
4. **`claude-code.ts:150-162`** plugin-bundled skills never read SKILL.md;
   read frontmatter like every other skill source.
5. **`plain.ts:73-75`** hand-rolled folder delta omits `local.plugins` (latent
   today — `splitByScope` routes all plugins to projectScoped; verified). Add
   `bucketTotal(b)` beside `bucketCounts` in `resolve.ts`; use it here and in
   `tree.ts` `ownDelta`. Output provably unchanged.
6. **`GlobalView.tsx:30` / `LeaderboardView.tsx:55`** Enter/→ on an empty list
   opens a "nothing selected" detail. One-line guard.
7. **`frontmatter.ts:21`** closing-fence detection matches any `\n---` prefix
   (`----`, `--- x`), contradicting its own comment. Tighten to
   `/\n---(\r?\n|$)/`.
8. **`cli.ts:140`** `void main()` with no catch → unhandled rejection on any
   throw. `main().catch(...)` → message to stderr, `process.exitCode = 1`.

## Workstream 2 — hub-direct skill visibility

New pure function (in `sharedstore.ts` or `resolve.ts`):
`sharedStoreBucket(shared, enr): Bucket` building one `SkillRecord` per hub
skill — `provider: { kind: 'shared-store', path: realPath, source, sourceUrl,
skillFolderHash }`, `contentId: skillFolderHash ?? realPath`, `scope: 'global'`,
`enabled: true`, `usedBy` = reverse-symlink lookup ∪
`universalUsedBy(lastSelectedAgents)` — **no owner fallback** (an unused hub
skill honestly reports `usedBy: []`; render already handles empty badges /
USED 0). `scan()` merges it into the global bucket; the existing
`mergeSkill`-by-`contentId` collapses symlinked copies (adapter copies of hub
skills already carry `shared-store` provider kind via `providerForRealpath`, so
provider display is unchanged; PROVIDER_RANK is a no-op tie).

The three dead `SharedSkill` fields become live; the per-hub-skill frontmatter
read is no longer wasted. Fixture test: hub skill with no symlinks +
`lastSelectedAgents: ['warp']` appears globally with `usedBy: ['warp']`; a
symlinked one stays deduped (count unchanged).

## Workstream 3 — plain parity + CLI polish

- **Hidden folders:** `isHiddenPath` moves from `render/ink/tree.ts` to a new
  render-shared module `src/render/hidden.ts` (plain must not depend on the Ink
  tree module); `tree.ts` imports it from there. `renderPlain` filters
  `inv.folders` with it.
- **Unknown-token warnings:** `parseArgs` collects unrecognized tokens; `main`
  writes one stderr line per issue. Invalid/no-match `--kind`/`--runtime`
  values likewise (filter behavior itself unchanged).
- **`--provenance` MCP expansion:** `mcpLine` gains the `prov` param; one dim
  continuation line with transport detail (command/url), env/header key names,
  scope — mirroring `detail.ts` `mcpFields` semantics.

## Workstream 4 — render consolidation

- **`useListDetail` hook** extracts the byte-identical scroll + detail-toggle +
  keymap scaffolding duplicated across `GlobalView`/`LeaderboardView` (the two
  views become rows + chrome). Unit-testable where the views are not.
- **Tabs single-source:** a new pure module `render/ink/tabs.ts` owns `TABS`
  (id+key+label) and a `nextTab(current, dir)`; `TabBar` and `App`'s number-key
  dispatch both derive from it, unit-tested. Kills the triple definition in
  `App.tsx:17/53-57` + `TabBar.tsx:5-9`.
- **`toAction` moves to `folderNav.ts`**, typed against Ink's `Key`, tested.
- **Shared `<Position start end total>` + `<Band label>`** components replace
  the three copies of the position line and the duplicated band chrome
  (`GlobalBand` vs `StatsBand`), plus a `formatCounts` helper for the
  `N skills · N plugins · N mcp` triple.
- **`stats.ts`:** single `universe()` per render — `leaderboardStats(inv)`
  returning `{ rows, stats }`; `leaderboard` delegates sorting to
  `sortItemRows('used')` (kills the divergent `?? 0` vs `?? -1` comparator;
  output identical for skill-only rows, verified).
- **Defensive/typing nits:** `folderNav` items-switch gets a `default` arm;
  `USES_W` derives from `runtimeMark` marks length; `FilterBar`'s raw
  `'cyan'` routes through `theme.accent`.

Column widths/alignment verified unchanged after each render change
(guardrail): run the dashboard and compare, plus ItemTable width math is
untouched except the derived `USES_W` (same value, 6).

## Workstream 5 — performance

- **Memoize the per-keypress pipelines** (Ink re-renders the tree on every
  keystroke): `filterInventory` at the `App` boundary (highest leverage —
  currently re-filters the whole inventory per keypress), `buildFolderRows` +
  `groupedRows` in `FoldersView`, `itemRows`/`sortItemRows` in `GlobalView`,
  `leaderboardStats` in `LeaderboardView`. `useMemo` with real deps (filter
  Sets change identity only on toggle).
- **`claude-code.collectForDirectory`** re-reads four global files per
  directory and double-reports warnings (`installed_plugins.json` warns once
  per directory + once globally). Cache the global reads per scan (per-`ctx`
  memo) and emit warnings only from `collectGlobal`.
- **`providerForRealpath`** recomputes hub + personal-repo realpaths per skill;
  memoize per `ctx`.

## Workstream 6 — dead code, comments, docs

- Delete unused imports (`claude-code.ts` `isDir`, `Warning`; `codex.ts`
  `providerForRealpath`).
- Fix stale comments: `resolve.ts:72` merge key ("name+scope" → includes
  provider path); `codex.ts:124` project-skills claim.
- Delete dead `projectSkills` field from `runtimes.ts` (decision 2).
- Comment the deliberate watcher freeze-at-mount in `App.tsx` and the
  hermes-agent omission in `watchpaths.ts` (no single canonical config file).
- Document the `~/Developer/Skills` personal-repo convention as a known
  limitation (code comment + ROADMAP "beyond" note; config option is future
  OSS-readiness work).
- Cosmetics batch: `plain.ts` hand-rolled basename → `node:path` `basename`;
  `KINDS` cast → `Set`.

## Out of scope (deliberate)

- **Project-hub scanning** (decision 2) — ROADMAP note instead.
- **`--report` feature parity** with the dashboard (badges, sort, grouping,
  stats) — polish phase / future report redesign; this pass only fixes the
  hidden-folder divergence.
- **`ItemRow` discriminated union** (would remove three casts in `detail.ts`
  but ripples through `rows`/`grouping` construction — churn > value now;
  documented as a known type-safety gap).
- **SkillRecord-construction unification across adapters** — the per-source
  provider logic genuinely differs; over-unifying risks the documented adapter
  footguns. Only trivial reuse (e.g. codex reusing a shared `splitKey`) if it
  falls out naturally.
- **Tab-state persistence across tab switches**, StatsBand extraction, CHROME
  height heuristics — polish phase.

## Testing strategy

- Workstream 0 lands first; every subsequent task keeps `npm test` +
  `npm run typecheck` green.
- Bug fixes are TDD: failing test reproducing the root cause, then the fix.
- Snapshot updates happen **only** in tasks implementing a spec'd behavior
  change, with the diff inspected against this spec's §Spec'd behavior changes.
- Invariants re-asserted at the end: privacy (key names only), adapter
  footguns untouched, `usedBy` = reverse-symlink ∪ universal-agent semantics,
  dashboard parity (manual smoke via `npm run dev`: tree, filter bar, badges,
  sort cycling, detail, tabs, scroll, column alignment).
