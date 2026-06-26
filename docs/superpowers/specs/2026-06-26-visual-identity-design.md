# Design — visual identity & iconography (Epic D: D1 + D2, with C3 + C4)

Date: 2026-06-26
Roadmap items: **D1** (per-runtime icons/glyphs), **D2** (interface polish),
**C3** ("used N times" as a sort key), **C4** (openable origin URL). Folded into
one phase because all four are presentation-only and share the same new module.

## Goal

The dashboard is functionally complete — tabs, folder tree, drill-to-detail, live
filtering. What's missing is **identity**: every runtime currently reads as plain
text, and "which runtimes use this skill" is only a bare count. This phase gives
each runtime a **mark** (a colored letter badge), surfaces those marks across the
views so origin/reach is legible at a glance, makes the `usedBy` count a real sort
key on the Global list, and turns the detail-view origin URL into a clickable
hyperlink. It is the last cross-cutting pillar of the v0.2 theme ("richer
presentation").

Everything here is **presentation-layer** (`src/render/ink/*`). The engine already
emits `provider.kind`, `usedBy`, `sourceUrl`, and the declaring `runtime` on
plugins/mcp — no engine, adapter, resolver, `discovery.ts`, `filter.ts`,
`plain.ts`, or `json.ts` change.

## Decisions (from brainstorming)

- **Scope = D1 + D2 + C3 + C4.** The full visual pass plus the two adjacent C
  quick-wins.
- **Mark = a colored single-letter badge** (reverse-video: a brand-hued cell with a
  contrast letter). One cell wide so columns stay aligned (no emoji — they are
  width-2 and break the column math; the codebase already proves single-cell
  Unicode like `▸ ▾ · ● ⚠ ›` renders). Color is the at-a-glance signal; the letter
  is the no-color / colorblind fallback.
- **Bounded to the 6 detected runtimes.** A skill's `usedBy` can list ~14 registry
  runtimes (the shared-hub fan-out), but only six are actually installed
  (`claude-code, codex, cursor, gemini-cli, hermes-agent, opencode` — the
  `deep: true` set). Marks intersect `usedBy` with these six, so a strip is ≤6
  cells. Anything outside the six renders as a dim neutral `·`.
- **Nerd Fonts deferred** (YAGNI). Brand glyphs for these six aren't reliably in
  Nerd Fonts and need a patched font. `runtimeMark.ts` is shaped so a glyph layer
  could be added later behind a flag; letters ship as the one robust default.
- **C4 = a real terminal hyperlink** (OSC-8 via `terminal-link`), not a shell-out.
  Cmd/Ctrl-click opens, right-click copies; auto-falls back to plain selectable
  text where unsupported (e.g. Terminal.app).
- **Judgment call — `USED` count vs badge count.** `USED` stays the full
  `usedBy.length` (registry-wide reach, unchanged from the shipped leaderboard);
  badges show only the installed subset. So a hub skill can read `USED 14` with 4
  badges. This is honest ("badges = your runtimes, number = total reach") and
  avoids changing shipped leaderboard semantics/tests. Detail appends a dim `+N`
  for the non-installed remainder so no information is lost.
- **Judgment call — C3 lands on the Global list only.** The Global list is flat and
  sorts cleanly. The Folders items column is structurally grouped (plugin groups →
  standalone skills → plugins → mcp); a global re-sort would scramble that, so its
  order is left as-is. The Leaderboard is already `used`-sorted. (Surfacing a sort
  toggle inside the grouped Folders column is deferred.)

## Scope & boundary

- **In scope:** the Ink dashboard — a new pure `runtimeMark.ts` + `theme.ts`, a new
  presentational `Badges.tsx`, edits to `ItemTable.tsx`, `DetailView.tsx`,
  `detail.ts`, `rows.ts`, `tree.ts`, `FolderList.tsx`, `GlobalBand.tsx`,
  `GlobalView.tsx`, `LeaderboardView.tsx`, and tests.
- **Out of scope (byte-for-byte unchanged):** the engine, adapters, resolver,
  `discovery.ts`, `filter.ts`, `index.ts`, `plain.ts`, `json.ts`, the CLI surface.
- **One new runtime dependency:** `terminal-link` (+ its `supports-hyperlinks`
  dep), solely for C4. No other new deps — Ink's `Text` already supports
  `color` / `backgroundColor`.

## The runtime → mark mapping

`runtimeMark.ts` owns the only copy of this table. Letters are forced apart because
claude-code / codex / cursor all start with "C"; color carries identity, the letter
is the tiebreak. `fg` is the letter color, chosen per-hue for contrast (verified in
a real terminal during impl — `inverse` alone goes muddy on dark hues, so we set an
explicit `backgroundColor` + `fg`).

| runtime | letter | bg (hue) | fg |
|---|---|---|---|
| claude-code | `C` | amber `#D97757` | black |
| codex | `X` | green `#10A37F` | white |
| cursor | `U` | magenta `#C678DD` | black |
| gemini-cli | `G` | blue `#4285F4` | white |
| hermes-agent | `H` | cyan `#06B6D4` | black |
| opencode | `O` | red `#EF4444` | white |

`DETECTED_ORDER` (the canonical strip/sort order) mirrors `DEEP_RUNTIMES` so badges
read in the same order as the filter-bar chips:
`['claude-code','codex','hermes-agent','gemini-cli','cursor','opencode']`. Hex hues
degrade through chalk (truecolor → ansi256 → ansi16) on lesser terminals; final
shades confirmed in-terminal during impl.

## Pure module — `runtimeMark.ts` (unit-tested)

```ts
import type { Runtime } from '../../types.js';

export interface RuntimeMark {
  id: Runtime;
  letter: string;   // single cell, ASCII
  bg: string;       // hex hue
  fg: 'black' | 'white';
}

/** The mark for a detected runtime, or undefined (caller renders a dim '·'). */
export function runtimeMark(id: Runtime): RuntimeMark | undefined;

/** usedBy ∩ detected six, in DETECTED_ORDER. The strip model for a row/field. */
export function marksFor(usedBy: readonly Runtime[]): RuntimeMark[];

/** Count of usedBy runtimes NOT in the detected six (the dim "+N" remainder). */
export function otherCount(usedBy: readonly Runtime[]): number;
```

No React here — tests never need Ink.

## Presentational component — `Badges.tsx`

```tsx
// Packed strip of reverse-video badges; renders nothing for an empty list.
export function Badges({ marks, plus }: { marks: RuntimeMark[]; plus?: number }): JSX.Element | null;
```

Each badge = `<Text backgroundColor={m.bg} color={m.fg}>{m.letter}</Text>`, packed
with no separators (the color boundaries separate them). An optional dim `+{plus}`
trails the strip (used by the detail `used by` field). This is the only place that
turns marks into Ink elements.

## Data flow

- **`rows.ts` — `ItemRow` gains `usedRuntimes: Runtime[]`.** `skillRow` → `s.usedBy`;
  `pluginRow` / `mcpRow` → `record.runtime ? [record.runtime] : []` (the single
  declaring/origin runtime). Synthetic plugin-group headers (built in `grouping.ts`,
  no record) get `[]` → no badges. `Badges` consumes `marksFor(row.usedRuntimes)`.
- **`tree.ts` — `FolderRow` gains `runtimes: Runtime[]`.** Aggregated post-order
  exactly like `count`: each `TreeNode` carries a `Set<Runtime>` seeded from
  `folder.runtimes` and unioned up the subtree; flattened to a
  `DETECTED_ORDER`-sorted array intersected with the six. So a folder's strip is
  "which of your runtimes have skills anywhere in this subtree."

Both fields are pure and covered by `rows.test.ts` / `tree.test.ts`.

## Per-surface wiring

| Surface | Change |
|---|---|
| **Detail `used by`** (`detail.ts` + `DetailView.tsx`) | Replace the comma list with `<Badges marks={marksFor(usedBy)} plus={otherCount(usedBy)} />`. The detail field becomes a structured value the view renders (see below). |
| **Leaderboard rows** (`ItemTable`, `showMarks`) | New `USES` badge column. |
| **Global list rows** (`ItemTable`, `showMarks`) | Same `USES` column. |
| **Folders items column** (`ItemTable`, `showMarks` + `dense`) | Badges, but width-starved → `dense` hides KIND and drops/shrinks SOURCE so name + USES fit at 80 cols. |
| **Folder tree rows** (`FolderList`) | A compact badge strip after the cyan `+N`. Requires `FolderList` to become a flex `Box` row (label `flexGrow` + truncate, badges in a fixed trailing slot) so badges aren't eaten by `truncate-end`. |
| **`GLOBAL` band** (`GlobalBand.tsx`) | Badge `inv.runtimesDetected` instead of the comma list. |
| **`STATS` band** (`LeaderboardView` `StatsBand`) | Badge the `perRuntime` runtimes (count kept alongside each badge). |

### `ItemTable` prop changes

Add two optional props, both defaulting off so existing call sites are unaffected
until opted in:

- `showMarks?: boolean` — render the `USES` column (`<Badges>` from
  `row.usedRuntimes`; empty for group headers / unused rows).
- `dense?: boolean` — the cramped Folders mode: force `showKind=false` and reduce
  `SOURCE_W` (toward 0) so `name` + `USES` dominate. Exact widths tuned during impl
  against an 80-col check; the column must never overflow.

`USES` column width = 6 (max badges) + 1 margin. `LeaderboardView` and `GlobalView`
pass `showMarks`; `FoldersView` passes `showMarks dense`.

### Detail field model (`detail.ts`)

`used by` can no longer be a plain string. The minimal change: `DetailField` gains
an optional `runtimes?: Runtime[]` (the raw `usedBy`); when present, `DetailView`
renders `<Badges marks={marksFor(runtimes)} plus={otherCount(runtimes)} />` in place
of the text value. All other fields stay string-valued and unchanged.

## C3 — `used` as a sort key (Global list)

`GlobalView` gains local `useState<SortMode>` (`'used' | 'name'`, default `'used'`)
and an `s` key that cycles it (mirroring the Folders tree's `s` UX), with the mode
shown in the footer. A pure comparator `sortItemRows(rows, mode)` (in `rows.ts`,
tested): `used` → `(b.used ?? -1) - (a.used ?? -1)` then name; `name` →
`localeCompare`. Plugins/mcp (`used === null`) sort last under `used`. `s` is free
in `GlobalView` (its `useInput` uses arrows/`j`/`k`/`Enter`/`Esc`; App owns
`1/2/3/Tab/f/q`). Leaderboard already sorts by `used` (unchanged); Folders order
unchanged.

## C4 — clickable origin URL (detail)

The detail `url` field renders through
`terminalLink(url, url, { fallback: (text) => text })` — the explicit `fallback`
matters: `terminal-link`'s **default** fallback is `text (url)`, which with
identical args would print the URL twice; `(text) => text` makes the unsupported
path show the bare URL (still selectable). The result stays a plain string, so
`DetailView` needs no special case beyond using the linked value. Applies to the
skill `url` field (`provider.sourceUrl`) and the mcp `url` field (`transport.url`)
where present.

## D2 — bounded polish (pinned)

1. **`theme.ts`** — lift scattered color literals into named semantic tokens
   (`accent` = cyan `+N`, `good` = green "live", `warn` = yellow "rescanning",
   `dim`, plus re-exporting the runtime palette). `runtimeMark.ts`, `FolderList`,
   `Header`, and the bands consume it. One home for color hierarchy; no behavior
   change beyond centralization.
2. **The badge treatment itself** is the headline richness (covers "icons" +
   "color hierarchy").
3. **`ItemTable` alignment pass** — the new `USES` column header + spacing so all
   views stay uniform.

Explicitly **not** doing: re-spacing every view, density toggles, or restyling
borders/bands beyond the badge swap and the color centralization.

## Display semantics

- `USED` = `usedBy.length` (registry reach) — the sort key and the number shown.
- Badges = `usedBy ∩ detected six`, so badge count ≤ `USED`. Detail shows the gap as
  a dim `+N`.
- Plugins / mcp: no `USED`; their single badge is the declaring `runtime` (origin).
- Group headers / rows with no runtimes: no badges (blank `USES` cell).

ASCII sketch — Leaderboard (each letter is a reverse-video colored cell):

```
leaderboard (128) — skills by runtime reach
  NAME                 USED  USES
› superpowers             6  CXHGUO
  brainstorming           4  CXHG
  shared-helper           4  XGUO      ← hub skill: no claude-code / hermes
  pdf-tools               1  C
STATS  812 skills · 47 plugins · 12 mcp
by runtime  C 3271  X 926  H 2310  G 695  U 695  O 695
```

Detail — `used by` badges + remainder, url linked:

```
brainstorming
  kind     skill
  used by  CXHG +10
  source   obra/superpowers
  url      https://github.com/obra/superpowers   ← cmd-click opens
  ...
```

Folder tree — per-folder subtree runtime strip after `+N`:

```
› ▾ Developer/Projects        +214  CXHG
    ▸ skillsight               +18  CX
    ▸ studio-brio               +6  C
```

## Testing

- **`test/runtimeMark.test.ts`** (new): `runtimeMark` returns the right
  letter/bg/fg for each of the six and `undefined` otherwise; `marksFor` intersects
  with the six, dedupes, and orders by `DETECTED_ORDER` regardless of input order;
  `otherCount` counts only non-detected ids.
- **`test/rows.test.ts`** (extend): `usedRuntimes` = `usedBy` for skills and
  `[runtime]`/`[]` for plugins/mcp; `sortItemRows` orders by `used` desc (nulls
  last) then name, and by name in name mode, without mutating input.
- **`test/tree.test.ts`** (extend): `FolderRow.runtimes` aggregates the union of a
  subtree's `folder.runtimes` (intersected with the six, `DETECTED_ORDER`-sorted),
  including across synthetic compressed chains.
- **Components untested** per repo convention (no ink-testing-library). Validated by
  a real-disk smoke: build + run the dashboard, confirm badges render aligned across
  Leaderboard / Global / Folders / detail / bands at 80 cols, the `s` sort flips the
  Global order, and the detail url is a live hyperlink (with graceful fallback).

## File summary

- **Create:** `src/render/ink/runtimeMark.ts`, `src/render/ink/Badges.tsx`,
  `src/render/ink/theme.ts`, `test/runtimeMark.test.ts`.
- **Modify:** `rows.ts` (`usedRuntimes` + `sortItemRows`), `tree.ts`
  (`FolderRow.runtimes` aggregation), `ItemTable.tsx` (`showMarks` + `dense` +
  `USES` column), `DetailView.tsx` + `detail.ts` (`used by` badges, linked url),
  `FolderList.tsx` (flex row + tree badges), `GlobalBand.tsx` (badged runtimes),
  `GlobalView.tsx` (`showMarks` + `s` sort), `LeaderboardView.tsx` (`showMarks` +
  badged `StatsBand`), `Header.tsx` (theme tokens). `test/rows.test.ts`,
  `test/tree.test.ts` extended.
- **Add dep:** `terminal-link`.
- **Remove:** nothing.

## Deferred / out of scope (future)

- Nerd-Font glyph layer (opt-in behind a flag) — module is shaped for it.
- A sort toggle inside the grouped Folders items column.
- Reconciling `USED` to installed-reach (kept at registry reach this phase).
- Badging the `plain.ts` / `json.ts` renderers (Ink dashboard only).
- Per-runtime marks for non-skill units (rules/extensions/agents) — not in v0.2.

---

## Appendix — verified against the codebase (2026-06-26)

| Claim | Verdict | Evidence |
|---|---|---|
| Detected = the 6 deep runtimes | ✅ | live `runtimesDetected` = `claude-code, codex, hermes-agent, gemini-cli, cursor, opencode`; `runtimes.ts:74–79` (`deep: true`) |
| `usedBy` can list ~14 registry runtimes (hub fan-out) | ✅ | live JSON: 695 skills each `usedBy` amp/antigravity/cline/cursor/codex/gemini-cli/github-copilot/opencode/warp/zed/… |
| Skills carry `usedBy`; plugins/mcp carry a declaring `runtime` | ✅ | `types.ts:69` (`usedBy`), `:98` (plugin `runtime`), `:108` (mcp `runtime`) |
| `provider.sourceUrl` exists for the linked url | ✅ | `types.ts:52`; `detail.ts:23` already shows it |
| `leaderboard()` builds rows via `itemRows()` (so `usedRuntimes` flows there) | ✅ | `stats.ts:20–25` |
| `ItemTable` is shared by Folders/Global/Leaderboard | ✅ | `FoldersView.tsx:94`, `GlobalView.tsx:47`, `LeaderboardView.tsx:63` |
| Folders items column is width-starved | ✅ | shares the row with the 42-wide `FolderList` (`FolderList.tsx:20`); `ItemTable` fixed cols ≈ 37 already (`ItemTable.tsx:4–7`) |
| `tree.ts` aggregates `count` post-order (pattern for `runtimes`) | ✅ | `tree.ts:96–102` (`aggregate`) |
| `FolderReport.runtimes` available to aggregate | ✅ | `types.ts:121` |
| `FolderList` uses one `truncate-end` `Text` (needs flex refactor for trailing badges) | ✅ | `FolderList.tsx:28–40` |
| Ink `Text` supports `backgroundColor` / hex `color` | ✅ | Ink v7 `Text` props |
| `s` is free in `GlobalView` | ✅ | `GlobalView.tsx:18–26` uses arrows/`j`/`k`/`Enter`/`Esc`; App owns `1/2/3/Tab/f/q` |
| `terminal-link` not yet a dependency | ✅ | `package.json` deps (chokidar, ink, ink-spinner, ink-text-input, picocolors, react, smol-toml, yaml) |
