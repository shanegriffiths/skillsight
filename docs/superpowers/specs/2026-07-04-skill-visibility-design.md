# Design — Claude Code skill visibility (`skillOverrides`)

Date: 2026-07-04
Branch: `skill-visibility` (suggested)
Baseline: `main` @ `a348fe4` — 183 tests green per the 2026-07-03 consolidation entry in ROADMAP; re-baseline before starting.

## Context

Claude Code (v2.1.129+) has a per-skill visibility system that skillsight
currently does not model at all (`grep -r skillOverrides src/` → zero hits).
Each key in a `skillOverrides` map is a skill name; each value is one of four
states:

| State | Listed to Claude | In `/` menu | Context cost |
|---|---|---|---|
| `on` (default) | name + description | yes | full |
| `name-only` | name only | yes | reduced |
| `user-invocable-only` | hidden | yes | zero |
| `off` | hidden | hidden | zero |

**Layering — verified empirically 2026-07-04 on Claude Code v2.1.201** (live
sessions probing skill visibility; the official docs only mention
`settings.local.json`, but tested behavior goes further):

- `skillOverrides` works in **all three** settings layers:
  `~/.claude/settings.json` (user), `<project>/.claude/settings.json`
  (project, committed), `<project>/.claude/settings.local.json` (local — what
  the `/skills` menu writes).
- Merge is **per-key**, higher layer wins: `local > project > user`.
  Verified: `chartli: off` at user layer + `chartli: on` at project layer →
  skill visible in that project.
- Statuses do **not** apply to plugin-bundled skills (those follow plugin
  enablement via `/plugin`).

This matters now because the owner's skills-management strategy is exactly
this mechanism: park the personal skill library globally as
`user-invocable-only` (zero context cost, still `/`-callable), promote
individual skills to `on` per project. As of 2026-07-04 the live machine has
27 skills parked at the user layer and per-project promotions in
`.claude/settings.json` files. **The visibility state IS the effective state
for Claude Code standalone skills** — skillsight's effective view currently
over-reports (a skill parked `off` still shows as effective; a parked
`user-invocable-only` skill renders identically to a fully-`on` one), and a
per-project promotion — the single most interesting per-folder fact under
this strategy — is invisible.

## Decisions (recommendations — confirm in the brainstorm)

1. **New field, `enabled` stays the coarse switch.** `SkillRecord` gains an
   optional `visibility` field. `enabled` is derived for claude-code
   standalone skills as `visibility !== 'off'`, so every existing counter,
   filter, and report treats `off` correctly with no changes. `name-only` and
   `user-invocable-only` stay `enabled: true` — they are still available (the
   whole point of the parked state) — and are distinguished by presentation.
2. **Resolution lives with the claude-code adapter, not the engine.** The
   engine/resolver stays runtime-agnostic. A pure resolution helper (settings
   maps in → visibility out) sits beside `src/adapters/claude-code.ts` and is
   applied wherever claude-code `SkillRecord`s are assembled
   (`skillscan.ts` / the adapter — implementer picks the exact seam). The
   adapter already reads both `settings.json` and `settings.local.json` per
   folder (see the `enableAllProjectMcpServers` fix, 2026-07-03) and caches
   global config reads per scan (`7be73f1`) — follow both patterns.
3. **Per-folder visibility, not per-record mutation of the global bucket.**
   A skill that physically lives globally can have different visibility in
   every folder. The global `Bucket` carries user-layer-resolved visibility;
   each `FolderReport.effective` bucket carries that folder's fully-resolved
   visibility (`local ?? project ?? user ?? 'on'`). Records keep their
   physical `scope`; visibility is orthogonal.
4. **Plugin-bundled skills are exempt.** Records with `bundledInPlugin` set
   never get a visibility override applied, even if the map names them
   (matches Claude Code behavior).

## Spec'd behavior changes (the ONLY intentional output changes)

