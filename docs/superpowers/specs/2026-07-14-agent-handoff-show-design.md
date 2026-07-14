# Agent handoff: `skillsight show` + pane handshake — design

**Date:** 2026-07-14
**Status:** Approved (brainstorm with Shane, 2026-07-14)

## Motivation

The real workflow this serves: Shane runs the dashboard, drills into an item,
sees something worth acting on (move / delete / promote / demote), screenshots
the detail pane, and hands the screenshot to an LLM agent with "act on this."

A screenshot is a lossy, point-in-time pointer. Today it is also *insufficient*
to act safely:

- The detail pane shows **one** `provider.path`, but a content-hash-deduped
  skill may exist as several byte-identical physical copies ("lives in
  4 projects" shows folder paths only — the other copies' skill paths were
  dropped at dedup). An agent told "delete this" would remove one copy of four.
- Several of those locations may be **worktrees of the same repo** — one
  tracked directory seen through four checkouts is a completely different plan
  from four independent installs. Nothing in the record distinguishes them.
- The `id` is truncated to 12 chars with no addressable use for it.
- For hub-installed skills, the per-runtime **symlink sites** behind `usedBy`
  are computed during the scan and thrown away.
- Nothing reports **destination collisions** (e.g. promote-to-user when
  `~/.claude/skills/<name>` already exists with different content).

## Decisions (forks resolved with Shane)

1. **Screenshot as pointer, not payload.** The pane stays human-optimized; it
   gains a visible handshake teaching the agent how to fetch complete, fresh,
   machine-readable truth. We do not try to cram everything into the pane.
2. **skillsight stays read-only.** New `show` command only. No `plan`/action
   subcommands; the agent derives and executes mutations itself.
3. **Git awareness = worktree links only, pure fs.** No git subprocess. The
   agent runs `git status` itself at act time (that state goes stale instantly
   anyway).
4. **Handshake = hint line + yank keys.** A dim `agent → skillsight show
   <id12> --json` line in the detail pane (lands in every screenshot), plus
   `y` (copy that command) and `Y` (copy full JSON record) keybinds.

## Design

### 1. Engine: topology survives dedup

Two data-retention changes in the scan/resolve path; no behavior changes.

- **Copies.** When the resolver dedups records by `contentId`, the losing
  record's provider info is appended to a `copies` list on the survivor
  instead of being discarded. Each copy: `{ path, folder, providerKind }`
  (path = symlink-resolved physical dir, folder = owning project dir or
  global).
- **Symlink sites.** The registry-wide reverse-symlink scan that produces
  `usedBy` additionally records `{ runtime, linkPath }` per hit.

Both live on resolved records internally and are **stripped from the bulk
`--json` / `--report` renders** so the characterization snapshots in
`test/render-output.test.ts` remain byte-identical. Only `show` (and the
in-process `Y` yank) serializes them.

### 2. `src/git.ts` — worktree linking (pure fs)

Walk up from a copy's path to the nearest `.git` entry:

- `.git` **directory** → normal checkout; its parent is the repo root.
- `.git` **file** → read the `gitdir: …` line; a target containing
  `/.git/worktrees/` identifies a linked worktree and yields the main repo
  root (the segment before `/.git/worktrees/`).

Output per copy: `{ repoRoot, isWorktree, mainCheckout? }`. `show` groups
copies by repo identity so "4 projects" renders as
"1 repo — main checkout + 3 worktrees" when that is the truth.
No `git` binary is ever spawned.

### 3. `skillsight show <ref> [--json]`

Parsed in `cliArgs.ts` (never `cli.ts` — it runs `main()` on import). Runs a
fresh full scan per invocation, same universe as the dashboard default.

- **Addressing.** `<ref>` matches an exact item name across all three kinds,
  or an id prefix (≥ 4 chars) — skills by `contentId`, plugins by plugin `id`;
  mcp servers are name-only. Skills get the rich treatment; plugins/mcp
  return their existing record plus declaring-config paths.
- **Output modes.** TTY → human panel; piped or `--json` → JSON. Mirrors the
  existing TTY→dashboard / piped→report philosophy.
- **JSON contract** (`schemaVersion: 1`; this is the agent-facing API):
  - core fields incl. full untruncated `contentId`, name, kind, scope,
    provider, `usedBy`, usage (`usageCount`/`lastUsedAt`), visibility;
  - `copies[]` — **every** physical copy *including* the surviving record's
    own `provider.path` (the agent never unions fields): resolved path,
    folder, git grouping from §2;
  - `sites[]` — symlink paths per runtime;
  - `collisions[]` — items elsewhere in the universe with the **same name but
    different contentId** (the promote-safety check);
  - `scanTime`, skillsight version.

### 4. TUI handshake

- Detail pane gains a dim bottom line:
  `agent   skillsight show <id12> --json`. The 12-char prefix is the
  addressable handle — the existing truncated `id` line stays as-is.
- `y` copies that command to the clipboard; `Y` copies the full JSON record,
  assembled in-process from the already-enriched inventory (no rescan).
  Clipboard via **OSC 52** escape sequence (no subprocess, works over SSH),
  with a brief "copied" toast in the pane.
- Optional polish: "lives in" rows show a dim `worktree` suffix where §2's
  data identifies one.

### 5. Errors and exit codes

Deterministic and agent-friendly:

- `0` — found, record printed.
- `1` — no match; print nearest-name suggestions.
- `2` — ambiguous ref; print all candidates as `name · kind · id12 ·
  locations` so the agent can retry with an id prefix.

Ambiguity is an expected case (same-named skills with different content across
projects), not an exception.

### 6. Testing

House patterns:

- Unit tests for pure modules: `git.ts` against fixture `.git` dirs/files,
  ref resolution, topology assembly, the OSC 52 string builder.
- Characterization test for `show --json` on a fixture tree
  (`render-output.test.ts` style — NO_COLOR, dynamic import).
- End-to-end via `--json --dir <tmp>` fixtures, as in the 2026-07-10
  project-hub work.
- Bulk `--json`/`--report` snapshots must remain byte-identical (the §1
  stripping is load-bearing).

## Out of scope

- Any mutation surface (`plan`, `promote`, `rm`, …) — skillsight stays
  read-only.
- Full git status (tracked/dirty) — agent's job at act time.
- Un-truncating the pane `id` line, richer per-location path lists in the
  pane — superseded by the pointer model.

## Plan-stage verification notes

Per Shane's verification rigor preference, the implementation plan must
re-verify against disk and official sources before build:

- the exact dedup points in `resolve.ts` where copies are currently dropped;
- the symlink scan in `symlinks.ts` (where `linkPath` is available);
- the `.git`-file `gitdir:` format against git's official docs (incl. the
  `commondir` indirection for linked worktrees);
- OSC 52 support in Shane's terminal(s);
- current keybind usage in the Ink dashboard to confirm `y`/`Y` are free.
