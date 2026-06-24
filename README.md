# skillsight

> A read-only, cross-runtime inventory of your AI-agent skills, plugins, and MCP servers — grouped by folder, with provenance and which runtimes use each.

Most tools show what a *single* agent declares locally and stay quiet about the large inherited/global layer and about where things actually come from. `skillsight` scans your machine and shows, **grouped by folder**, the skills / plugins / MCP servers effectively enabled for each — resolving the `global → project-scoped → local` inheritance and labelling every item with:

- **provider** — `shared-store` (the `~/.agents` hub, with origin repo) · `plugin` · `personal-repo` · `runtime-builtin` · `user` · `project-local`
- **used by** — which runtimes actually consume it, derived by resolving symlinks into the shared hub

Read-only by design — `skillsight` never writes to your config, and never reads or prints secret values (MCP `env`/`headers` are reduced to key names only).

## Quickstart

```sh
npx skillsight                 # grouped report: global layer once, then per-folder deltas
npx skillsight --provenance    # expand provider (origin repo) + "used by" per item
npx skillsight --json          # machine-readable, stable schema
skillsight watch               # live Ink dashboard, re-renders on config change
```

## Usage

```
skillsight [options]
  --full                       full effective set per folder (not just deltas)
  --json                       machine-readable output (the future-UI contract)
  --global                     only the inherited global layer
  --dir <path>                 inspect a single directory
  --runtime <id...>            filter to runtimes, e.g. --runtime claude-code codex
  --kind <skill|plugin|mcp...> filter by kind
  --provenance                 expand provider + "used by" per item
  --no-walk                    registry only (skip the filesystem walk)
  --help

skillsight watch               live dashboard; falls back to a reprint on non-TTY/CI
```

Set `SKILLSIGHT_HOME` to point the scan at a different home root (used by the test suite).

## Supported runtimes

| Runtime | Coverage |
| --- | --- |
| Claude Code | full — plugins (`enabledPlugins` + `defaultEnabled`), skills, MCP (3 scopes) |
| Codex | full — `config.toml` MCP/plugins, `~/.codex/skills` + `.system` builtins |
| Hermes (Kit) | full — `~/.hermes/skills/<domain>/<skill>` |
| Gemini CLI · Cursor · OpenCode | best-effort — MCP servers + native skills (Cursor: MCP only) |
| ~70 others | detected for **used-by** attribution via the shared-hub reverse-symlink scan |

The runtime registry mirrors [`vercel-labs/skills`](https://github.com/vercel-labs/skills).

## How provenance works

The `~/.agents/skills` hub — managed by Vercel's `skills` CLI (`npx skills`) — is the canonical store for shared skills. Each runtime symlinks its own `skills/<name>` entry into the hub. `skillsight` resolves those symlinks (`fs.realpath`) to:

1. **dedupe** a skill that appears in many runtimes into one logical record (keyed on the lock file's `skillFolderHash`, falling back to the real path), and
2. compute **`usedBy`** — every runtime whose skills directory points at that content — combined with the lock's `lastSelectedAgents` for hub-direct runtimes.

Origin repo (`source`), clone URL, and git tree hash come from `~/.agents/.skill-lock.json`.

## Relationship to `npx skills`

[`vercel-labs/skills`](https://github.com/vercel-labs/skills) **installs and manages** shared skills (and owns the `~/.agents` hub + lock). `skillsight` is complementary and read-only: it reports the **effective** picture per folder across **skills + plugins + MCP** for **every** runtime — which the installer doesn't surface. `skillsight` reads the same lock file as a first-class provenance source.

## `--json` schema (overview)

```jsonc
{
  "generatedAt": "ISO-8601",
  "homeRoot": "/Users/you",
  "runtimesDetected": ["claude-code", "codex", ...],
  "warnings": [{ "path": "...", "reason": "unreadable: ..." }],
  "global":  { "skills": [SkillRecord], "plugins": [PluginRecord], "mcp": [McpRecord] },
  "folders": [
    {
      "path": "...", "group": "Developer/Projects", "runtimes": [...],
      "projectScoped": Bucket, "local": Bucket, "effective": Bucket
    }
  ]
}
// SkillRecord: { name, description?, contentId, provider, usedBy[], bundledInPlugin?, enabled, scope }
// McpRecord:   { name, transport: { kind, command?, args?, envKeys?, url?, headerKeys?, timeoutMs? }, provider, scope, enabled, runtime? }
```

Secret-bearing fields are key-names-only (`envKeys`, `headerKeys`).

## Roadmap

- Web UI consuming `skillsight --json` (a React port of the Ink components)
- First-class non-skill units: Cursor **rules**, Gemini **extensions**, Codex/OpenCode **agents**
- Windows path/symlink + managed-settings handling

## Contributing

Adding a runtime is the main contribution path — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Shane Griffiths
