# skillsight — cross-runtime agent skill/plugin inventory

## Context

Shane runs many AI coding/agent runtimes (Claude Code, Codex, Hermes, plus Gemini/Cursor/OpenCode present on disk). Skills and plugins are scattered across **5 config homes**, a **shared skill store**, a **personal repo**, and **per-project** folders — and the same skill is often shared across runtimes by symlink. Existing tools (e.g. the Chops app) only show a single runtime's locally-declared items and stay silent about the large **inherited/global layer** and about **provenance** (where a skill came from, whether it's bundled in a plugin, which runtimes use it).

`skillsight` is a read-only CLI that scans the machine and, **grouped by folder**, shows the skills / plugins / MCP servers effectively enabled for each — resolving the global → project-scoped → local inheritance, and labelling each item with its **provider** and the **runtimes that use it**. This is Shane's first public open-source tool.

**Locked decisions:** Name `skillsight` (free on npm) · Node/TypeScript CLI · scan = registered projects ∪ on-disk config dirs · cross-runtime core in v1 (Claude Code full + Codex + Hermes + shared `.agents` store; Gemini/Cursor/OpenCode best-effort detection) · MIT license · a future live-monitor UI consumes `--json` (roadmap, not v1).

## What we're building (v1)

A CLI `skillsight` with a renderer-agnostic engine feeding **three renderers**:
- **`json`** — pure stdout, the future-web-UI contract.
- **`plain`** (default) — grouped report, global once + per-folder deltas, lean (`picocolors`).
- **`ink-tui`** (`skillsight watch`) — a **live Ink dashboard** mirroring the approved Excalidraw mockup (folder list grouped by area + detail pane + global band + live status), re-rendering on config-file change. This is the "continuous monitor" delivered in-terminal in v1.

Plus per-runtime / per-kind filters and provenance labels throughout.

Two provenance axes per item:
- **provider** — `plugin` (which plugin/marketplace) · `shared-store` (`.agents`, with source repo) · `personal-repo` (`~/Developer/Skills`) · `runtime-builtin` (e.g. Codex `.system`) · `user` · `project-local`
- **usedBy** — the set of runtimes that can see it (from symlink resolution + `~/.agents/.skill-lock.json` `lastSelectedAgents` + sibling `.*-plugin/` variants inside a plugin)

## Tech & project layout

Node ≥18, TypeScript, ESM. Bundled with `tsup` to `dist/` for publish; dev via `tsx`. Tests with `vitest`.

**Core deps (always loaded — kept lean for the `npx` report/json hot path):** `picocolors` (color), `yaml` (Hermes config + SKILL.md frontmatter), `smol-toml` (Codex `config.toml`), `chokidar` (file watching). Native JSON elsewhere.

**TUI deps (lazy-loaded only when `skillsight watch` runs):** `ink` + `react` (+ small Ink helpers as needed, e.g. `ink-text-input`/`ink-spinner`). The default report and `--json` **never import Ink/React** — `cli.ts` dynamically `import()`s the Ink renderer only on the `watch` path, so cold-start stays fast for the common case. The Ink dashboard being React also makes the eventual web UI a natural component port.

