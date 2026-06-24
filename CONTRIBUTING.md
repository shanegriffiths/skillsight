# Contributing to skillsight

Thanks for your interest! The most valuable contribution is **adding or improving a runtime**. The engine is renderer-agnostic and adapter-driven, so this is usually a self-contained change.

## Setup

```sh
npm install
npm test            # vitest (fixture-driven, no real-FS mocking)
npm run typecheck   # tsc --noEmit
npm run build       # tsup -> dist/
npm run dev -- --provenance    # run the CLI from source via tsx
```

Point the scan at a synthetic home with `SKILLSIGHT_HOME=/path/to/fixture`.

## Architecture (where things live)

```
src/
  index.ts        scan(homeRoot, opts) -> Inventory   (pure engine)
  runtimes.ts     KNOWN_RUNTIMES registry (env-aware homes, skills dirs)
  sharedstore.ts  ~/.agents hub + .skill-lock.json
  symlinks.ts     realpath + reverse-symlink usedBy index
  mcp.ts          per-runtime MCP -> normalized McpTransport (+ buildMcpRecords)
  skillscan.ts    shared skill-dir scanning + provider classification
  resolve.ts      enrich (usedBy/provenance), dedupe, merge inheritance layers
  discovery.ts    project discovery (registry ∪ pruned walk)
  filter.ts       --runtime / --kind
  adapters/*.ts   one RuntimeAdapter per deep runtime
  render/         plain.ts · json.ts · ink/ (lazy `watch` dashboard)
```

## Adding a runtime

There are two levels of support:

1. **Used-by only (cheap).** Add an entry to `KNOWN_RUNTIMES` in `src/runtimes.ts` with the agent's env-aware home + skills dir. The reverse-symlink scan then credits it in `usedBy` automatically — no adapter needed. Mirror the mapping in [`vercel-labs/skills`](https://github.com/vercel-labs/skills) `src/agents.ts`.

2. **Deep adapter.** Implement `RuntimeAdapter` (`src/adapters/index.ts`):

   ```ts
   export const myAdapter: RuntimeAdapter = {
     id: 'my-runtime',
     detect(ctx) { /* does this runtime exist under ctx.homeRoot? */ },
     collectGlobal(ctx, warnings) { /* return { skills, plugins, mcp } */ },
     collectForDirectory(dir, ctx, warnings) { /* project-scoped + local */ },
   };
   ```

   Reuse the shared helpers: `scanSkillsDir` (skills + provider classification), `buildMcpRecords` + a `normalize*Transport` (MCP), `readJson`/`readText`/`readDirEntries` (defensive IO). Register the adapter in the `ADAPTERS` array in `src/index.ts`.

### Rules

- **Read-only.** Never write to user config.
- **Privacy.** Read only known config keys + `SKILL.md`/manifest frontmatter. Never read or print `auth.json`, `.credentials.json`, `.env`, tokens, or arbitrary file bodies. MCP `env`/`headers` are stored as **key names only**.
- **Never crash on bad input.** Wrap reads so a missing/malformed source pushes a `warnings` entry and returns partial data.
- **Add a fixture test** under `test/` using a temp home (`makeTempHome` in `test/helpers.ts`). Tests build real files/symlinks — no FS mocking.

## Before opening a PR

`npm run typecheck && npm test && npm run build` should all pass.
