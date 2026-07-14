# skillsight

> A read-only, cross-runtime inventory of your AI-agent skills, plugins, and MCP servers, grouped by folder, with provenance and which runtimes actually use each.

I run a lot of AI coding agents (Claude Code, Codex, Hermes, a few others), and over time my skills, plugins, and MCP servers ended up scattered everywhere. Some global, some in a shared store, some bundled inside plugins, some pinned to a single project. At some point I genuinely couldn't tell what was switched on where, or where half of it had come from.

Most tools only show what one agent declares in the folder you're sitting in. They stay quiet about the big inherited layer above it, and about where things actually come from. skillsight is my answer to that. It scans your machine and shows, grouped by folder, the skills, plugins, and MCP servers effectively enabled for each. It resolves the `global → project-scoped → local` inheritance and labels every item with where it came from and which runtimes use it.

It only ever reads. It never writes to your config, and it never reads or prints secret values (MCP `env` and `headers` are reduced to key names only). There's a fuller note on that below, because you're about to point it at your real setup.

<!-- Drop a hero screenshot here once there's a clean one, e.g. ![skillsight](docs/skillsight.png) -->

## Try it

It's not on npm yet, so for now you install it straight from GitHub. You'll need **Node 22+**.

```sh
npx github:shanegriffiths/skillsight
```

That builds it on first run (give it a moment) and opens the live dashboard. Prefer to clone it and poke around?

```sh
git clone https://github.com/shanegriffiths/skillsight.git
cd skillsight
npm install
npm run build
node dist/cli.js
```

## What you'll see

The default is a live dashboard: arrow keys or `j`/`k` to move between folders, `q` to quit. It re-renders as your config changes, so you can edit a `.mcp.json` in another window and watch it update.

If you'd rather have plain text (or you're piping the output somewhere), there are one-shot modes:

```sh
npx github:shanegriffiths/skillsight --report               # grouped text report
npx github:shanegriffiths/skillsight --report --provenance  # + origin repo and "used by"
npx github:shanegriffiths/skillsight --json                 # machine-readable
```

A trimmed report reads roughly like this: the global layer once, then each folder showing only what it adds on top.

```
GLOBAL
  + agent-browser [shared-store]
  + neon-postgres [shared-store]

Developer/Projects
  my-app
    + payload [shared-store]
    + sentry-code-review [plugin]
  another-app
    + web-design-guidelines [project-local]
```

The dashboard goes further: git worktrees fold in under their repo, and you can filter by runtime or kind, sort, and open any item to see its provenance.

Want to see it populated without pointing it at your own machine? `skillsight --demo` renders a built-in fictional setup. Handy for a first look, or for screenshots.

## Requirements