```
skillsight/
  src/
    index.ts            # public engine: scan(homeRoot, opts) -> Inventory
    types.ts            # SkillRecord, PluginRecord, McpRecord, FolderReport, Inventory
    discovery.ts        # directory discovery (registry union + pruned walk)
    resolve.ts          # provenance dedupe + per-folder effective sets + deltas
    frontmatter.ts      # tiny SKILL.md YAML-frontmatter reader (name, description)
    adapters/
      index.ts          # RuntimeAdapter registry (extensibility seam)
      claude-code.ts    # full
      codex.ts          # config.toml + skills + .system
      hermes.ts         # config.yaml + skills (recursive, domain dirs)
      shared-store.ts   # .agents/.skill-lock.json enrichment (provider repo + usedBy)
      detect-basic.ts   # gemini / cursor / opencode presence + basic skill dirs
    render/
      plain.ts          # grouped, colorized report (default + --full)
      json.ts           # stable machine schema
      ink/              # lazy-loaded live dashboard (skillsight watch)
        App.tsx         # root: holds Inventory state, subscribes to watcher
        Header.tsx      # title + live status pill
        GlobalBand.tsx  # inherited-everywhere summary
        FolderList.tsx  # grouped, selectable folder rows (keyboard nav)
        DetailPane.tsx  # selected folder: inherited / project-scoped / local
    cli.ts              # arg parsing + dispatch (dynamic import of render/ink only on `watch`)
  test/
    fixtures/<fake-home>/...   # synthetic homes across runtimes + projects
    *.test.ts
  README.md  LICENSE(MIT)  CONTRIBUTING.md  package.json  tsconfig.json
  .github/workflows/ci.yml
```

The engine is **pure + takes an explicit `homeRoot`** (defaults to `os.homedir()`, overridable via `SKILLSIGHT_HOME` for tests). Nothing in `src/` outside `cli.ts`/`render/` writes to stdout.

## Data model (`src/types.ts`)

```ts
type Runtime = 'claude-code' | 'codex' | 'hermes' | 'gemini' | 'cursor' | 'opencode' | string;
type Kind = 'skill' | 'plugin' | 'mcp';

interface Provider {
  kind: 'plugin' | 'shared-store' | 'personal-repo' | 'runtime-builtin' | 'user' | 'project-local';
  pluginId?: string;       // e.g. "superpowers@claude-plugins-official"
  marketplace?: string;    // e.g. "claude-plugins-official"
  sourceRepo?: string;     // from known_marketplaces.json / .skill-lock.json
  path: string;            // physical content location (real, symlink-resolved)
}

interface SkillRecord {
  name: string;
  description?: string;
  contentId: string;       // dedupe key: fs.realpath of skill dir, or skillFolderHash
  provider: Provider;
  usedBy: Runtime[];
  bundledInPlugin?: string;
  enabled: boolean;
  scope: 'global' | 'project-scoped' | 'local';
}

interface PluginRecord {
  id: string; name: string; marketplace: string; version: string; sourceRepo?: string;
  scope: 'user' | 'project'; projectPath?: string; enabled: boolean;
  provides: { skills: string[]; commands: string[]; agents: string[]; mcpServers: string[] };
  runtimeVariants: Runtime[];   // which .*-plugin/ variants exist
}

interface McpRecord { name: string; transport: object; provider: Provider; scope: SkillRecord['scope']; enabled: boolean; }

interface FolderReport { path: string; group: string; runtimes: Runtime[];
  global: {...}; projectScoped: {...}; local: {...}; effective: {...}; }  // each = {skills, plugins, mcp}

interface Inventory { generatedAt: string; homeRoot: string; runtimesDetected: Runtime[];
  global: {...}; folders: FolderReport[]; }
```

## Source adapters (the extensibility seam)

```ts
interface RuntimeAdapter {
  id: Runtime;
  detect(homeRoot): boolean;
  collectGlobal(homeRoot): { skills: SkillRecord[]; plugins: PluginRecord[]; mcp: McpRecord[] };
  collectForDirectory(dir, homeRoot): { skills; plugins; mcp };  // project-scoped + local
}
```

Real sources each adapter reads (verified on disk):

