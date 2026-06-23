# skillsight

> A cross-runtime inventory of your AI-agent skills, plugins, and MCP servers — grouped by folder, with provenance.

**Status: planning / pre-release.** No tool code yet — the design lives in [`docs/PLAN.md`](docs/PLAN.md).

## What it does

Most tools show you what a *single* runtime declares locally and stay quiet about the large inherited/global layer and about where things actually come from. `skillsight` scans your machine and shows, **grouped by folder**, the skills / plugins / MCP servers effectively enabled for each — resolving the `global → project-scoped → local` inheritance, and labelling every item with:

- **provider** — bundled in a plugin · shared store (`~/.agents`) · personal repo · runtime-builtin · user · project-local
- **used by** — which runtimes can actually see it (Claude Code, Codex, Hermes, …)

It reads many runtimes, not just one: **Claude Code, Codex, Hermes**, the shared `~/.agents` skill store, plus best-effort detection for Gemini / Cursor / OpenCode.

## Planned usage

```sh
npx skillsight            # grouped report: global once, then per-folder deltas
npx skillsight --json     # machine-readable (stable schema)
skillsight watch          # live dashboard (Ink TUI), re-renders on config change
```

Read-only by design — `skillsight` never writes to your config.

## Roadmap

- v1: engine + provenance, `plain` report, `--json`, and the `skillsight watch` Ink dashboard
- later: a web UI consuming `skillsight --json`; more runtime adapters (community-extensible)

## License

[MIT](LICENSE) © Shane Griffiths
