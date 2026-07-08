# Real skill usage on the Leaderboard

**Date:** 2026-07-08
**Status:** approved

## Problem

The Leaderboard ranked by REACH (runtime availability), which read as usage and
misled — `agent-browser` showed reach 1 though it's been run 29 times. Claude
Code *does* record real per-skill usage in `~/.claude.json → skillUsage`
(`{ usageCount, lastUsedAt }`), keyed by bare skill name (standalone/hub) or
`plugin:skill` (bundled). Surface it as real usage.

Caveat: this is **Claude Code** usage only — other runtimes expose no equivalent,
so a skill used only in Codex reads 0. Labeled as such.

## Model + enrichment

- `SkillRecord` gains `usageCount?: number` and `lastUsedAt?: number`.
- New `skillusage.ts`: `parseSkillUsage(raw)` (pure, tolerant) → `Map<key, {count,
  lastUsedAt}>`; `readSkillUsage(ctx)` reads `~/.claude.json`; `usageKey(name,
  bundledInPlugin?)` = `name` or `${pluginName}:${name}`.
- `EnrichContext` gains `usageByKey`. `enrichBucket` + `sharedStoreBucket` set
  `usageCount`/`lastUsedAt` by the skill's key (covers adapter + hub skills).
  `mergeSkill` preserves them (`??=`, like `description`). `index.ts` builds the
  map and passes it in.

## Leaderboard

- **USES replaces REACH**: `NAME · KIND · SCOPE · VISIBILITY · STATUS · SOURCE ·
  USES · RUNTIMES` (a new `USES` column via `usesSeg`).
- `stats.ts leaderboard()` ranks by `uses` desc, then reach, then name.
- `rows.ts` `ItemRow` gains `uses` (skill `usageCount`, else null for
  plugins/mcp). `USES` cell: number, `·` for 0, `—` for null.
- `sortModes.ts` `LEADERBOARD_SORTS`: native `uses`, then `reach` mode, then
  name/enabled/visibility/scope/kind. Cycle:
  `uses → reach → name → enabled → visibility → scope → kind`.

## Detail view

Skills show `uses N` and `last used <relative>` when present. A pure
`formatLastUsed(ms, now)` helper (tested) renders the relative time.

## Testing

- `skillusage`: `parseSkillUsage` handles present/absent/malformed; `usageKey`
  builds name vs plugin:name.
- `resolve`: a skill's `usageCount` is set from `usageByKey` (standalone +
  bundled), and preserved through merge.
- `rows`/`sortModes`: `uses` maps through; leaderboard native ranks by uses.
- `detail`: `uses`/`last used` fields present; `formatLastUsed` formatting.
- Verify real numbers against `skillUsage` at the end (agent-browser 29, etc.).

## Out of scope

- Plugin/mcp usage (`pluginUsage` exists but this is per-skill).
- A USES column on other tabs (usage still shows in any skill's detail).