- **claude-code.ts** — `~/.claude/settings.json` (`enabledPlugins` map: `"name@marketplace": true`, the actual enable key; absence/`false` = off) · `~/.claude/plugins/installed_plugins.json` (scope user|project, projectPath, installPath) · `~/.claude/plugins/known_marketplaces.json` (source repo per marketplace) · `~/.claude.json` (`projects{}` registry, top-level `mcpServers`) · `~/.claude/skills/*` (symlink-aware) · per-plugin contributions by **scanning installPath**: `skills/*/SKILL.md`, `commands/`, `agents/`, and MCP via `.claude-plugin/plugin.json` `mcpServers` pointer or a sibling `.mcp.json`; sibling `.codex-plugin/ .cursor-plugin/ .kimi-plugin/` dirs ⇒ plugin `runtimeVariants`. Per-dir: `.claude/settings.json` (`enabledPlugins` override), `.claude/skills/`, `.mcp.json`, `CLAUDE.md`.
- **codex.ts** — `~/.codex/config.toml` (`[mcp_servers]`, `[plugins]`, `[marketplaces]`, project trust) · `~/.codex/skills/*` and `~/.codex/skills/.system/*` (provider `runtime-builtin`) · per-dir `.codex/skills/`.
- **hermes.ts** — `~/.hermes/config.yaml` · `~/.hermes/skills/**` (recursive; domain subdirs like `apple/`, `research/`).
- **shared-store.ts** — `~/.agents/.skill-lock.json` (per-skill `source` repo + `lastSelectedAgents` ⇒ enrich `usedBy`) and `~/.agents/skills/*`. This is an **enrichment provider**, not a runtime: any skill whose `contentId` resolves into `~/.agents/skills` gets `provider.kind='shared-store'` + repo + multi-runtime `usedBy`.
- **detect-basic.ts** — presence + basic skill-dir listing for `~/.gemini`, `~/.cursor`, `~/.config/opencode` and project `.cursor/skills`, `.agents/skills`. Marked `detected (basic)`.

**Privacy rule (must enforce in every adapter):** read only known config keys and `SKILL.md` frontmatter. **Never read or print** `auth.json`, `.env`, `.credentials.json`, or arbitrary file bodies.

## Provenance resolver (`src/resolve.ts`)

1. Gather all records from all adapters.
2. `contentId` = `fs.realpath` of the skill dir (collapses symlinks) — fall back to `.skill-lock.json` `skillFolderHash` when present.
3. Group by `contentId` → one logical skill; **union** `usedBy`; pick the most specific `provider` (shared-store repo > plugin > personal-repo > runtime-builtin > user/project-local).
4. Enrich from `.skill-lock.json` (`sourceRepo`, `lastSelectedAgents`) and plugin `.*-plugin/` siblings.
5. Result: each skill shows **where it came from**, **whether bundled in a plugin**, and **which runtimes use it** — Shane's exact ask.

## Directory discovery (`src/discovery.ts`)

Union, deduped by absolute path:
- **Registry:** Claude `~/.claude.json` `projects{}` keys (+ Codex `config.toml` project/trust entries).
- **On-disk walk** from `homeRoot` for marker dirs/files: `.claude/`, `.codex/`, `.agents/`, `.cursor/`, `.mcp.json`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`. Pruned (`node_modules`, `.git`, `Library` except registered Google-Drive paths, caches), depth-limited (~5), no descent past a detected project.

Group folders by top-level area (`Developer/Projects`, `Documents`, `Obsidian`, …).

## Resolution rule & output

Per folder, per runtime: **effective = runtime-global + project-scoped (`enabledPlugins` overrides) + local**. Default report prints the **global layer once at top**, then each folder's **delta** (what it adds), with a grey `global only` tag when nothing is added — matching the approved Excalidraw mockup. `--full` prints each folder's complete effective set.

### CLI surface (`src/cli.ts`)
```
skillsight                     grouped report: global once, then per-folder deltas (plain renderer)
  --full                       full effective set per folder
  --json                       machine-readable (the future-UI contract)
  --dir <path>                 inspect one directory
  --global                     just the inherited global layer
  --runtime <id...>            filter to runtimes (default: all detected)
  --kind skill|plugin|mcp      filter by kind
  --provenance                 expand provider + 'used by' per item
  --no-walk                    registry only (skip filesystem walk)

