# Sort by the SOURCE column

**Date:** 2026-07-14
**Status:** approved

## What

Add a `source` sort mode to the `s` cycle on the two tabs whose tables show the
SOURCE column: Leaderboard (`LEADERBOARD_SORTS`) and User Scope
(`USERSCOPE_SORTS`). Project Scope is untouched — its footprint variant has no
SOURCE column, and the standing rule is each tab lists only the modes its
columns support. Folders' folder-column sort is unchanged. No new keybinding;
the filter box already shows the active label.

## Comparator (`bySource` in `sortModes.ts`)

Three tiers, alphabetical within each, existing `then()` name tie-break:

1. Real repo/marketplace sources (`source` set, `sourceDim` false) — e.g.
   `obra/superpowers`, `anthropics/skills`.
2. Dim fallbacks (`sourceDim` true) — provider kinds (`builtin`) and MCP
   transport kinds (`stdio`, `http`).
3. Empty SOURCE cell — last.

Matches the `byScope` precedent: real-valued rows lead, fallbacks trail.

## Group headers

Source-group headers (`groupId` starting `src:`) carry `source: null`, but
their `name` **is** the source label — so the comparator's key is
`row.source ?? (src-group ? row.name : null)`. Without this, every multi-skill
hub would sink to tier 3 and the sort would look broken exactly where sources
matter most. `src:` headers are never dim (their children are real-repo skills
by construction in `skillGroup`). Plugin-bundle headers (`plugin:` groups)
genuinely render an empty SOURCE cell and stay in tier 3 — WYSIWYG.

## Cycle position

`source` goes immediately after `name` in both cycles:

| Tab | cycle (native first) |
|-----|----------------------|
| Leaderboard | uses → reach → locations → name → **source** → enabled → visibility → scope → kind |
| User Scope | grouped → name → **source** → enabled → visibility → scope → kind |

## Testing

Extend `test/sortModes.test.ts`: tier ordering (real < dim < empty),
alphabetical within tiers, name tie-break on equal sources, a `src:` header
sorting by its label among leaves, and the cycle lists containing `source`
after `name` (leaderboard + user scope) but not project.
