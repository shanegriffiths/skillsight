# Dashboard Quick Wins (B2 · C3 · C4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the engine's already-captured `usedBy` and origin data in the live Ink dashboard as an aligned `KIND/NAME/USED/SOURCE` table, and tidy the folder list's "global only" marker.

**Architecture:** A new pure, renderer-free helper (`src/render/ink/rows.ts`) flattens a `Bucket` into typed `ItemRow`s carrying raw field values. `DetailPane.tsx` renders each row as a `<Box flexDirection="row">` of fixed-width `<Box>` cells (so Ink does alignment + `…` truncation natively). `FolderList.tsx` drops the trailing `·` and dims global-only folders. The pure helper is unit-tested with vitest; the thin Ink components follow the repo's existing "components untested" convention (with an optional zero-dependency `renderToString` smoke test in the final task).

**Tech Stack:** TypeScript (NodeNext ESM, `.js` import specifiers), React + Ink 7.1.0, vitest 4.

## Global Constraints

- **Scope is the Ink dashboard only.** Touch only `src/render/ink/*` (plus its test). Do **not** modify `src/render/plain.ts`, the JSON renderer, the engine, or adapters.
- **`--report` and `--json` output must remain byte-for-byte unchanged.**
- **No new runtime or dev dependencies.** Ink (`renderToString`, `Box`, `Text`) and vitest are already installed.
- **`rows.ts` is pure** — no Node imports, no Ink imports, no stdout. It returns raw field values, never pre-padded/truncated strings.
- **Ink truncation requires a width-bounded container** — every truncatable cell must be a fixed-`width` `<Box>` wrapping a `<Text wrap="truncate-end">`.
- **`used` semantics:** a number for skills (including `0`, rendered `·`); `null` for plugins/MCP (rendered `—`).
- **KIND labels are full words:** `skill` / `plugin` / `mcp`. Header row repeats once per scope section.
- Import specifiers use the `.js` extension (NodeNext), e.g. `import { itemRows } from './rows.js'`.
- Run `npm run typecheck` and `npm test` at the end of every task; both must be green before committing.

---

## File Structure

- **Create** `src/render/ink/rows.ts` — pure `Bucket → ItemRow[]` mapper (all per-kind usedBy/source/fallback logic).
- **Create** `test/rows.test.ts` — vitest unit tests for `itemRows`.
- **Modify** `src/render/ink/DetailPane.tsx` — replace the flat `name [tag]` list with the aligned table built from `itemRows`.
- **Modify** `src/render/ink/FolderList.tsx` — B2: remove `·`, dim global-only folder names.
- **Create (optional, Task 4)** `test/detailpane.test.ts` + a one-line `vitest.config.ts` esbuild tweak — `renderToString` smoke test.

---

## Task 1: Pure `rows.ts` helper + unit tests

**Files:**
- Create: `src/render/ink/rows.ts`
- Test: `test/rows.test.ts`

**Interfaces:**
- Consumes: `Bucket`, `SkillRecord`, `PluginRecord`, `McpRecord` from `src/types.js`.
- Produces:
  - `type ItemKind = 'skill' | 'plugin' | 'mcp'`
  - `interface ItemRow { kind: ItemKind; name: string; used: number | null; source: string | null; sourceDim: boolean }`
  - `function itemRows(b: Bucket): ItemRow[]` — order is all skills, then plugins, then MCP.

- [ ] **Step 1: Write the failing test**

