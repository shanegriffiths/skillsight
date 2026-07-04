# STATE Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a STATE column to the Global and Leaderboard item tables summarising why a row isn't plainly available (`off` / `invoke-only` / `name-only` / `disabled`), blank otherwise.

**Architecture:** Derive an optional `state` field on `ItemRow` in `src/render/ink/rows.ts` (pure, unit-testable — same home as `parked`/`sourceDim`), then render it in `src/render/ink/ItemTable.tsx` as a new column between USES and SOURCE, shown whenever the table isn't `dense` (which is exactly GlobalView + LeaderboardView, no new prop). A `bad: 'red'` token joins the theme palette.

**Tech Stack:** TypeScript (strict, ESM with `.js` import suffixes), vitest, Ink/React. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-state-column-design.md` (same branch).

## Global Constraints

- STATE vocabulary is exactly `off` | `invoke-only` | `name-only` | `disabled`; the cell is blank (field absent) for anything plainly available, including explicit `visibility: 'on'`.
- Mapping: skill `visibility` `off→'off'`, `user-invocable-only→'invoke-only'`, `name-only→'name-only'`; skill without visibility and `enabled: false` → `'disabled'`; plugin/MCP `enabled: false` → `'disabled'`.
- `ItemRow.state` is present ONLY when set (conditional spread) — `test/rows.test.ts` compares rows with exact `toEqual`.
- Colors: `off`/`disabled` red (via a new `theme.bad` token), `invoke-only`/`name-only` dim. Column width 11 (`invoke-only` is the longest label). Parked-row NAME dimming stays unchanged.
- Output surfaces unchanged: `--json`, plain report, DetailView, dense Folders table.
- TypeScript strict; ESM `.js` suffixes; `npm test` green before each commit; commit style `feat: …`.

## File Structure

- **Modify** `src/render/ink/rows.ts` — `ItemState` type, `state` derivation, `ItemRow.state?`.
- **Modify** `src/render/ink/ItemTable.tsx` — STATE column (header + cell).
- **Modify** `src/render/ink/theme.ts` — `bad: 'red'` token.
- **Test** `test/rows.test.ts` — derivation matrix.

---

### Task 1: Derive `ItemRow.state` in rows.ts

**Files:**
- Modify: `src/render/ink/rows.ts`
- Test: `test/rows.test.ts` (append to `describe('itemRows', …)`)

**Interfaces:**
- Consumes: `SkillRecord.visibility` / `.enabled`, `PluginRecord.enabled`, `McpRecord.enabled` (all existing).
- Produces (Task 2 relies on): `export type ItemState = 'off' | 'invoke-only' | 'name-only' | 'disabled'` and `ItemRow.state?: ItemState`, present only when set.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('itemRows', …)` in `test/rows.test.ts`:

```ts
  it('derives state for skills from visibility and enablement', () => {
    const off = { ...skill('s-off', ['cc']), visibility: 'off' as const, visibilitySource: 'user' as const, enabled: false };
    const uio = { ...skill('s-uio', ['cc']), visibility: 'user-invocable-only' as const, visibilitySource: 'user' as const };
    const nameOnly = { ...skill('s-name', ['cc']), visibility: 'name-only' as const, visibilitySource: 'project' as const };
    const promoted = { ...skill('s-on', ['cc']), visibility: 'on' as const, visibilitySource: 'project' as const };
    const codexDisabled = { ...skill('s-codex', ['cc']), enabled: false };
    const plain = skill('s-plain', ['cc']);
    const rows = itemRows({ ...emptyBucket(), skills: [off, uio, nameOnly, promoted, codexDisabled, plain] });
    expect(rows.map((r) => r.state)).toEqual(['off', 'invoke-only', 'name-only', undefined, 'disabled', undefined]);
  });

  it('derives disabled state for plugins and mcp servers', () => {
    const rows = itemRows({
      ...emptyBucket(),
      plugins: [plugin('p-on', 'o/r'), { ...plugin('p-off', 'o/r'), enabled: false }],
      mcp: [mcp('m-on', 'stdio'), { ...mcp('m-off', 'http'), enabled: false }],
    });
    expect(rows.map((r) => r.state)).toEqual([undefined, 'disabled', undefined, 'disabled']);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/rows.test.ts`
Expected: 2 FAILs — `r.state` is `undefined` everywhere.

- [ ] **Step 3: Implement**

In `src/render/ink/rows.ts`:

1. Add after the `ItemKind` type:

