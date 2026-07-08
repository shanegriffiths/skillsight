# skillsight `--demo` mode — design

Date: 2026-07-08
Status: approved, ready for implementation plan

## Goal

Give skillsight a safe, one-command way to render a full, realistic-looking
inventory from fabricated data, so screenshots and video can be produced without
exposing any real project, skill, or MCP configuration.

`skillsight --demo` should:

- render identically in the dashboard, `--report`, and `--json` modes;
- show every interesting surface (multiple runtimes, the shared-store / plugin /
  project-local providers, MCP servers reduced to key names, and a git-worktree
  group);
- leak nothing real, even when the shell has runtime home overrides set.

## Approach

Build the fixture home in code, into a stable temp directory.

A new `buildDemoHome()` constructs a fake `~` under
`$TMPDIR/skillsight-demo-home`, wiped and rebuilt on each run, using the same
filesystem primitives the tests already use (`writeFileEnsured`, `symlinkInto`).
`--demo` points `homeRoot` at that directory and scans it with an empty env.

Alternatives considered and rejected:

- **Static committed fixture** under `demo/home/`. The fixture needs symlinks (the
  shared-store hub) and a `.skill-lock.json` with hashes. Committed symlinks are
  fragile across clones and `npx github:` installs, and the fixture can silently
  drift. Building in code is portable, deterministic, and reviewable as code.
- **Hybrid** (commit skill content, materialise symlinks at runtime). More moving
  parts than this needs.

## Design

### 1. The `--demo` flag

Add `--demo` to argument parsing (`src/cliArgs.ts`) and the `--help` text. When
set, it:

- overrides `homeRoot` with the built fixture path;
- forces `walk: true` and `env: {}` on the scan;
- ignores `--home`, `--dir`, and `--no-walk` (demo owns the whole scan).

It changes nothing else. Because demo is only a home-root plus env swap, the
dashboard, `--report`, and `--json` paths all work unchanged.

### 2. Leak-proofing

The scan runs with `env: {}`. `ScanOptions.env` already flows into `ctx.env`, and
`ctx.env` is the only route by which the real shell can redirect a runtime's
config home: `XDG_CONFIG_HOME` (for config-base runtimes) and the per-runtime
overrides `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `HERMES_HOME`, and the other
`*_HOME` vars. With an empty env, every runtime resolves under the fixture
`homeRoot` and nothing real can be read. This must hold in the dashboard's watch
path too, so the env is carried on the scan options the watcher uses, not only
the one-shot call.

### 3. Fixture builder (`src/demo.ts`)

`buildDemoHome(): string` lays down a realistic-but-fictional home and returns its
path. Contents, chosen to exercise each surface:

- **Shared-store hub** (`~/.agents/skills/` + `~/.agents/.skill-lock.json`):
  `agent-browser`, `vercel-react-best-practices`, and `payload`, each a real skill
  directory with a `SKILL.md`. The lock file gives each one an origin repo, clone
  URL, tree hash, folder hash, and `lastSelectedAgents`, so provenance and
  "used by" populate.
- **Runtimes**:
  - **Claude Code**: global skills under `~/.claude/skills/` (symlinks into the
    hub, for "used by"), a global `enabledPlugins` in `~/.claude/settings.json`, and
    a minimal plugin registry (`~/.claude/plugins/installed_plugins.json` +
    `known_marketplaces.json` + one install directory with a manifest) so a
    `sentry-code-review` plugin resolves with `provider: plugin` and contributes an
    item. `~/.claude.json` holds the project registry, some MCP servers, and
    `skillUsage` counts.
  - **Codex**: `~/.codex/config.toml` with an MCP server, and `~/.codex/skills/`
    with a skill.
  - **Hermes**: `~/.hermes/skills/<domain>/<skill>/SKILL.md`.
  - One additional runtime (e.g. Cursor via `.cursor/mcp.json`, or Gemini via a
    skills symlink) so "used by" shows more than one consumer on a shared skill.
- **Projects** under `~/Developer/Projects/`:
  - `acme-storefront`: a project-local skill, a `.mcp.json` MCP server whose env
    is **key names only** (e.g. `DATABASE_URL`, `STRIPE_SECRET_KEY`), a locally
    enabled plugin, and a `CLAUDE.md`.
  - `folio-site` (a personal site): a genuinely project-local skill directory, so
    the `project-local` provider is represented.
  - `pixel-pet` (a side project): minimal, for list variety.
  - `orbit-dashboard`: a repo plus a sibling `orbit-dashboard.worktree/` bucket
    holding `feature-auth` and `spike-charts`, each a checkout carrying a `.git`
    pointer file and a `CLAUDE.md`. This renders the worktree group and exercises
    the worktree discovery added earlier.
  - All project directories are listed in `~/.claude.json` `projects` so registry
    discovery finds them.

Exact JSON and TOML shapes mirror the existing adapter readers; the implementation
matches them rather than inventing formats.

### 4. Behaviour across output modes

- **Dashboard** (default): opens on the fixture. Watch still works (the fixture is
  a real directory); it simply will not change.
- **`--report` / `--json`**: same fixture, same clean env, printed.

## Testing

- **Builder**: `buildDemoHome()` creates the expected structure (hub skills and
  lock, the four-plus runtimes, the projects, and the worktree bucket with `.git`
  pointers).
- **Integration**: `scan(demoHome, { env: {} })` returns folders including the
  `orbit-dashboard` worktree group, surfaces the `shared-store`, `plugin`, and
  `project-local` providers, and every MCP record carries `envKeys` only (no
  values anywhere in the output).
- **Leak-proofing wiring**: `--demo` builds the scan with an empty env, so a
  real-shell `CLAUDE_CONFIG_DIR` / `XDG_CONFIG_HOME` is ignored (assert the demo
  scan options carry `env: {}`).

## Files touched

- New: `src/demo.ts` (the fixture builder).
- `src/cli.ts`: wire `--demo` (home-root swap, `env: {}`, force walk), for both the
  one-shot and watch paths.
- `src/cliArgs.ts`: parse `--demo`, add it to `--help`.
- New test file for the builder and the demo scan.
- Possibly a small shared helper if the builder wants the test fixture primitives
  (`writeFileEnsured`, `symlinkInto`) outside `test/`; if so, move them to a
  `src/` util both can import, rather than importing test code into `src/`.

## Out of scope

- Any recording tooling (VHS tape, GIF generation). Shane records the demo
  himself.
- A redaction / anonymise mode over real data. The fixture approach avoids needing
  one.
- Committing a screenshot to the repo.
