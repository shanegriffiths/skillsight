# Design — dashboard quick wins (B2 · C3 · C4, with C2 table groundwork)

Date: 2026-06-24
Roadmap items: **B2** (remove trailing folder dot), **C3** (show "used N times"),
**C4** (show origin), pulling forward **C2** (aligned table layout) as the
presentation vehicle.

## Goal

Make the data the engine already captures — `usedBy` and `provider.source` /
`sourceUrl` — visible in the live Ink dashboard, which today renders each item as
a bare `name [tag]` line and never surfaces provenance or usage. Tidy the folder
list's "global only" marker at the same time.

## Scope & boundary

- **In scope:** the Ink dashboard only — `src/render/ink/DetailPane.tsx`,
  `src/render/ink/FolderList.tsx`, and one new pure helper module.
- **Out of scope (unchanged):** `--report` (`src/render/plain.ts`) and `--json`.
  Their schema already carries `usedBy` and `sourceUrl`, so the data is available
  when the later Global tab (A2), Leaderboard (A3), or a report-table want it.
- **Deferred to F3 (skill detail view):** the "copyable / openable URL" half of
  C4. This batch *displays* origin compactly; F3 will make the full URL
  actionable, where there is room and an interaction model.

## DetailPane — aligned table

Each scope section (`project-scoped`, `local`) renders as one aligned table with
a header row. Columns: **KIND · NAME · USED · SOURCE**.

```
project-scoped (4)
KIND   NAME                  USED  SOURCE
skill  systematic-debugging     5  obra/superpowers
skill  json-canvas              3  obra/superpowers
plugin chrome-devtools          —  anthropics/claude-…
mcp    linear                   —  http
```

### Column rules

- **KIND** — `skill` / `plugin` / `mcp`, 6-wide column. Replaces the old
  `[tag]`; the kind is now a real, scannable column (a scope section mixes all
  three kinds, so this is what disambiguates rows).
- **USED** (C3) — `usedBy.length`, right-aligned.
  - Skills: the integer.
  - Skills with an empty `usedBy`: dim `·`.
  - Plugins / MCP: dim `—` (no `usedBy` set exists on those records).
- **SOURCE** (C4) — "where it lives", resolved per kind:
  - Skill with `provider.source`: the `owner/repo` string.
  - Skill without a source: dim `provider.kind` (`project-local`, `user`,
    `runtime-builtin`).
  - Plugin: `provider.marketplaceRepo` (owner/repo), else `marketplace`.
  - MCP: the transport kind (`stdio` / `http` / `sse` / `ws`).
  - Truncated with `…` (the pane is `flexGrow:1`, right of the 42-col list).

### Unchanged behaviour

- The `slice(0, 20)` cap and the "…and N more" line stay.
- Empty sections render nothing; the "global only — adds nothing beyond the
  inherited layer" line stays.

### Baked-in minor decisions

- The `KIND/NAME/USED/SOURCE` header row repeats once per scope section.
- KIND labels are full words (`skill`/`plugin`/`mcp`), not `S/P/M`.
- MCP's SOURCE is the transport kind.

## FolderList — B2

Drop the trailing `·` "global only" marker.

- Folder with additions (`delta > 0`): `name +N` — cyan `+N`, name normal.
- Global-only folder (`delta === 0`): **name dimmed**, no marker.
- The selected row still uses `inverse`.

## Architecture & testing

New pure, renderer-free module `src/render/ink/rows.ts`:

- `itemRows(bucket: Bucket): ItemRow[]`
  where `ItemRow = { kind: 'skill' | 'plugin' | 'mcp'; name: string;
  used: number | null; source: string | null; sourceDim: boolean }`.
  `used` is a number for skills (including `0`) and `null` for plugins/MCP,
  so the renderer can distinguish "skill used by nobody" (`·`) from
  "usage not applicable" (`—`). All per-kind logic (usedBy presence, source
  resolution, fallbacks) lives here. `itemRows` returns **raw field values**, not
  pre-padded strings — column width/alignment/truncation is the renderer's job
  (see below).

`DetailPane` becomes a thin consumer. Each row is a `<Box flexDirection="row">`
of **fixed-width `<Box>` cells** (one per column: KIND, NAME, USED, SOURCE), each
holding a `<Text wrap="truncate-end">`. This lets Ink handle alignment and the
`…` ellipsis natively — note that Ink only truncates when the text sits in a
**width-bounded container**, so per-column truncation *requires* the fixed-width
cell (a single padded `<Text>` per row would not truncate per-column). USED is
right-aligned with `justifyContent="flex-end"` on its cell (or `padStart` on the
number). DetailPane owns colour/dim/inverse and the header row.

`FolderList`'s global-only test is the existing `delta(f) === 0`; B2 is a render
tweak (no new logic needed, though `isGlobalOnly` may be extracted for clarity).

### Tests

`test/rows.test.ts` (vitest, no Ink — mirrors the `watchpaths` pure-helper +
test pattern; **no new dependency**):

- skill with `usedBy` → `used` = integer count, source = `owner/repo`.
- skill with empty `usedBy` → `used: 0` (renders dim `·`).
- skill without `provider.source` → source falls back to `provider.kind`,
  `sourceDim: true`.
- plugin → `used: null` (renders dim `—`), source = `marketplaceRepo`.
- mcp → `used: null` (renders dim `—`), source = transport kind.

The thin Ink components stay light on tests, consistent with the current repo.
**Optional (zero new dependency):** Ink v7 ships `renderToString`, so one smoke
test can render `DetailPane` for a fixture folder at a fixed `columns` width and
assert the header row and a known skill row (name + count + `owner/repo`) appear.
This directly covers the new table without pulling in `ink-testing-library`.

## External API verification

The Ink primitives this spec relies on were verified two ways (per the project's
source-and-disk rigor):

- **Official docs** — `vadimdemedes/ink` readme + API autodocs (via Context7).
  Confirmed: `wrap="truncate-end"` truncates with `…` (and `truncate` is an
  alias for `truncate-end`); truncation needs a width-bounded container;
  `renderToString(node, { columns })` is the supported way to test rendered
  output. Ink **core has no `Table` component** — manual column layout is the
  expected approach (the separate `ink-table` package exists but is not needed
  here).
- **Installed version on disk** — Ink **7.1.0** (`node_modules/ink`). Type defs
  confirm every prop used: `Text` (`color`, `dimColor`, `bold`, `underline`,
  `inverse`, `wrap`) and `Box` (`flexDirection`, `width`, `marginRight`,
  `paddingX`, `flexGrow`, `justifyContent` incl. `flex-end`); `wrap`'s type is
  `'wrap' | 'hard' | 'truncate' | 'truncate-start' | 'truncate-middle' |
  'truncate-end'`; `renderToString` is an exported top-level API.

## Acceptance

- Running `skillsight` on a TTY shows, per folder, a `KIND/NAME/USED/SOURCE`
  table for project-scoped and local items; skills show a usage count and an
  origin; plugins/MCP show `—` for usage and an appropriate source.
- The folder list no longer prints trailing `·`; global-only folders read as
  dimmed names.
- `--report` and `--json` output is byte-for-byte unchanged.
- `vitest run` is green, including the new `test/rows.test.ts`.