- **macOS.** Built and tested here. Linux should work too (same POSIX path and symlink model) but I haven't tested it. Windows isn't supported.
- **Node.js ≥ 22.** The live dashboard runs on [Ink](https://github.com/vadimdemedes/ink) 7, which needs Node 22+. The `--report` and `--json` modes are lighter, but 22 is still the floor.
- **A [Nerd Font](https://www.nerdfonts.com/)** for the dashboard's folder and branch icons. Without one they show as tofu boxes (`□`). You've got three options:
  - set your terminal font to any patched *Nerd Font* build (e.g. `JetBrainsMono Nerd Font`), or
  - keep your current font and add **Symbols Nerd Font Mono** to your terminal's font-fallback list (it supplies just the icon glyphs, no font change, and is the least intrusive option), or
  - turn glyphs off with `SKILLSIGHT_ICONS=off` (plain text, no icons).

## Privacy and security

You're running this against your real configuration, so here's exactly what it does and doesn't do:

- **Read-only.** It never writes, moves, or deletes anything. There are no filesystem writes anywhere in the code.
- **No network, no telemetry.** Zero network calls. Nothing about your setup leaves your machine. No analytics, no phone-home, no update check.
- **No code execution.** It never spawns a subprocess or evaluates config. It only reads and parses files.
- **Secrets stay secret.** MCP `env` and `headers` are reduced to **key names only**. The values are never read into memory or emitted, in any mode (dashboard, `--report`, or `--json`).
- **Small dependency surface.** Seven runtime dependencies (`chokidar`, `ink`, `react`, `picocolors`, `smol-toml`, `terminal-link`, `yaml`), and no install or lifecycle scripts beyond the build.

## Commands

```
skillsight                     live dashboard (default on a terminal)
skillsight --report            one-shot plain report
skillsight --json              machine-readable output
skillsight watch               alias for the dashboard
skillsight show <ref>          full record for one item (name or id prefix)

  --report                     plain grouped report instead of the dashboard
  --full                       (report) full effective set per folder
  --global                     (report) only the inherited global layer
  --dir <path>                 inspect a single directory
  --home <path>                scan a different home root (or set SKILLSIGHT_HOME)
  --runtime <id...>            filter to runtimes, e.g. --runtime claude-code codex
  --kind <skill|plugin|mcp...> filter by kind
  --provenance                 (report) expand provider + "used by" per item
  --no-walk                    registry only (skip the filesystem walk)
  --demo                       render a built-in fictional dataset (nothing real is read)
  --help
```

Point the scan at a different home root with `--home <path>` (or the `SKILLSIGHT_HOME` env var). Handy for inspecting a backup, another account, or a copied `~` from another machine. The flag wins over the env var, and both beat the OS home.

### Examples

```sh
skillsight                                # live dashboard (the default)
skillsight --report                       # one-shot plain report
skillsight --report --full                # full effective set per folder, not just the delta
skillsight --report --global              # only the inherited global layer
skillsight --report --provenance          # + origin repo and "used by" per item
skillsight --json                         # machine-readable

skillsight --dir ./some/project           # inspect a single folder
skillsight --report --runtime claude-code codex   # filter to specific runtimes
skillsight --report --kind skill mcp      # filter by kind (skills and MCP only)
skillsight --demo                         # a built-in fictional dataset (nothing real is read)

SKILLSIGHT_ICONS=off skillsight           # plain text, no Nerd Font glyphs (if you see tofu boxes)
SKILLSIGHT_HOME=/path/to/home skillsight  # scan a different home (same as --home)
```

## Agent handoff

Every detail pane carries a dim `agent` line: the exact command to re-fetch that record, plus `y` to yank it (and `Y` for the full JSON) straight to your clipboard over OSC 52 — works over SSH and inside tmux too. The workflow this is built for: browse the dashboard, screenshot whatever's interesting, drop it in a chat with your agent, and it runs the command itself.

```sh
skillsight show <ref>          # plain panel on a TTY, JSON on a pipe
skillsight show <ref> --json   # force JSON
```

`<ref>` is a name or an id prefix (4+ chars) — use the prefix when a name is ambiguous, e.g. `skillsight show obsidian-cli` might match more than one thing across runtimes, `skillsight show 86ffa49bc5d7` won't. Exit codes carry the result so an agent doesn't have to parse stderr to know what happened:

- **0** — found, record printed
- **1** — no match (stderr suggests near-miss names)
- **2** — ambiguous (stderr lists every candidate with a distinguishing id prefix)

The JSON record is the part worth building against. `copies[]` is the interesting bit: every physical location of a skill across the whole scan, deduped, each one carrying its own git context — so worktree checkouts of the same repo fold back into one main checkout instead of reporting as unrelated projects:

```jsonc
{
  "schemaVersion": 1,
  "scanTime": "2026-07-14T09:12:03.000Z",
  "skillsightVersion": "0.1.0",
  "homeRoot": "/Users/you",
  "kind": "skill",
  "item": { "name": "obsidian-cli", "contentId": "86ffa49bc5d7...", "scope": "global", "usedBy": ["claude-code"] /* … */ },
  "copies": [
    {
      "path": "/Users/you/Developer/Projects/notes-app/.claude/skills/obsidian-cli",
      "folders": ["global"],
      "providerKind": "shared-store",
      "git": { "repoRoot": "/Users/you/Developer/Projects/notes-app", "isWorktree": false }
    },
    {
      "path": "/Users/you/Developer/Projects/notes-app-wt1/.claude/skills/obsidian-cli",
      "folders": ["/Users/you/Developer/Projects/notes-app-wt1"],
      "providerKind": "shared-store",
      "git": {
        "repoRoot": "/Users/you/Developer/Projects/notes-app-wt1",
        "isWorktree": true,
        "mainCheckout": "/Users/you/Developer/Projects/notes-app"
      }
    }
    // … one entry per physical copy, across every project …
  ],
  "sites": [{ "runtime": "claude-code", "linkPath": "/Users/you/.claude/skills/obsidian-cli" }],
  "collisions": []
}
```

`sites[]` is where the shared-store symlink actually lands per runtime. `collisions[]` lists same-name-but-different-content items, so an agent doesn't silently grab the wrong one.

`schemaVersion: 1` is the part of this I'm committing to keep stable — build against it. `copies` is exclusive to `show`: it's internal dedup bookkeeping, stripped out of the bulk `skillsight --json` contract, which has never exposed it.

## Supported runtimes

| Runtime | Coverage |
| --- | --- |
| Claude Code | full: plugins (`enabledPlugins` + `defaultEnabled`), skills, MCP (3 scopes) |
| Codex | full: `config.toml` MCP/plugins, `~/.codex/skills` + `.system` builtins |
| Hermes (Kit) | full: `~/.hermes/skills/<domain>/<skill>` |
| Gemini CLI · Cursor · OpenCode | best-effort: MCP servers + native skills (Cursor: MCP only) |
| ~70 others | detected for **used-by** attribution via the shared-hub reverse-symlink scan |

The runtime registry mirrors [`vercel-labs/skills`](https://github.com/vercel-labs/skills).

## How provenance works

The `~/.agents/skills` hub, managed by Vercel's `skills` CLI (`npx skills`), is the canonical store for shared skills. Each runtime symlinks its own `skills/<name>` entry into that hub. skillsight resolves those symlinks (`fs.realpath`) to do two things:

1. **dedupe** a skill that shows up in many runtimes into one logical record (keyed on the lock file's `skillFolderHash`, falling back to the real path), and
2. compute **`usedBy`**: every runtime whose skills directory points at that content, combined with the lock's `lastSelectedAgents` for hub-direct runtimes.

Origin repo (`source`), clone URL, and git tree hash all come from `~/.agents/.skill-lock.json`.

## Relationship to `npx skills`

[`vercel-labs/skills`](https://github.com/vercel-labs/skills) **installs and manages** shared skills (and owns the `~/.agents` hub and lock file). skillsight is the complementary read-only half: it reports the **effective** picture per folder, across **skills, plugins, and MCP**, for **every** runtime, which the installer doesn't surface. It reads the same lock file as a first-class provenance source.

<details>
<summary><code>--json</code> schema (overview)</summary>

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

</details>

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for the full backlog. Some of what's next:

- **v0.2, the dashboard as a real interface:** tabbed nav (Folders / Global / Leaderboard), flat project list, plugin grouping, per-item scope/visibility/status columns, live filter and sort.
- A web UI that consumes `skillsight --json` (a React port of the Ink components).
- First-class non-skill units: Cursor **rules**, Gemini **extensions**, Codex/OpenCode **agents**.
- Windows path and symlink handling.

## Feedback

This is early. It's v0.1, macOS-first, and until now I've mostly run it against my own machine. If you're kind enough to try it, I'd love to know what broke, what confused you, or what it got wrong about your setup. Open an issue, or just message me. Honest reactions are the most useful thing right now, even the blunt ones.

## Contributing

Adding a runtime is the main way in. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

[MIT](LICENSE) © Shane Griffiths