1. **`--json`**: `SkillRecord` gains `visibility?: 'on' | 'name-only' |
   'user-invocable-only' | 'off'` and `visibilitySource?: 'user' | 'project'
   | 'local'` (the layer that decided it). Absent = no override = `on`.
   Additive only — the schema is a stable contract.
2. **Effective view honors `off`**: a skill resolved `off` for a folder has
   `enabled: false` in that folder's `effective` bucket (and in the global
   bucket when set at the user layer). Existing enabled/disabled rendering
   and counts then apply.
3. **Ink detail view** (`DetailView`) shows the visibility state and which
   layer set it (e.g. `visibility: user-invocable-only (user)` /
   `on (project — promoted)`).
4. **Parked skills render distinctly**: `user-invocable-only` and
   `name-only` rows are dimmed and/or badged in the item tables — present
   but visibly not costing context. Not hidden.
5. **Plain report**: `--provenance` lines include the visibility state when
   it is not `on`, consistent with how other detail expands.
6. **Folder deltas surface promotions/demotions**: a folder whose settings
   override a skill's user-layer visibility shows that as part of the
   folder's story (it is a project-scoped fact even though the skill file
   lives globally). Exact presentation is the implementer's call; minimum
   bar is that the detail view and `--json` make it recoverable
   (`visibilitySource`).

## Resolution algorithm

```
userMap    = read(~/.claude/settings.json).skillOverrides            // once per scan, honor SKILLSIGHT_HOME
projectMap = read(<folder>/.claude/settings.json).skillOverrides     // per folder
localMap   = read(<folder>/.claude/settings.local.json).skillOverrides

visibility(name, folder) = localMap[name] ?? projectMap[name] ?? userMap[name] ?? 'on'
```

- Applies to standalone skills only (personal `~/.claude/skills` and project
  `.claude/skills`); skip `bundledInPlugin` records.
- Unknown/invalid state values: treat as `on` and push a `Warning` (the
  inventory already has a `warnings` channel).
- Overrides naming skills that don't exist: ignore silently (they are
  forward references, common when settings outlive skills).

## Tests

- Fixture home under `SKILLSIGHT_HOME` covering: user-layer park
  (`user-invocable-only`), project-layer promotion over a user park
  (`on` beats `user-invocable-only`), local-layer demotion (`off` beats
  project `on`), `off` at user layer reflected in the global bucket, an
  override naming a nonexistent skill (no crash, no record), an override
  naming a plugin-bundled skill (ignored), an invalid state value (warning,
  treated as `on`).
- Characterization snapshots for `--report` / `--json` updated deliberately
  (they exist since the 2026-07-03 pass; the diff should show only the
  spec'd changes above).

## Open questions (resolve in planning)

- **Override key identity**: is the `skillOverrides` key the skill's
  directory name or its SKILL.md frontmatter `name` when they differ? (The
  verification probe used `chartli`, where both are identical. Note the
  Codex adapter had exactly this bug — disablement matched frontmatter names
  instead of dir names, fixed 2026-07-03. Suggest a 2-minute empirical test
  with a renamed fixture before coding the lookup.)
- **Leaderboard/stats semantics**: should `user-invocable-only` skills count
  in totals as-is, or split "in context" vs "parked" counts? (A "context
  tax per folder" stat is a natural follow-up but out of scope here.)
- **Filter chip**: add a visibility dimension to the `f` filter bar, or
  defer? (Defer is fine; the chips are cheap to add later.)

## Out of scope

- Other runtimes' visibility analogues (Codex `[[skills.config]]` disable is
  already modeled; nothing new there).
- Writing or toggling state — skillsight stays read-only by design.
- Per-skill token-cost estimation (pairs with the `~tok` figures the
  `/skills` menu shows; roadmap candidate, not this pass).
- SKILL.md `disable-model-invocation: true` frontmatter (behaves like a
  baseline `user-invocable-only`) — worth modeling eventually, separate
  pass.