skillsight watch               live Ink dashboard (= the mockup, in-terminal); chokidar drives re-render
                               keyboard nav over folders; falls back to plain reprint on non-TTY/CI
```
Shared flags (`--dir/--runtime/--kind/--no-walk`) apply to `watch` too.
Errors on any single source (malformed/missing JSON/TOML/YAML) are caught and surfaced as a `⚠ unreadable: <path>` note, never a crash — partial data still renders.

## Testing (`vitest`, fixture-driven)

Engine + adapters take `homeRoot`, so tests point at synthetic homes under `test/fixtures/` — a fake `~/.claude` (settings `enabledPlugins`, 2 plugins with `skills/` + `.mcp.json`, `~/.claude.json` projects), fake `~/.codex` (`config.toml` + `skills/.system`), fake `~/.hermes` (`config.yaml` + nested skills), fake `~/.agents` (`.skill-lock.json` + symlinked skills), and 3 project dirs. Assert: `enabledPlugins` resolution + project override, delta computation, **provenance dedupe** (same skill via symlink ⇒ one record, `usedBy` union), plugin-bundled detection, MCP discovery from `.mcp.json` vs config. No real-FS mocking.

## OSS readiness (first public release)

- `LICENSE` (MIT), `package.json` (`bin: { skillsight: dist/cli.js }`, `files`, repo/homepage/keywords, `engines`).
- `README.md`: what it is (cross-runtime agent inventory + provenance), `npx skillsight` quickstart, usage, **documented `--json` schema**, a supported-runtimes table, an asciinema/gif, "how provenance works", roadmap (live-monitor UI, more adapters).
- `CONTRIBUTING.md`: how to add a `RuntimeAdapter` (the seam) — the main community contribution path.
- No hardcoded personal paths — everything from `homeRoot`/`os.homedir()`. Privacy rule above is documented.
- `.github/workflows/ci.yml`: typecheck + lint + `vitest` on PRs. macOS/Linux first; Windows path/symlink handling noted as a follow-up.
- Pre-publish: re-confirm `skillsight` free on npm + create the GitHub repo.

## Build order (milestones)

1. Scaffold (package.json, tsconfig, tsup, vitest, MIT, types).
2. `claude-code` adapter + discovery + resolver + `plain` renderer + `--json` → working single-runtime tool against real home.
3. Provenance dedupe + `shared-store` enrichment (`.skill-lock.json`).
4. `codex` + `hermes` adapters; `detect-basic` for gemini/cursor/opencode.
5. Filters (`--runtime/--kind/--provenance/--full/--dir/--global`).
6. **Ink dashboard** (`skillsight watch`): `render/ink/*` wired to chokidar live re-scan; keyboard nav; non-TTY fallback to plain reprint.
7. Fixtures + tests; README/CONTRIBUTING/CI; publish prep.

## Verification (end-to-end)

- `npx tsx src/cli.ts` against the real home: confirm `snowbridge-media` shows `sentry`+`inngest` (project plugins) + `mermaidchart`/`inngest-dev` (MCP); `studiobrio` shows `gsap-skills`; `hyperframes` shows `provider: shared-store` with `usedBy` multiple runtimes; Codex `.system` skills appear under the `codex` runtime; `global only` folders render correctly.
- `skillsight --json | jq '.folders[] | select(.path|test("snowbridge"))'` — schema sanity.
- `skillsight --provenance --kind skill` — provider + usedBy populated and deduped.
- `vitest run` green on fixtures.
- `skillsight watch`: launch the Ink dashboard, arrow-key through folders (detail pane updates), then touch a project `.claude/settings.json` and confirm the row + status re-render live. Confirm `--json`/default still cold-start fast (Ink not imported).

## Out of scope (roadmap)

The **web** UI is a separate follow-up package consuming `skillsight --json` — and a natural React port of the `render/ink/` components. The in-terminal Ink dashboard (`skillsight watch`) **is** in v1; the browser/desktop GUI is not.
