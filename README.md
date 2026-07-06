# skillsight

> A read-only, cross-runtime inventory of your AI-agent skills, plugins, and MCP servers — grouped by folder, with provenance and which runtimes use each.

Most tools show what a *single* agent declares locally and stay quiet about the large inherited/global layer and about where things actually come from. `skillsight` scans your machine and shows, **grouped by folder**, the skills / plugins / MCP servers effectively enabled for each — resolving the `global → project-scoped → local` inheritance and labelling every item with:

- **provider** — `shared-store` (the `~/.agents` hub, with origin repo) · `plugin` · `personal-repo` · `runtime-builtin` · `user` · `project-local`
- **used by** — which runtimes actually consume it, derived by resolving symlinks into the shared hub

Read-only by design — `skillsight` never writes to your config, and never reads or prints secret values (MCP `env`/`headers` are reduced to key names only).

## Requirements

- **macOS.** Built and tested on macOS. Linux should work (same POSIX path/symlink model) but is untested; Windows isn't supported.
- **Node.js ≥ 22** — the live dashboard runs on [Ink](https://github.com/vadimdemedes/ink) 7, which requires Node 22+. (`--report` and `--json` are lighter, but 22 is the supported floor.)
- **A [Nerd Font](https://www.nerdfonts.com/)** for the dashboard's folder/branch icons. skillsight renders Nerd Font glyphs by default; without one they show as tofu boxes (`□`). Either:
  - set your terminal font to any patched *Nerd Font* build (e.g. `JetBrainsMono Nerd Font`), **or**
  - keep your current font and add **Symbols Nerd Font Mono** to your terminal's font-fallback list — it supplies just the icon glyphs, no font change, and is the least intrusive option;
  - or opt out with `SKILLSIGHT_ICONS=off` (plain text, no glyphs).

## Quickstart

```sh
npx skillsight                 # live dashboard — the default on a terminal
npx skillsight --report        # one-shot plain report (global once, then per-folder deltas)
npx skillsight --report --provenance   # + origin repo and "used by" per item
npx skillsight --json          # machine-readable, stable schema
```

The **live Ink dashboard is the default**: run `skillsight` in a terminal and it opens an interactive view that re-renders as your config changes (↑/↓ or j/k to move between folders, `q` to quit). When output is piped or redirected (non-TTY/CI), it prints the plain report instead.

## Usage

```
skillsight                     live dashboard (default on a terminal)
skillsight --report            one-shot plain report
skillsight --json              machine-readable output (the future-UI contract)
skillsight watch               alias for the dashboard

  --report                     plain grouped report instead of the dashboard
  --full                       (report) full effective set per folder
  --global                     (report) only the inherited global layer
  --dir <path>                 inspect a single directory
  --home <path>                scan a different home root (or set SKILLSIGHT_HOME)
  --runtime <id...>            filter to runtimes, e.g. --runtime claude-code codex
  --kind <skill|plugin|mcp...> filter by kind
  --provenance                 (report) expand provider + "used by" per item
  --no-walk                    registry only (skip the filesystem walk)
  --help
```

Point the scan at a different home root with `--home <path>` (or the `SKILLSIGHT_HOME` env var) — handy for inspecting a backup, another account, or a copied `~` from another machine. The flag wins over the env var; both beat the OS home.

The dashboard shows Nerd Font folder/branch glyphs beside projects; set `SKILLSIGHT_ICONS=off` if your terminal font isn't a Nerd Font (falls back to plain text, no glyphs).

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
// SkillRecord: { name, description?, contentId, provider, usedBy[], bundledInPlugin?, supportsRuntimes?, enabled, scope, visibility?, visibilitySource? }
// McpRecord:   { name, transport: { kind, command?, args?, envKeys?, url?, headerKeys?, timeoutMs? }, provider, scope, enabled, runtime? }
```

Secret-bearing fields are key-names-only (`envKeys`, `headerKeys`).

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for the detailed backlog. Highlights:

- **v0.2 — dashboard as a real interface:** tabbed nav (Folders / Global / Leaderboard), flat project list, plugin grouping, per-item scope/visibility/status columns, live filter/sort
- Web UI consuming `skillsight --json` (a React port of the Ink components)
- First-class non-skill units: Cursor **rules**, Gemini **extensions**, Codex/OpenCode **agents**
- Windows path/symlink + managed-settings handling

## Contributing

Adding a runtime is the main contribution path — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Shane Griffiths
