# Design — STATE column in Global + Leaderboard item tables

Date: 2026-07-04
Branch: `state-column`
Baseline: `main` @ `af22179` (skill-visibility merge) — 211 tests green.

## Context

The Ink dashboard's Global and Leaderboard tables show KIND / NAME / USED /
USES / SOURCE. Availability facts exist on the records — `enabled` (all
kinds) and, since the skill-visibility pass, `visibility` /
`visibilitySource` on claude-code standalone skills — but the only table
signal is the dimmed name on parked skills. Shane wants a column that says
*what* the state is at a glance.

**Concept decision (resolved in brainstorm):** the column is named **STATE**
and is an umbrella *summary* over two distinct attributes — visibility
(claude-code `skillOverrides`) and enablement (plugins, MCP approval, codex
disablement). The detail view keeps the precise `visibility: <verbatim
state> (<layer>)` field as the *mechanism*; the column deliberately
abbreviates (`invoke-only`) while the detail stays verbatim
(`user-invocable-only`). Column = summary, detail = cause.

**Leaderboard caveat (pre-existing merge semantics):** the Leaderboard's
universe merge dedupes by contentId and keeps ONE record's fields wholesale
(`mergeSkill`, rank/first-insert). A per-folder `off` on a skill that also
exists globally is shadowed by the global record's state there — identical
to how `parked` dimming already behaved. STATE is consistent with the rest
of the merge, not a new source of truth.

## Behavior (the ONLY intentional output changes)

1. **`ItemRow` gains `state?: 'off' | 'invoke-only' | 'name-only' |
   'disabled'`** — derived in `rows.ts`, present only when set (conditional
   spread; `rows.test.ts` compares rows with exact `toEqual`).
   Derivation:
   - Skill with `visibility`: `off → 'off'`, `user-invocable-only →
     'invoke-only'`, `name-only → 'name-only'`, `on →` absent (blank).
   - Skill without `visibility` and `enabled: false` (e.g. codex
     disablement): `'disabled'`.
   - Plugin / MCP with `enabled: false`: `'disabled'` (covers unapproved
     `.mcp.json` servers).
   - Everything plainly available: field absent → blank cell, so
     exceptions pop.
2. **`ItemTable` renders a STATE column** between USES and SOURCE, header
   `STATE`, width 11 (`invoke-only` is the longest label). Colors:
   `off` / `disabled` red; `invoke-only` / `name-only` dim. Shown whenever
   the table is not `dense` — which is exactly GlobalView + LeaderboardView
   with no new prop; the cramped Folders column keeps its current shape.
3. **Parked-row name dimming stays** (unchanged; the column explains it).

## Out of scope

- `--json`, plain report, DetailView: unchanged. (`ItemRow.state` is
  render-side only and never serialized.)
- Dense Folders table.
- A visibility/state filter chip (still deferred from the visibility spec).

## Tests

- `rows.test.ts`: derivation matrix — all four states, blank for plain
  enabled, blank for `visibility: 'on'`, `disabled` for a
  codex-style skill (`enabled: false`, no visibility), `disabled` for
  plugin/MCP `enabled: false`; plus existing exact-equality tests staying
  green (conditional spread).
- No component-level render test (same stance as the parked-dim change).