Create `test/rows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { itemRows } from '../src/render/ink/rows.js';
import type { Bucket, SkillRecord, PluginRecord, McpRecord } from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function skill(name: string, usedBy: string[], source?: string): SkillRecord {
  return {
    name,
    contentId: name,
    provider: { kind: source ? 'shared-store' : 'project-local', source, path: `/x/${name}` },
    usedBy,
    enabled: true,
    scope: 'project-scoped',
  };
}

function plugin(name: string, marketplaceRepo?: string): PluginRecord {
  return {
    id: name,
    name,
    marketplace: 'official',
    marketplaceRepo,
    version: '1.0.0',
    scope: 'user',
    enabled: true,
    provides: { skills: [], commands: [], agents: [], mcpServers: [] },
    supportsRuntimes: [],
  };
}

function mcp(name: string, kind: McpRecord['transport']['kind']): McpRecord {
  return {
    name,
    transport: { kind },
    provider: { kind: 'user', path: `/x/${name}` },
    scope: 'project-scoped',
    enabled: true,
  };
}

describe('itemRows', () => {
  it('maps a shared-store skill to count + owner/repo source', () => {
    const b: Bucket = { ...emptyBucket(), skills: [skill('systematic-debugging', ['cc', 'codex'], 'obra/superpowers')] };
    expect(itemRows(b)).toEqual([
      { kind: 'skill', name: 'systematic-debugging', used: 2, source: 'obra/superpowers', sourceDim: false },
    ]);
  });

  it('maps a skill with no usedBy and no source to used:0 and dim provider kind', () => {
    const b: Bucket = { ...emptyBucket(), skills: [skill('local-thing', [])] };
    expect(itemRows(b)).toEqual([
      { kind: 'skill', name: 'local-thing', used: 0, source: 'project-local', sourceDim: true },
    ]);
  });

  it('maps a plugin to used:null and marketplaceRepo source', () => {
    const b: Bucket = { ...emptyBucket(), plugins: [plugin('chrome-devtools', 'anthropics/claude-code')] };
    expect(itemRows(b)).toEqual([
      { kind: 'plugin', name: 'chrome-devtools', used: null, source: 'anthropics/claude-code', sourceDim: false },
    ]);
  });

  it('falls back to dim marketplace name when a plugin has no repo', () => {
    const b: Bucket = { ...emptyBucket(), plugins: [plugin('local-plugin')] };
    expect(itemRows(b)).toEqual([
      { kind: 'plugin', name: 'local-plugin', used: null, source: 'official', sourceDim: true },
    ]);
  });

  it('maps an mcp server to used:null and dim transport kind', () => {
    const b: Bucket = { ...emptyBucket(), mcp: [mcp('linear', 'http')] };
    expect(itemRows(b)).toEqual([
      { kind: 'mcp', name: 'linear', used: null, source: 'http', sourceDim: true },
    ]);
  });

  it('orders rows skills, then plugins, then mcp', () => {
    const b: Bucket = {
      skills: [skill('s', ['cc'], 'o/r')],
      plugins: [plugin('p', 'o/r')],
      mcp: [mcp('m', 'stdio')],
    };
    expect(itemRows(b).map((r) => r.kind)).toEqual(['skill', 'plugin', 'mcp']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/rows.test.ts`
Expected: FAIL — cannot resolve `../src/render/ink/rows.js` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/render/ink/rows.ts`:

```ts
import type { Bucket, SkillRecord, PluginRecord, McpRecord } from '../../types.js';

export type ItemKind = 'skill' | 'plugin' | 'mcp';

export interface ItemRow {
  kind: ItemKind;
  name: string;
  /** usedBy count for skills (incl. 0); null when not applicable (plugins, mcp). */
  used: number | null;
  /** Where it lives: owner/repo, marketplace repo, transport kind, or provider kind. */
  source: string | null;
  /** True when `source` is a fallback (provider/transport kind) and should render dim. */
  sourceDim: boolean;
}

function skillRow(s: SkillRecord): ItemRow {
  return {
    kind: 'skill',
    name: s.name,
    used: s.usedBy.length,
    source: s.provider.source ?? s.provider.kind,
    sourceDim: !s.provider.source,
  };
}

function pluginRow(p: PluginRecord): ItemRow {
  return {
    kind: 'plugin',
    name: p.name,
    used: null,
    source: p.marketplaceRepo ?? p.marketplace,
    sourceDim: !p.marketplaceRepo,
  };
}

function mcpRow(m: McpRecord): ItemRow {
  return {
    kind: 'mcp',
    name: m.name,
    used: null,
    source: m.transport.kind,
    sourceDim: true,
  };
}

export function itemRows(b: Bucket): ItemRow[] {
  return [...b.skills.map(skillRow), ...b.plugins.map(pluginRow), ...b.mcp.map(mcpRow)];
}
```

- [ ] **Step 4: Run tests + typecheck to verify they pass**

Run: `npx vitest run test/rows.test.ts && npm run typecheck`
Expected: all 6 `itemRows` tests PASS; `tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/rows.ts test/rows.test.ts
git commit -m "Add pure itemRows helper for dashboard table (C3/C4)"
```

---

## Task 2: DetailPane aligned table

**Files:**
- Modify: `src/render/ink/DetailPane.tsx` (full rewrite of the file)

**Interfaces:**
- Consumes: `itemRows`, `ItemRow` from `./rows.js`; `Bucket`, `FolderReport` from `../../types.js`.
- Produces: unchanged export `DetailPane({ folder }: { folder: FolderReport | undefined })`.

- [ ] **Step 1: Rewrite `DetailPane.tsx`**

Replace the entire contents of `src/render/ink/DetailPane.tsx` with:

```tsx
import { Box, Text } from 'ink';
import type { Bucket, FolderReport } from '../../types.js';
import { itemRows, type ItemRow } from './rows.js';