```ts
/** STATE column summary — why a row isn't plainly available. */
export type ItemState = 'off' | 'invoke-only' | 'name-only' | 'disabled';
```

2. Add to the `ItemRow` interface (after the `parked?` field):

```ts
  /** STATE column value. Absent = plainly available (blank cell). */
  state?: ItemState;
```

3. Add the derivation helper above `skillRow`:

```ts
function skillState(s: SkillRecord): ItemState | undefined {
  if (s.visibility === 'off') return 'off';
  if (s.visibility === 'user-invocable-only') return 'invoke-only';
  if (s.visibility === 'name-only') return 'name-only';
  if (!s.enabled) return 'disabled';
  return undefined;
}
```

4. In `skillRow`, derive and conditionally spread it (alongside the existing `parked` spread):

```ts
function skillRow(s: SkillRecord): ItemRow {
  const parked = s.visibility === 'name-only' || s.visibility === 'user-invocable-only';
  const state = skillState(s);
  return {
    kind: 'skill',
    name: s.name,
    used: s.usedBy.length,
    source: s.provider.source ?? s.provider.kind,
    sourceDim: !s.provider.source,
    record: s,
    usedRuntimes: s.usedBy,
    ...(parked ? { parked: true } : {}),
    ...(state ? { state } : {}),
  };
}
```

5. In `pluginRow` and `mcpRow`, add the same conditional spread as the last property of each returned object:

```ts
    ...(p.enabled ? {} : { state: 'disabled' as const }),
```

(and in `mcpRow`: `...(m.enabled ? {} : { state: 'disabled' as const }),`)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/rows.test.ts && npm test && npm run typecheck`
Expected: all PASS (existing exact-`toEqual` tests unaffected by the conditional spreads).

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/rows.ts test/rows.test.ts
git commit -m "feat: derive ItemRow.state summary (off/invoke-only/name-only/disabled)"
```

---

### Task 2: Render the STATE column in ItemTable

**Files:**
- Modify: `src/render/ink/theme.ts`
- Modify: `src/render/ink/ItemTable.tsx`

**Interfaces:**
- Consumes: `ItemRow.state` / `ItemState` from Task 1; `theme` from `./theme.js`.
- Produces: STATE column visible in every non-`dense` `ItemTable` (GlobalView + LeaderboardView); dense Folders table unchanged.

- [ ] **Step 1: Add the `bad` theme token**

In `src/render/ink/theme.ts`, add one line to the `theme` object:

```ts
  bad: 'red', // off / disabled states
```

- [ ] **Step 2: Add the column to ItemTable**

In `src/render/ink/ItemTable.tsx`:

1. Add the width constant next to the others:

```ts
const STATE_W = 11; // longest label: 'invoke-only'
```

2. In `HeaderRow`, add a `showState` prop (alongside `showKind`/`showMarks`/`showSource` in its props type: `showState: boolean;`) and render the header cell between the USES and SOURCE blocks:

```tsx
      {showState ? (
        <Box width={STATE_W} marginRight={1}>
          <Text dimColor bold>
            STATE
          </Text>
        </Box>
      ) : null}
```

3. In `Row`, add the same `showState: boolean;` prop and render the cell between the USES and SOURCE blocks:

```tsx
      {showState ? (
        <Box width={STATE_W} marginRight={1}>
          <Text
            color={row.state === 'off' || row.state === 'disabled' ? theme.bad : undefined}
            dimColor={row.state === 'invoke-only' || row.state === 'name-only'}
          >
            {row.state ?? ''}
          </Text>
        </Box>
      ) : null}
```

4. In the `ItemTable` component, derive `const showState = !dense;` next to `effShowKind`/`showSource` and pass `showState={showState}` to `HeaderRow` and to each `Row`.

- [ ] **Step 3: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS (no snapshot covers the Ink table; render-output snapshots are the plain renderer only).

- [ ] **Step 4: Eyeball the live dashboard**

Run: `npx tsx src/cli.ts` in a terminal ≥120 cols, check the Global tab shows the STATE column with `invoke-only` dim rows and any `disabled` plugin/MCP red; press `3` for Leaderboard (also shown); press `1` for Folders (dense — unchanged). Quit with `q`. If not running interactively, `npx tsx src/cli.ts --report > /dev/null; echo $?` at minimum confirms no crash, and note the visual check for the controller.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/theme.ts src/render/ink/ItemTable.tsx
git commit -m "feat: STATE column in Global + Leaderboard item tables"
```