const KIND_W = 6;
const USED_W = 4;
const SOURCE_W = 22;

function HeaderRow() {
  return (
    <Box>
      <Box width={KIND_W} marginRight={1}>
        <Text dimColor bold>
          KIND
        </Text>
      </Box>
      <Box flexGrow={1} marginRight={1}>
        <Text dimColor bold>
          NAME
        </Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor bold>
          USED
        </Text>
      </Box>
      <Box width={SOURCE_W}>
        <Text dimColor bold>
          SOURCE
        </Text>
      </Box>
    </Box>
  );
}

function Row({ row }: { row: ItemRow }) {
  const used = row.used === null ? '—' : row.used === 0 ? '·' : String(row.used);
  const usedDim = row.used === null || row.used === 0;
  return (
    <Box>
      <Box width={KIND_W} marginRight={1}>
        <Text dimColor>{row.kind}</Text>
      </Box>
      <Box flexGrow={1} marginRight={1}>
        <Text wrap="truncate-end">{row.name}</Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor={usedDim}>{used}</Text>
      </Box>
      <Box width={SOURCE_W}>
        <Text wrap="truncate-end" dimColor={row.sourceDim}>
          {row.source ?? ''}
        </Text>
      </Box>
    </Box>
  );
}

function Section({ title, b }: { title: string; b: Bucket }) {
  const rows = itemRows(b);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 20);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        {title} <Text dimColor>({rows.length})</Text>
      </Text>
      <HeaderRow />
      {shown.map((r, i) => (
        <Row key={`${title}-${i}`} row={r} />
      ))}
      {rows.length > shown.length ? (
        <Text dimColor>
          {'  '}…and {rows.length - shown.length} more
        </Text>
      ) : null}
    </Box>
  );
}

export function DetailPane({ folder }: { folder: FolderReport | undefined }) {
  if (!folder) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text dimColor>select a folder</Text>
      </Box>
    );
  }
  const empty = itemRows(folder.projectScoped).length + itemRows(folder.local).length === 0;
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold underline>
        {folder.path}
      </Text>
      {empty ? <Text dimColor>global only — adds nothing beyond the inherited layer</Text> : null}
      <Section title="project-scoped" b={folder.projectScoped} />
      <Section title="local" b={folder.local} />
    </Box>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: `tsc --noEmit` exits 0 (no type errors; `ItemRow`/`itemRows` resolve, JSX checks pass).

- [ ] **Step 3: Run the full test suite (no regressions)**

Run: `npm test`
Expected: PASS — all existing tests plus Task 1's `rows.test.ts` (39 tests). No renderer test asserts the old `name [tag]` format, so nothing should break; if a test fails, stop and report rather than editing it.

- [ ] **Step 4: Manual visual smoke (no assertion, just look)**

Run: `npm run dev` in a terminal, arrow to a folder that has project-scoped or local items.
Expected: the detail pane shows a `KIND  NAME  USED  SOURCE` header then aligned rows — skills with a number + `owner/repo`, plugins/MCP with `—` and a dim source. Press `q` to quit. (Skip if running non-interactively; Step 2–3 are the gating checks.)

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/DetailPane.tsx
git commit -m "Render DetailPane as aligned KIND/NAME/USED/SOURCE table (C2/C3/C4)"
```

---

## Task 3: FolderList — remove dot, dim global-only (B2)

**Files:**
- Modify: `src/render/ink/FolderList.tsx`

**Interfaces:**
- Consumes: `FolderReport` from `../../types.js`; `bucketCounts` from `../../resolve.js` (unchanged).
- Produces: unchanged export `FolderList({ folders, selected })`.

- [ ] **Step 1: Edit the row rendering**

In `src/render/ink/FolderList.tsx`, replace the `folders.map(...)` body. Change this block:

```tsx
      {folders.map((f, i) => {
        const name = f.path.split('/').pop() || f.path;
        const d = delta(f);
        const active = i === selected;
        return (
          <Text key={f.path} inverse={active} wrap="truncate-end">
            {active ? '› ' : '  '}
            {name} {d > 0 ? <Text color="cyan">+{d}</Text> : <Text dimColor>·</Text>}
          </Text>
        );
      })}
```

to:

```tsx
      {folders.map((f, i) => {
        const name = f.path.split('/').pop() || f.path;
        const d = delta(f);
        const active = i === selected;
        const globalOnly = d === 0;
        return (
          <Text key={f.path} inverse={active} dimColor={globalOnly && !active} wrap="truncate-end">
            {active ? '› ' : '  '}
            {name}
            {d > 0 ? <Text color="cyan"> +{d}</Text> : null}
          </Text>
        );
      })}
```

(The only changes: add `const globalOnly = d === 0;`, add `dimColor={globalOnly && !active}` to the `<Text>`, drop the trailing `·` branch, and move the space inside the `+{d}` element so there is no dangling space when there is no delta.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS (no FolderList test exists; this confirms no collateral breakage).

- [ ] **Step 4: Manual visual smoke**

Run: `npm run dev`. Folders with additions show `name +N` (cyan `+N`); folders that only inherit globals show a **dimmed name with no trailing dot**; the selected row is highlighted (not dimmed). Press `q`.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/FolderList.tsx
git commit -m "Drop trailing dot; dim global-only folders in list (B2)"
```

---

## Task 4 (OPTIONAL): DetailPane renderToString smoke test

Per the spec this is optional — it adds direct coverage of the new table using Ink's built-in `renderToString` (no new dependency). It requires telling vitest's esbuild to use the automatic JSX runtime (the project has no `@vitejs/plugin-react`). Skip this task if keeping components untested (the repo's current convention) is preferred.

**Files:**
- Modify: `vitest.config.ts`
- Create: `test/detailpane.test.ts`

- [ ] **Step 1: Enable automatic JSX in vitest's esbuild**

Edit `vitest.config.ts` to add an `esbuild` block:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 2: Write the smoke test**

Create `test/detailpane.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'ink';
import { DetailPane } from '../src/render/ink/DetailPane.js';
import type { FolderReport } from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function folder(): FolderReport {
  return {
    path: '/Users/x/proj',
    group: 'g',
    runtimes: [],
    global: emptyBucket(),
    projectScoped: {
      ...emptyBucket(),
      skills: [
        {
          name: 'systematic-debugging',
          contentId: 'systematic-debugging',
          provider: { kind: 'shared-store', source: 'obra/superpowers', path: '/x' },
          usedBy: ['cc', 'codex'],
          enabled: true,
          scope: 'project-scoped',
        },
      ],
    },
    local: emptyBucket(),
    effective: emptyBucket(),
  };
}

describe('DetailPane', () => {
  it('renders a KIND/NAME/USED/SOURCE table with the skill row', () => {
    const out = renderToString(h(DetailPane, { folder: folder() }), { columns: 100 });
    expect(out).toContain('KIND');
    expect(out).toContain('SOURCE');
    expect(out).toContain('systematic-debugging');
    expect(out).toContain('obra/superpowers');
    expect(out).toContain('2');
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run test/detailpane.test.ts`
Expected: PASS. (If it fails to resolve the JSX in `DetailPane.tsx`, confirm Step 1's `esbuild` block was saved.)

- [ ] **Step 4: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: both green.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts test/detailpane.test.ts
git commit -m "Add renderToString smoke test for DetailPane table"
```

---

## Self-Review

**Spec coverage:**
- C3 "used N times" → Task 1 (`used` field) + Task 2 (USED column). ✓
- C4 origin → Task 1 (`source`/`sourceDim` with per-kind resolution + fallback) + Task 2 (SOURCE column). ✓
- C2 table groundwork → Task 2 (KIND/NAME/USED/SOURCE fixed-width cells). ✓
- B2 remove dot / dim global-only → Task 3. ✓
- Pure helper + vitest test, no new dep → Task 1; components light on tests with optional `renderToString` → Task 4. ✓
- `--report`/`--json` unchanged → enforced by Global Constraints; no task touches those files. ✓
- `used` 0→`·` vs null→`—`; KIND full words; header per section → Task 1 + Task 2. ✓

**Placeholder scan:** none — every code/command step is concrete.

**Type consistency:** `ItemRow` / `ItemKind` / `itemRows` defined in Task 1 are used verbatim in Tasks 2 and 4. `used: number | null`, `source: string | null`, `sourceDim: boolean` are consistent across the helper, the renderer, and both tests. Test record builders match the `SkillRecord` / `PluginRecord` / `McpRecord` / `Provider` interfaces in `src/types.ts` (required fields: `Provider.path`, `SkillRecord.{contentId,usedBy,enabled,scope}`, `PluginRecord.{id,marketplace,version,scope,enabled,provides,supportsRuntimes}`, `McpRecord.{transport,provider,scope,enabled}`).
