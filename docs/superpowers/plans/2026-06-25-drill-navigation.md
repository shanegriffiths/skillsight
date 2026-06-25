# Drill Navigation (Epic F: F1 · F2 · F3 + C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the drill — move focus *into* a folder, walk its items, expand a plugin to reveal the skills it bundles, and open any item's detail — across the existing two-column frame, with the same detail reachable from the Global and Leaderboard lists.

**Architecture:** Four new pure, unit-tested modules carry the logic — `detail.ts` (record → labelled fields), `grouping.ts` (plugin-grouped folder rows over `mergeBuckets`), `folderNav.ts` (the Folders focus-state reducer), plus an extension to `rows.ts` so every `ItemRow` carries its source record. Thin Ink components sit on top: `ItemTable` learns to draw a `▸/▾` marker + indent, a new shared `DetailView` renders the fields, and `FoldersView` / `GlobalView` / `LeaderboardView` wire the state machines. `App.tsx` sheds its global `Esc` binding and per-tab footer (footers move into the views).

**Tech Stack:** TypeScript (NodeNext ESM, `.js` import specifiers), React 19 + Ink 7.1.0, vitest 4.

## Global Constraints

- **Scope is the Ink dashboard only.** Touch only `src/render/ink/*` (plus its tests). Do **not** modify `src/render/plain.ts`, `src/render/json.ts`, the engine, the resolver, or adapters.
- **`--report` and `--json` output must remain byte-for-byte unchanged.** No task touches those renderers.
- **No new runtime or dev dependencies.** `useInput` (delivers `key.leftArrow`/`rightArrow`/`return`/`escape`/`upArrow`/`downArrow`), `useWindowSize`, `Box`, `Text` (Ink) and vitest are already installed.
- **Pure modules stay pure-testable:** `detail.ts`, `grouping.ts`, `folderNav.ts` expose pure functions with no stdout/Node/React side-effects; their tests import only those functions.
- **Import specifiers use the `.js` extension** (NodeNext), e.g. `import { itemRows } from './rows.js'`.
- **Privacy rule (carried from the engine):** the MCP detail renders `envKeys` / `headerKeys` — **names only**. Never read or display env/header *values*. Asserted in `test/detail.test.ts`.
- **Keymap:** Global (`App`) owns `1/2/3` jump, `Tab`/`Shift+Tab` cycle, `q` quit. Each view owns `↑/↓ j/k`, `Enter`, `→`, `←`, `Esc`. The global `Esc → Folders` binding is **removed** (Task 7). `←/→` (reserved by the shell) now drive expand/collapse and back.
- **Flat lists stay identical.** The `ItemTable` marker/indent only renders for rows that carry `expandState`/`depth`; Global, Leaderboard, and any flat caller render byte-for-byte as today.
- Run `npm run typecheck` and `npm test` at the end of every task; both must be green before committing.

---

## File Structure

- **Modify** `src/render/ink/rows.ts` — extend `ItemRow` (`record`, `depth`, `expandState`); attach `record` in `itemRows`. *(Task 1)*
- **Modify** `test/rows.test.ts` — assert the new `record` field. *(Task 1)*
- **Create** `src/render/ink/detail.ts` — `detailFields(row)` + `DetailField`. *(Task 2)*
- **Create** `test/detail.test.ts`. *(Task 2)*
- **Create** `src/render/ink/grouping.ts` — `groupedRows(projectScoped, local, expanded)`. *(Task 3)*
- **Create** `test/grouping.test.ts`. *(Task 3)*
- **Create** `src/render/ink/folderNav.ts` — `folderNav` reducer + `initialNav`. *(Task 4)*
- **Create** `test/folderNav.test.ts`. *(Task 4)*
- **Modify** `src/render/ink/ItemTable.tsx` — `▸/▾` marker + indent for grouped rows. *(Task 5)*
- **Create** `src/render/ink/DetailView.tsx` — shared detail renderer. *(Task 6)*
- **Modify** `src/render/ink/App.tsx` — drop global `Esc` + the `FOOTER` map. *(Task 7)*
- **Modify** `src/render/ink/GlobalView.tsx`, `LeaderboardView.tsx` — own a static footer. *(Task 7)*
- **Modify** `src/render/ink/FolderList.tsx` — `dimmed` prop. *(Task 8)*
- **Modify** `src/render/ink/FoldersView.tsx` — drill state machine; col-2 swap; **remove `DetailPane` usage**. *(Task 8)*
- **Remove** `src/render/ink/DetailPane.tsx` — replaced by the grouped column + `DetailView`. *(Task 8)*
- **Modify** `src/render/ink/GlobalView.tsx`, `LeaderboardView.tsx` — `list ⇄ detail` mode. *(Task 9)*

Tasks are ordered so the app runs at every step: pure modules first (1–4), backward-compatible component changes (5–6), the no-functional-drill App refactor (7), then the two integrations (8–9).

---

## Task 1: Extend `ItemRow` to carry its record

**Files:**
- Modify: `src/render/ink/rows.ts`
- Modify: `test/rows.test.ts`

**Interfaces:**
- Produces (extended): `interface ItemRow { kind; name; used; source; sourceDim; record?: SkillRecord | PluginRecord | McpRecord; depth?: number; expandState?: 'collapsed' | 'expanded' }`. `itemRows(b: Bucket): ItemRow[]` now sets `record` on every row; `depth`/`expandState` stay unset (added by `grouping.ts`).

- [ ] **Step 1: Update the failing test**

In `test/rows.test.ts`, bind each record to a const and add `record` to the expected literals, and add an identity test. Replace the whole `describe('itemRows', …)` block with:

```ts
describe('itemRows', () => {
  it('maps a shared-store skill to count + owner/repo source', () => {
    const s = skill('systematic-debugging', ['cc', 'codex'], 'obra/superpowers');
    const b: Bucket = { ...emptyBucket(), skills: [s] };
    expect(itemRows(b)).toEqual([
      { kind: 'skill', name: 'systematic-debugging', used: 2, source: 'obra/superpowers', sourceDim: false, record: s },
    ]);
  });

  it('maps a skill with no usedBy and no source to used:0 and dim provider kind', () => {
    const s = skill('local-thing', []);
    const b: Bucket = { ...emptyBucket(), skills: [s] };
    expect(itemRows(b)).toEqual([
      { kind: 'skill', name: 'local-thing', used: 0, source: 'project-local', sourceDim: true, record: s },
    ]);
  });

  it('maps a plugin to used:null and marketplaceRepo source', () => {
    const p = plugin('chrome-devtools', 'anthropics/claude-code');
    const b: Bucket = { ...emptyBucket(), plugins: [p] };
    expect(itemRows(b)).toEqual([
      { kind: 'plugin', name: 'chrome-devtools', used: null, source: 'anthropics/claude-code', sourceDim: false, record: p },
    ]);
  });

  it('falls back to dim marketplace name when a plugin has no repo', () => {
    const p = plugin('local-plugin');
    const b: Bucket = { ...emptyBucket(), plugins: [p] };
    expect(itemRows(b)).toEqual([
      { kind: 'plugin', name: 'local-plugin', used: null, source: 'official', sourceDim: true, record: p },
    ]);
  });

  it('maps an mcp server to used:null and dim transport kind', () => {
    const m = mcp('linear', 'http');
    const b: Bucket = { ...emptyBucket(), mcp: [m] };
    expect(itemRows(b)).toEqual([
      { kind: 'mcp', name: 'linear', used: null, source: 'http', sourceDim: true, record: m },
    ]);
  });

  it('attaches the exact source record to each row', () => {
    const s = skill('x', ['cc']);
    expect(itemRows({ ...emptyBucket(), skills: [s] })[0]!.record).toBe(s);
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
Expected: FAIL — the `toEqual` rows now expect a `record` field that `itemRows` does not yet set.

- [ ] **Step 3: Extend `rows.ts`**

Replace the contents of `src/render/ink/rows.ts` with:

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
  /** The underlying record, so a cursored row can open its detail. Absent on synthetic group-header rows. */
  record?: SkillRecord | PluginRecord | McpRecord;
  /** Indent depth; `1` for a plugin group's child skills (Folders column only). */
  depth?: number;
  /** Present only on plugin-group header rows. */
  expandState?: 'collapsed' | 'expanded';
}

function skillRow(s: SkillRecord): ItemRow {
  return {
    kind: 'skill',
    name: s.name,
    used: s.usedBy.length,
    source: s.provider.source ?? s.provider.kind,
    sourceDim: !s.provider.source,
    record: s,
  };
}

function pluginRow(p: PluginRecord): ItemRow {
  return {
    kind: 'plugin',
    name: p.name,
    used: null,
    source: p.marketplaceRepo ?? p.marketplace,
    sourceDim: !p.marketplaceRepo,
    record: p,
  };
}

function mcpRow(m: McpRecord): ItemRow {
  return {
    kind: 'mcp',
    name: m.name,
    used: null,
    source: m.transport.kind,
    sourceDim: true,
    record: m,
  };
}

export function itemRows(b: Bucket): ItemRow[] {
  return [...b.skills.map(skillRow), ...b.plugins.map(pluginRow), ...b.mcp.map(mcpRow)];
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run test/rows.test.ts && npm run typecheck`
Expected: all 7 `itemRows` tests PASS; `tsc --noEmit` exits 0. (`ItemTable` reads only `kind/name/used/source/sourceDim`, so it still typechecks.)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — 62 tests (was 61; +1 identity test).

- [ ] **Step 6: Commit**

```bash
git add src/render/ink/rows.ts test/rows.test.ts
git commit -m "Carry source record on every ItemRow (F3 groundwork)"
```

---

## Task 2: Pure `detail.ts` (record → fields) + unit tests

**Files:**
- Create: `src/render/ink/detail.ts`
- Test: `test/detail.test.ts`

**Interfaces:**
- Consumes: `ItemRow` from `./rows.js`; `SkillRecord`/`PluginRecord`/`McpRecord`/`Runtime` from `../../types.js`.
- Produces:
  - `interface DetailField { label: string; value: string; dim?: boolean }`
  - `function detailFields(row: ItemRow): DetailField[]` — per-kind labelled fields; `[]` for a row with no `record`.

- [ ] **Step 1: Write the failing test**

Create `test/detail.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detailFields } from '../src/render/ink/detail.js';
import type { ItemRow } from '../src/render/ink/rows.js';
import type { McpRecord, PluginRecord, SkillRecord } from '../src/types.js';

function skillRow(s: Partial<SkillRecord>): ItemRow {
  const record: SkillRecord = {
    name: 'animejs',
    contentId: 'abcdef1234567890',
    provider: { kind: 'shared-store', source: 'h/animejs', sourceUrl: 'https://github.com/h/animejs', path: '/x/animejs' },
    usedBy: ['claude-code', 'codex'],
    enabled: true,
    scope: 'project-scoped',
    ...s,
  };
  return { kind: 'skill', name: record.name, used: record.usedBy.length, source: 'h/animejs', sourceDim: false, record };
}

function pluginRow(p: Partial<PluginRecord>): ItemRow {
  const record: PluginRecord = {
    id: 'gsap-skills',
    name: 'gsap-skills',
    marketplace: 'official',
    marketplaceRepo: 'studio/gsap',
    version: '1.2.0',
    scope: 'user',
    enabled: true,
    provides: { skills: ['a', 'b', 'c'], commands: ['x'], agents: [], mcpServers: [] },
    supportsRuntimes: [],
    ...p,
  };
  return { kind: 'plugin', name: record.name, used: null, source: 'studio/gsap', sourceDim: false, record };
}

function mcpRow(t: McpRecord['transport']): ItemRow {
  const record: McpRecord = {
    name: 'linear',
    transport: t,
    provider: { kind: 'user', path: '/x/linear' },
    scope: 'project-scoped',
    enabled: true,
  };
  return { kind: 'mcp', name: 'linear', used: null, source: t.kind, sourceDim: true, record };
}

function valueOf(fields: ReturnType<typeof detailFields>, label: string): string | undefined {
  return fields.find((f) => f.label === label)?.value;
}

describe('detailFields — skill', () => {
  it('lists used-by, source, url, scope and description', () => {
    const f = detailFields(skillRow({ description: 'Anime.js adapter patterns' }));
    expect(valueOf(f, 'used by')).toBe('claude-code, codex');
    expect(valueOf(f, 'source')).toBe('h/animejs');
    expect(valueOf(f, 'url')).toBe('https://github.com/h/animejs');
    expect(valueOf(f, 'scope')).toBe('project-scoped');
    expect(valueOf(f, 'about')).toBe('Anime.js adapter patterns');
  });

  it('shows the bundling plugin when present', () => {
    const f = detailFields(skillRow({ bundledInPlugin: 'gsap-skills' }));
    expect(valueOf(f, 'plugin')).toBe('gsap-skills');
  });

  it('omits url and about when absent, and dims a kind-only source', () => {
    const f = detailFields(skillRow({ description: undefined, provider: { kind: 'project-local', path: '/x/y' } }));
    expect(valueOf(f, 'url')).toBeUndefined();
    expect(valueOf(f, 'about')).toBeUndefined();
    expect(f.find((x) => x.label === 'source')).toMatchObject({ value: 'project-local', dim: true });
  });

  it('marks an empty used-by list as dim "none"', () => {
    const f = detailFields(skillRow({ usedBy: [] }));
    expect(f.find((x) => x.label === 'used by')).toMatchObject({ value: 'none', dim: true });
  });
});

describe('detailFields — plugin', () => {
  it('summarises what the plugin provides', () => {
    const f = detailFields(pluginRow({}));
    expect(valueOf(f, 'provides')).toBe('3 skills · 1 commands · 0 agents · 0 mcp');
    expect(valueOf(f, 'marketplace')).toBe('studio/gsap');
    expect(valueOf(f, 'version')).toBe('1.2.0');
  });
});

describe('detailFields — mcp', () => {
  it('renders env/header KEY NAMES only — never values (privacy)', () => {
    const f = detailFields(mcpRow({ kind: 'http', url: 'https://mcp.example/sse', headerKeys: ['AUTHORIZATION', 'X_API_KEY'] }));
    expect(valueOf(f, 'transport')).toBe('http');
    expect(valueOf(f, 'url')).toBe('https://mcp.example/sse');
    expect(valueOf(f, 'headers')).toBe('AUTHORIZATION, X_API_KEY');
    // No field anywhere leaks a secret value:
    expect(f.every((x) => !x.value.includes('Bearer') && !x.value.includes('sk-'))).toBe(true);
  });

  it('joins a stdio command with its args and shows env key names', () => {
    const f = detailFields(mcpRow({ kind: 'stdio', command: 'npx', args: ['-y', 'server'], envKeys: ['TOKEN'] }));
    expect(valueOf(f, 'command')).toBe('npx -y server');
    expect(valueOf(f, 'env')).toBe('TOKEN');
  });
});

describe('detailFields — defensive', () => {
  it('returns [] for a row with no record', () => {
    const row: ItemRow = { kind: 'plugin', name: 'group', used: 2, source: null, sourceDim: false, expandState: 'collapsed' };
    expect(detailFields(row)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/detail.test.ts`
Expected: FAIL — cannot resolve `../src/render/ink/detail.js`.

- [ ] **Step 3: Write `detail.ts`**

Create `src/render/ink/detail.ts`:

```ts
import type { McpRecord, PluginRecord, Runtime, SkillRecord } from '../../types.js';
import type { ItemRow } from './rows.js';

export interface DetailField {
  label: string;
  value: string;
  dim?: boolean;
}

function fmtRuntimes(r: Runtime[]): string {
  return r.length ? r.join(', ') : 'none';
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

function skillFields(s: SkillRecord): DetailField[] {
  const f: DetailField[] = [{ label: 'kind', value: 'skill' }];
  f.push({ label: 'used by', value: fmtRuntimes(s.usedBy), dim: s.usedBy.length === 0 });
  if (s.provider.source) {
    f.push({ label: 'source', value: s.provider.source });
    if (s.provider.sourceUrl) f.push({ label: 'url', value: s.provider.sourceUrl, dim: true });
  } else {
    f.push({ label: 'source', value: s.provider.kind, dim: true });
  }
  f.push({ label: 'scope', value: s.scope });
  if (s.bundledInPlugin) f.push({ label: 'plugin', value: s.bundledInPlugin });
  if (!s.enabled) f.push({ label: 'enabled', value: 'no', dim: true });
  f.push({ label: 'path', value: s.provider.path, dim: true });
  f.push({ label: 'id', value: shortId(s.contentId), dim: true });
  if (s.description) f.push({ label: 'about', value: s.description });
  return f;
}

function pluginFields(p: PluginRecord): DetailField[] {
  const pr = p.provides;
  const provides = `${pr.skills.length} skills · ${pr.commands.length} commands · ${pr.agents.length} agents · ${pr.mcpServers.length} mcp`;
  return [
    { label: 'kind', value: 'plugin' },
    { label: 'provides', value: provides },
    { label: 'marketplace', value: p.marketplaceRepo ?? p.marketplace, dim: !p.marketplaceRepo },
    { label: 'scope', value: p.scope },
    { label: 'version', value: p.version, dim: true },
  ];
}

function mcpFields(m: McpRecord): DetailField[] {
  const t = m.transport;
  const f: DetailField[] = [
    { label: 'kind', value: 'mcp' },
    { label: 'transport', value: t.kind },
  ];
  if (t.command) f.push({ label: 'command', value: [t.command, ...(t.args ?? [])].join(' ') });
  if (t.url) f.push({ label: 'url', value: t.url });
  // PRIVACY: names only — the records never carry env/header values.
  if (t.envKeys?.length) f.push({ label: 'env', value: t.envKeys.join(', '), dim: true });
  if (t.headerKeys?.length) f.push({ label: 'headers', value: t.headerKeys.join(', '), dim: true });
  if (t.timeoutMs !== undefined) f.push({ label: 'timeout', value: `${t.timeoutMs}ms`, dim: true });
  f.push({ label: 'scope', value: m.scope });
  return f;
}

/** Labelled detail fields for a cursored row. `[]` for synthetic group headers (no record). */
export function detailFields(row: ItemRow): DetailField[] {
  if (!row.record) return [];
  switch (row.kind) {
    case 'skill':
      return skillFields(row.record as SkillRecord);
    case 'plugin':
      return pluginFields(row.record as PluginRecord);
    case 'mcp':
      return mcpFields(row.record as McpRecord);
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run test/detail.test.ts && npm run typecheck`
Expected: all detail tests PASS; `tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/detail.ts test/detail.test.ts
git commit -m "Add pure detailFields helper (F3)"
```

---

## Task 3: Pure `grouping.ts` (plugin-grouped folder rows) + unit tests

**Files:**
- Create: `src/render/ink/grouping.ts`
- Test: `test/grouping.test.ts`

**Interfaces:**
- Consumes: `Bucket`/`emptyBucket` from `../../types.js`; `mergeBuckets` from `../../resolve.js`; `itemRows`/`ItemRow` from `./rows.js`.
- Produces: `function groupedRows(projectScoped: Bucket, local: Bucket, expanded: Set<string>): ItemRow[]` — skills with `bundledInPlugin` collapse under a synthetic header row (`kind: 'plugin'`, `expandState`, `used` = child count, no `record`); expanded groups reveal children at `depth: 1`. Standalone skills, the buckets' own plugins, and mcp follow as leaf rows.

- [ ] **Step 1: Write the failing test**

Create `test/grouping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupedRows } from '../src/render/ink/grouping.js';
import type { Bucket, SkillRecord } from '../src/types.js';
import { emptyBucket } from '../src/types.js';

function skill(name: string, opts: { plugin?: string; contentId?: string } = {}): SkillRecord {
  return {
    name,
    contentId: opts.contentId ?? name,
    provider: { kind: 'shared-store', source: 'o/r', path: `/x/${name}` },
    usedBy: ['cc'],
    enabled: true,
    scope: 'project-scoped',
    bundledInPlugin: opts.plugin,
  };
}

function bucket(skills: SkillRecord[]): Bucket {
  return { ...emptyBucket(), skills };
}

describe('groupedRows', () => {
  it('collapses bundled skills under a header and hides children when not expanded', () => {
    const ps = bucket([skill('animejs', { plugin: 'gsap' }), skill('three', { plugin: 'gsap' }), skill('solo')]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows.map((r) => r.name)).toEqual(['gsap', 'solo']);
    expect(rows[0]).toMatchObject({ kind: 'plugin', name: 'gsap', used: 2, expandState: 'collapsed' });
    expect(rows[0]!.record).toBeUndefined();
  });

  it('reveals children at depth 1 when the group is expanded', () => {
    const ps = bucket([skill('animejs', { plugin: 'gsap' }), skill('three', { plugin: 'gsap' }), skill('solo')]);
    const rows = groupedRows(ps, emptyBucket(), new Set(['gsap']));
    expect(rows.map((r) => r.name)).toEqual(['gsap', 'animejs', 'three', 'solo']);
    expect(rows[0]).toMatchObject({ expandState: 'expanded' });
    expect(rows[1]).toMatchObject({ name: 'animejs', depth: 1 });
    expect(rows[2]).toMatchObject({ name: 'three', depth: 1 });
    expect(rows[1]!.record).toBeDefined();
    expect(rows[3]!.depth).toBeUndefined(); // standalone leaf, not indented
  });

  it('sorts group headers by plugin name', () => {
    const ps = bucket([skill('a', { plugin: 'zeta' }), skill('b', { plugin: 'alpha' })]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'zeta']);
  });

  it('still groups a skill whose plugin has no matching plugin record', () => {
    const ps = bucket([skill('orphan', { plugin: 'ghost' })]);
    const rows = groupedRows(ps, emptyBucket(), new Set());
    expect(rows[0]).toMatchObject({ name: 'ghost', used: 1, expandState: 'collapsed' });
  });

  it('merges project-scoped and local layers', () => {
    const rows = groupedRows(bucket([skill('a')]), bucket([skill('b')]), new Set());
    expect(rows.map((r) => r.name).sort()).toEqual(['a', 'b']);
  });

  it('returns [] for empty buckets', () => {
    expect(groupedRows(emptyBucket(), emptyBucket(), new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/grouping.test.ts`
Expected: FAIL — cannot resolve `../src/render/ink/grouping.js`.

- [ ] **Step 3: Write `grouping.ts`**

Create `src/render/ink/grouping.ts`:

```ts
import type { Bucket, SkillRecord } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { mergeBuckets } from '../../resolve.js';
import { itemRows, type ItemRow } from './rows.js';

/**
 * Build the navigable item list for the Folders column from a folder's
 * project-scoped ∪ local layers. Skills that declare `bundledInPlugin` collapse
 * under a synthetic plugin-group header (`kind: 'plugin'`, `expandState`, `used`
 * carrying the child count, no `record`). Expanded groups reveal their children
 * at `depth: 1`. Standalone skills, the buckets' own plugins, and mcp are leaves.
 */
export function groupedRows(projectScoped: Bucket, local: Bucket, expanded: Set<string>): ItemRow[] {
  const merged = mergeBuckets(projectScoped, local);

  const groups = new Map<string, SkillRecord[]>();
  const standalone: SkillRecord[] = [];
  for (const s of merged.skills) {
    if (s.bundledInPlugin) {
      const arr = groups.get(s.bundledInPlugin);
      if (arr) arr.push(s);
      else groups.set(s.bundledInPlugin, [s]);
    } else {
      standalone.push(s);
    }
  }

  const out: ItemRow[] = [];
  for (const plugin of [...groups.keys()].sort()) {
    const children = groups.get(plugin)!;
    const open = expanded.has(plugin);
    out.push({
      kind: 'plugin',
      name: plugin,
      used: children.length,
      source: null,
      sourceDim: false,
      expandState: open ? 'expanded' : 'collapsed',
    });
    if (open) {
      out.push(...itemRows({ ...emptyBucket(), skills: children }).map((r) => ({ ...r, depth: 1 })));
    }
  }
  out.push(...itemRows({ ...emptyBucket(), skills: standalone }));
  out.push(...itemRows({ ...emptyBucket(), plugins: merged.plugins, mcp: merged.mcp }));
  return out;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run test/grouping.test.ts && npm run typecheck`
Expected: all 6 grouping tests PASS; `tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/grouping.ts test/grouping.test.ts
git commit -m "Add pure groupedRows helper for plugin grouping (C1/F2)"
```

---

## Task 4: Pure `folderNav.ts` (focus-state reducer) + unit tests

**Files:**
- Create: `src/render/ink/folderNav.ts`
- Test: `test/folderNav.test.ts`

**Interfaces:**
- Consumes: `ItemRow` from `./rows.js`.
- Produces:
  - `type Focus = 'folders' | 'items' | 'detail'`
  - `type NavAction = 'up' | 'down' | 'enter' | 'right' | 'left' | 'escape'`
  - `interface NavState { focus: Focus; folder: number; item: number; expanded: Set<string>; detailItem: number | null }`
  - `interface NavContext { folderCount: number; folderHasItems: boolean; rows: ItemRow[] }`
  - `function initialNav(): NavState`
  - `function folderNav(state: NavState, action: NavAction, ctx: NavContext): NavState`

- [ ] **Step 1: Write the failing test**

Create `test/folderNav.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { folderNav, initialNav, type NavContext, type NavState } from '../src/render/ink/folderNav.js';
import type { ItemRow } from '../src/render/ink/rows.js';

function leaf(name: string): ItemRow {
  // `folderNav` never reads `record`; omit it (the field is optional).
  return { kind: 'skill', name, used: 1, source: 'o/r', sourceDim: false };
}
function header(name: string, open: boolean): ItemRow {
  return { kind: 'plugin', name, used: 2, source: null, sourceDim: false, expandState: open ? 'expanded' : 'collapsed' };
}
function child(name: string): ItemRow {
  return { ...leaf(name), depth: 1 };
}

const ctxOf = (rows: ItemRow[], over: Partial<NavContext> = {}): NavContext => ({
  folderCount: 3,
  folderHasItems: rows.length > 0,
  rows,
  ...over,
});

describe('folderNav — folders focus', () => {
  it('moves the folder cursor and clamps', () => {
    const ctx = ctxOf([]);
    let s = initialNav();
    s = folderNav(s, 'down', ctx);
    expect(s.folder).toBe(1);
    s = folderNav({ ...s, folder: 2 }, 'down', ctx);
    expect(s.folder).toBe(2); // clamped at folderCount-1
    expect(folderNav(initialNav(), 'up', ctx).folder).toBe(0);
  });

  it('Enter moves into items only when the folder has items', () => {
    const rows = [leaf('a')];
    const into = folderNav(initialNav(), 'enter', ctxOf(rows));
    expect(into).toMatchObject({ focus: 'items', item: 0 });
    const stay = folderNav(initialNav(), 'enter', ctxOf([], { folderHasItems: false }));
    expect(stay.focus).toBe('folders');
  });

  it('left and escape are no-ops at the folder column', () => {
    expect(folderNav(initialNav(), 'left', ctxOf([])).focus).toBe('folders');
    expect(folderNav(initialNav(), 'escape', ctxOf([])).focus).toBe('folders');
  });
});

describe('folderNav — items focus', () => {
  const items = (rows: ItemRow[], item = 0): NavState => ({ focus: 'items', folder: 0, item, expanded: new Set(), detailItem: null });

  it('Enter on a collapsed header expands it; on an expanded header collapses it', () => {
    const rows = [header('gsap', false)];
    const opened = folderNav(items(rows), 'enter', ctxOf(rows));
    expect(opened.expanded.has('gsap')).toBe(true);
    const rows2 = [header('gsap', true)];
    const closed = folderNav({ ...items(rows2), expanded: new Set(['gsap']) }, 'enter', ctxOf(rows2));
    expect(closed.expanded.has('gsap')).toBe(false);
  });

  it('Enter on a leaf opens its detail', () => {
    const rows = [leaf('a')];
    const s = folderNav(items(rows), 'enter', ctxOf(rows));
    expect(s).toMatchObject({ focus: 'detail', detailItem: 0 });
  });

  it('Right expands a collapsed header, opens a leaf, no-ops an expanded header', () => {
    const collapsed = [header('g', false)];
    expect(folderNav(items(collapsed), 'right', ctxOf(collapsed)).expanded.has('g')).toBe(true);
    const leafRows = [leaf('a')];
    expect(folderNav(items(leafRows), 'right', ctxOf(leafRows)).focus).toBe('detail');
    const expanded = [header('g', true)];
    const s = folderNav({ ...items(expanded), expanded: new Set(['g']) }, 'right', ctxOf(expanded));
    expect(s.focus).toBe('items');
    expect(s.expanded.has('g')).toBe(true);
  });

  it('Left collapses an expanded header in place', () => {
    const rows = [header('g', true)];
    const s = folderNav({ ...items(rows), expanded: new Set(['g']) }, 'left', ctxOf(rows));
    expect(s.expanded.has('g')).toBe(false);
    expect(s.focus).toBe('items');
  });

  it('Left on a child collapses its parent and moves selection to the header', () => {
    const rows = [header('g', true), child('a'), child('b')];
    const s = folderNav({ ...items(rows, 2), expanded: new Set(['g']) }, 'left', ctxOf(rows));
    expect(s.expanded.has('g')).toBe(false);
    expect(s.item).toBe(0);
    expect(s.focus).toBe('items');
  });

  it('Left on a standalone leaf with nothing expanded returns to folders', () => {
    const rows = [leaf('a')];
    expect(folderNav(items(rows), 'left', ctxOf(rows)).focus).toBe('folders');
  });

  it('Escape returns to folders; Down/Up clamp within the row list', () => {
    const rows = [leaf('a'), leaf('b')];
    expect(folderNav(items(rows), 'escape', ctxOf(rows)).focus).toBe('folders');
    expect(folderNav(items(rows, 1), 'down', ctxOf(rows)).item).toBe(1); // clamped
    expect(folderNav(items(rows, 0), 'up', ctxOf(rows)).item).toBe(0);
  });
});

describe('folderNav — detail focus', () => {
  const detail: NavState = { focus: 'detail', folder: 0, item: 1, expanded: new Set(), detailItem: 1 };

  it('Escape and Left return to items and clear the detail target', () => {
    expect(folderNav(detail, 'escape', ctxOf([leaf('a'), leaf('b')]))).toMatchObject({ focus: 'items', detailItem: null });
    expect(folderNav(detail, 'left', ctxOf([leaf('a'), leaf('b')]))).toMatchObject({ focus: 'items', detailItem: null });
  });

  it('Up/Down are no-ops in detail', () => {
    expect(folderNav(detail, 'down', ctxOf([])).focus).toBe('detail');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/folderNav.test.ts`
Expected: FAIL — cannot resolve `../src/render/ink/folderNav.js`.

- [ ] **Step 3: Write `folderNav.ts`**

Create `src/render/ink/folderNav.ts`:

```ts
import type { ItemRow } from './rows.js';

export type Focus = 'folders' | 'items' | 'detail';
export type NavAction = 'up' | 'down' | 'enter' | 'right' | 'left' | 'escape';

export interface NavState {
  focus: Focus;
  folder: number;
  item: number;
  expanded: Set<string>;
  detailItem: number | null;
}

export interface NavContext {
  folderCount: number;
  folderHasItems: boolean;
  rows: ItemRow[];
}

export function initialNav(): NavState {
  return { focus: 'folders', folder: 0, item: 0, expanded: new Set(), detailItem: null };
}

function clamp(i: number, len: number): number {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(i, len - 1));
}

function withExpanded(state: NavState, name: string, on: boolean): NavState {
  const expanded = new Set(state.expanded);
  if (on) expanded.add(name);
  else expanded.delete(name);
  return { ...state, expanded };
}

/** Nearest preceding row that is a group header; falls back to the index itself. */
function parentHeaderIndex(rows: ItemRow[], from: number): number {
  for (let i = from; i >= 0; i--) {
    if (rows[i]?.expandState !== undefined) return i;
  }
  return from;
}

export function folderNav(state: NavState, action: NavAction, ctx: NavContext): NavState {
  if (state.focus === 'folders') {
    switch (action) {
      case 'down':
        return { ...state, folder: clamp(state.folder + 1, ctx.folderCount) };
      case 'up':
        return { ...state, folder: clamp(state.folder - 1, ctx.folderCount) };
      case 'enter':
      case 'right':
        return ctx.folderHasItems ? { ...state, focus: 'items', item: 0 } : state;
      default:
        return state;
    }
  }

  if (state.focus === 'items') {
    const row = ctx.rows[state.item];
    switch (action) {
      case 'down':
        return { ...state, item: clamp(state.item + 1, ctx.rows.length) };
      case 'up':
        return { ...state, item: clamp(state.item - 1, ctx.rows.length) };
      case 'enter': {
        if (!row) return state;
        if (row.expandState !== undefined) return withExpanded(state, row.name, !state.expanded.has(row.name));
        return { ...state, focus: 'detail', detailItem: state.item };
      }
      case 'right': {
        if (!row) return state;
        if (row.expandState === 'collapsed') return withExpanded(state, row.name, true);
        if (row.expandState === 'expanded') return state;
        return { ...state, focus: 'detail', detailItem: state.item };
      }
      case 'left': {
        if (row?.expandState === 'expanded') return withExpanded(state, row.name, false);
        if (row?.depth === 1) {
          const pi = parentHeaderIndex(ctx.rows, state.item);
          const parent = ctx.rows[pi];
          if (parent) return { ...withExpanded(state, parent.name, false), item: pi };
        }
        return { ...state, focus: 'folders' };
      }
      case 'escape':
        return { ...state, focus: 'folders' };
    }
  }

  // focus === 'detail'
  switch (action) {
    case 'escape':
    case 'left':
      return { ...state, focus: 'items', detailItem: null };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run test/folderNav.test.ts && npm run typecheck`
Expected: all folderNav tests PASS; `tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/folderNav.ts test/folderNav.test.ts
git commit -m "Add pure folderNav focus-state reducer (F1)"
```

---

## Task 5: `ItemTable` — `▸/▾` marker + indent for grouped rows

**Files:**
- Modify: `src/render/ink/ItemTable.tsx`

**Interfaces:**
- Unchanged public signature: `ItemTable({ rows, showKind?, selectedIndex? })`. New behaviour is driven entirely by `row.expandState` / `row.depth`, which flat callers never set — so Global / Leaderboard / any flat caller render identically.

**Goal:** a row with `expandState` renders as `▸/▾ <name> (<used>)` with blank `USED`/`SOURCE` cells; a row with `depth === 1` is indented two spaces. Everything else is byte-for-byte as today.

- [ ] **Step 1: Rewrite the `Row` component in `ItemTable.tsx`**

Replace the `Row` function in `src/render/ink/ItemTable.tsx` with:

```tsx
function Row({
  row,
  showKind,
  withCursor,
  active,
}: {
  row: ItemRow;
  showKind: boolean;
  withCursor: boolean;
  active: boolean;
}) {
  const isGroup = row.expandState !== undefined;
  const marker = row.expandState === 'expanded' ? '▾' : row.expandState === 'collapsed' ? '▸' : '';
  const label = isGroup ? `${marker} ${row.name} (${row.used})` : row.depth ? `  ${row.name}` : row.name;
  const used = isGroup ? '' : row.used === null ? '—' : row.used === 0 ? '·' : String(row.used);
  const usedDim = row.used === null || row.used === 0;
  const source = isGroup ? '' : row.source ?? '';
  return (
    <Box>
      {withCursor ? (
        <Box width={CURSOR_W}>
          <Text color="cyan" bold>
            {active ? '›' : ' '}
          </Text>
        </Box>
      ) : null}
      {showKind ? (
        <Box width={KIND_W} marginRight={1}>
          <Text dimColor>{row.kind}</Text>
        </Box>
      ) : null}
      <Box flexGrow={1} marginRight={1}>
        <Text wrap="truncate-end" inverse={active} bold={active || isGroup}>
          {label}
        </Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor={usedDim}>{used}</Text>
      </Box>
      <Box width={SOURCE_W}>
        <Text wrap="truncate-end" dimColor={row.sourceDim}>
          {source}
        </Text>
      </Box>
    </Box>
  );
}
```

(`CURSOR_W`/`KIND_W`/`USED_W`/`SOURCE_W`, `HeaderRow`, and the exported `ItemTable` are unchanged.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Run the full suite (no regressions)**

Run: `npm test`
Expected: PASS, unchanged count. No test asserts `ItemTable`'s output; for a flat row (`expandState`/`depth` unset) `label === row.name`, `used`/`source` compute exactly as before, and `bold={active || false}` equals the old `bold={active}`.

- [ ] **Step 4: Commit**

```bash
git add src/render/ink/ItemTable.tsx
git commit -m "Render ▸/▾ marker + indent for grouped rows in ItemTable (F2)"
```

---

## Task 6: `DetailView` — shared detail renderer

**Files:**
- Create: `src/render/ink/DetailView.tsx`

**Interfaces:**
- Consumes: `ItemRow` from `./rows.js`; `detailFields` from `./detail.js`.
- Produces: `function DetailView({ row }: { row: ItemRow | undefined }): JSX.Element` — a title (the item name) + aligned `label  value` lines; `value`s wrap/truncate to the pane width.

- [ ] **Step 1: Create `DetailView.tsx`**

Create `src/render/ink/DetailView.tsx`:

```tsx
import { Box, Text } from 'ink';
import type { ItemRow } from './rows.js';
import { detailFields } from './detail.js';

export function DetailView({ row }: { row: ItemRow | undefined }) {
  if (!row) {
    return (
      <Box flexGrow={1}>
        <Text dimColor>nothing selected</Text>
      </Box>
    );
  }
  const fields = detailFields(row);
  const labelW = Math.max(4, ...fields.map((f) => f.label.length));
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold underline>
        {row.name}
      </Text>
      {fields.map((f, i) => (
        <Box key={i}>
          <Box width={labelW + 2}>
            <Text dimColor>{f.label}</Text>
          </Box>
          <Box flexGrow={1}>
            <Text wrap="truncate-end" dimColor={f.dim}>
              {f.value}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS, unchanged count (`DetailView` is a thin component, covered by the pure `detailFields` tests; not yet mounted anywhere).

- [ ] **Step 4: Commit**

```bash
git add src/render/ink/DetailView.tsx
git commit -m "Add shared DetailView component (F3)"
```

---

## Task 7: Move footers into the views; drop the global `Esc`

**Files:**
- Modify: `src/render/ink/App.tsx`
- Modify: `src/render/ink/GlobalView.tsx`
- Modify: `src/render/ink/LeaderboardView.tsx`

**Goal:** `App` stops rendering a per-tab footer and stops binding `Esc` (so each view can own `Esc` as contextual back). Each view renders its own footer line. `FoldersView`'s footer arrives with its drill in Task 8; `GlobalView`/`LeaderboardView` get static footers now. No drill behaviour yet — the only user-visible change is that `Esc` no longer jumps to the Folders tab (`1` still does).

- [ ] **Step 1: Edit `App.tsx`** — remove the `FOOTER` map, the `Esc` handler, and the footer line

In `src/render/ink/App.tsx`:

Delete the `FOOTER` constant:

```tsx
const FOOTER: Record<TabId, string> = {
  folders: '↑/↓ navigate · 1/2/3 or Tab switch · q quit',
  global: '↑/↓ scroll · 1/2/3 or Tab switch · Esc folders · q quit',
  leaderboard: '↑/↓ scroll · 1/2/3 or Tab switch · Esc folders · q quit',
};
```

Remove the `Esc` branch from the global `useInput` (delete these lines):

```tsx
    if (key.escape) {
      setTab('folders');
      return;
    }
```

Remove the footer line from the returned JSX (delete this line):

```tsx
      <Text dimColor>{FOOTER[tab]}</Text>
```

`Text` was used **only** by that footer line, so also drop it from the `ink` import — change `import { Box, Text, useApp, useInput } from 'ink';` to `import { Box, useApp, useInput } from 'ink';` (an unused import fails `tsc`). The `useInput` keeps `q`, `1`/`2`/`3`, and `Tab`/`Shift+Tab` (so `key` is still used).

- [ ] **Step 2: Add a footer to `GlobalView.tsx`**

In `src/render/ink/GlobalView.tsx`, add a footer line as the last child of the outer `<Box flexDirection="column">`, immediately after the position-line block:

```tsx
      <Text dimColor>↑/↓ scroll · 1/2/3 or Tab switch · q quit</Text>
```

- [ ] **Step 3: Add a footer to `LeaderboardView.tsx`**

In `src/render/ink/LeaderboardView.tsx`, add a footer line as the last child of the outer `<Box flexDirection="column">`, after `<StatsBand stats={stats} />`:

```tsx
      <Text dimColor>↑/↓ scroll · 1/2/3 or Tab switch · q quit</Text>
```

- [ ] **Step 4: Add a temporary footer to `FoldersView.tsx`**

So the Folders tab is not footer-less between tasks, in `src/render/ink/FoldersView.tsx` add as the last child of the outer `<Box flexDirection="column">` (after the inner `<Box>` holding `FolderList`/`DetailPane`):

```tsx
      <Text dimColor>↑/↓ navigate · 1/2/3 or Tab switch · q quit</Text>
```

Add `Text` to the existing `ink` import in `FoldersView.tsx`:

```tsx
import { Box, Text, useInput } from 'ink';
```

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: both green; test count unchanged.

- [ ] **Step 6: Manual visual smoke**

Run: `npm run dev`. Each tab shows its own footer; `1/2/3` and `Tab`/`Shift+Tab` switch tabs; `Esc` no longer changes tabs; `q` quits.

- [ ] **Step 7: Commit**

```bash
git add src/render/ink/App.tsx src/render/ink/GlobalView.tsx src/render/ink/LeaderboardView.tsx src/render/ink/FoldersView.tsx
git commit -m "Move footers into views; drop global Esc binding (F prep)"
```

---

## Task 8: `FoldersView` drill — focus model, grouping, detail swap

**Files:**
- Modify: `src/render/ink/FolderList.tsx` (add `dimmed` prop)
- Modify: `src/render/ink/FoldersView.tsx` (full rewrite)
- Remove: `src/render/ink/DetailPane.tsx`

**Interfaces:**
- `FolderList` gains an optional `dimmed?: boolean` prop — when true, every row renders dim and the active row drops its `inverse` highlight.
- Consumes: `groupedRows` (`./grouping.js`); `folderNav`/`initialNav`/`NavAction`/`NavContext` (`./folderNav.js`); `scrollWindow`/`clampIndex` (`./scroll.js`); `DetailView` (`./DetailView.js`); `ItemTable` (`./ItemTable.js`); `useWindowSize` (`ink`).

- [ ] **Step 1: Add the `dimmed` prop to `FolderList.tsx`**

Replace the body of the `FolderList` map's returned `<Text>` in `src/render/ink/FolderList.tsx`. Change the signature and the active/dim logic:

```tsx
export function FolderList({
  folders,
  selected,
  dimmed = false,
}: {
  folders: FolderReport[];
  selected: number;
  dimmed?: boolean;
}) {
  return (
    <Box flexDirection="column" width={42} marginRight={1}>
      {folders.length === 0 ? <Text dimColor>no folders discovered</Text> : null}
      {folders.map((f, i) => {
        const name = f.path.split('/').pop() || f.path;
        const d = delta(f);
        const active = i === selected;
        const globalOnly = d === 0;
        return (
          <Text
            key={f.path}
            inverse={active && !dimmed}
            dimColor={dimmed || (globalOnly && !active)}
            wrap="truncate-end"
          >
            {active ? '› ' : '  '}
            {name}
            {d > 0 ? <Text color="cyan"> +{d}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 2: Rewrite `FoldersView.tsx`**

Replace the entire contents of `src/render/ink/FoldersView.tsx` with:

```tsx
import { useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { GlobalBand } from './GlobalBand.js';
import { FolderList } from './FolderList.js';
import { ItemTable } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { groupedRows } from './grouping.js';
import { clampIndex, scrollWindow } from './scroll.js';
import { folderNav, initialNav, type NavAction } from './folderNav.js';

// Header + tab bar + global band + position line + footer + margins (heuristic).
const CHROME = 11;

const FOOTER: Record<string, string> = {
  folders: '↑/↓ navigate · Enter open folder · 1/2/3 or Tab switch · q quit',
  items: '↑/↓ move · → expand/open · ← back · Enter open · Esc folders · q quit',
  detail: 'Esc/← back · 1/2/3 or Tab switch · q quit',
};

function toAction(input: string, key: { upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean; return: boolean; escape: boolean }): NavAction | null {
  if (key.downArrow || input === 'j') return 'down';
  if (key.upArrow || input === 'k') return 'up';
  if (key.return) return 'enter';
  if (key.rightArrow) return 'right';
  if (key.leftArrow) return 'left';
  if (key.escape) return 'escape';
  return null;
}

export function FoldersView({ inv }: { inv: Inventory }) {
  const folders = inv.folders;
  const [nav, setNav] = useState(initialNav);

  const folderIdx = clampIndex(nav.folder, folders.length);
  const folder = folders[folderIdx];
  const rows = folder ? groupedRows(folder.projectScoped, folder.local, nav.expanded) : [];

  const height = Math.max(3, useWindowSize().rows - CHROME);
  const itemIdx = clampIndex(nav.item, rows.length);
  const { start, end } = scrollWindow(rows.length, height, itemIdx);

  useInput((input, key) => {
    const action = toAction(input, key);
    if (!action) return;
    setNav((s) => folderNav(s, action, { folderCount: folders.length, folderHasItems: rows.length > 0, rows }));
  });

  const detailRow = nav.focus === 'detail' && nav.detailItem !== null ? rows[clampIndex(nav.detailItem, rows.length)] : undefined;

  return (
    <Box flexDirection="column">
      <GlobalBand inv={inv} />
      <Box>
        <FolderList folders={folders} selected={folderIdx} dimmed={nav.focus !== 'folders'} />
        {nav.focus === 'detail' ? (
          <DetailView row={detailRow} />
        ) : (
          <Box flexDirection="column" flexGrow={1}>
            {!folder ? (
              <Text dimColor>select a folder</Text>
            ) : rows.length === 0 ? (
              <Text dimColor>global only — adds nothing beyond the inherited layer</Text>
            ) : (
              <>
                <ItemTable rows={rows.slice(start, end)} selectedIndex={nav.focus === 'items' ? itemIdx - start : undefined} />
                {rows.length > height ? (
                  <Text dimColor>
                    {start + 1}–{end} of {rows.length}
                  </Text>
                ) : null}
              </>
            )}
          </Box>
        )}
      </Box>
      <Text dimColor>{FOOTER[nav.focus]}</Text>
    </Box>
  );
}
```

- [ ] **Step 3: Remove `DetailPane.tsx`**

Confirm nothing else imports it, then delete it:

Run: `grep -rn "DetailPane" src`
Expected: the only hits are inside `src/render/ink/DetailPane.tsx` itself (its own `export function DetailPane` / type). No **other** file references it after the Step 2 rewrite — so it is safe to remove. Then:

```bash
git rm src/render/ink/DetailPane.tsx
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. (If `tsc` reports `DetailPane` is still imported anywhere, fix that import before continuing.)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, unchanged count. (No test imports `DetailPane`; the logic lives in the now-tested `grouping`/`folderNav` modules.)

- [ ] **Step 6: Manual visual smoke**

Run: `npm run dev` on the Folders tab:
- `↑/↓`/`j`/`k` move folders; the detail/items column previews the selected folder's grouped items (no cursor; folder list bright).
- `Enter` (or `→`) on a folder with items moves focus into the items column (folder list dims, a `›` cursor appears); a global-only folder is a no-op.
- In items: `↑/↓` move; `→` on a `▸ plugin (N)` header expands it (children indented, `▾`); `←` collapses it; `←` on a child collapses its parent; `Enter`/`→` on a skill swaps the column to its detail (name + `used by`/`source`/`url`/`scope`/`about` …).
- In detail: `Esc`/`←` returns to the items list. `Esc` from items returns to folders.
- `q` quits.

- [ ] **Step 7: Commit**

```bash
git add src/render/ink/FolderList.tsx src/render/ink/FoldersView.tsx
git commit -m "Add Folders drill: focus model, plugin grouping, detail swap (F1/F2/F3)"
```

---

## Task 9: Global & Leaderboard — `list ⇄ detail`

**Files:**
- Modify: `src/render/ink/GlobalView.tsx`
- Modify: `src/render/ink/LeaderboardView.tsx`

**Interfaces:**
- Both gain `Enter` on the cursored row → render `DetailView` for that row; `Esc`/`←` → back to the list. Footers become mode-aware.
- Consumes: `DetailView` from `./DetailView.js`.

- [ ] **Step 1: Add detail mode to `GlobalView.tsx`**

Replace the entire contents of `src/render/ink/GlobalView.tsx` with:

```tsx
import { useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { itemRows } from './rows.js';
import { ItemTable } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { useScroll } from './scroll.js';

// Header + tab bar + view title + position line + footer + margins.
const CHROME = 8;

export function GlobalView({ inv }: { inv: Inventory }) {
  const rows = itemRows(inv.global);
  const height = Math.max(3, useWindowSize().rows - CHROME);
  const { selected, start, end, moveUp, moveDown } = useScroll(rows.length, height);
  const [detail, setDetail] = useState(false);

  useInput((input, key) => {
    if (detail) {
      if (key.escape || key.leftArrow) setDetail(false);
      return;
    }
    if (key.downArrow || input === 'j') moveDown();
    if (key.upArrow || input === 'k') moveUp();
    if (key.return || key.rightArrow) setDetail(true);
  });

  if (detail) {
    return (
      <Box flexDirection="column">
        <DetailView row={rows[selected]} />
        <Text dimColor>Esc/← back · 1/2/3 or Tab switch · q quit</Text>
      </Box>
    );
  }

  const shown = rows.slice(start, end);

  return (
    <Box flexDirection="column">
      <Text bold>
        global <Text dimColor>({rows.length}) — inherited everywhere</Text>
      </Text>
      {rows.length === 0 ? (
        <Text dimColor>no global items</Text>
      ) : (
        <ItemTable rows={shown} selectedIndex={selected - start} />
      )}
      {rows.length > height ? (
        <Text dimColor>
          {start + 1}–{end} of {rows.length}
        </Text>
      ) : null}
      <Text dimColor>↑/↓ scroll · Enter detail · 1/2/3 or Tab switch · q quit</Text>
    </Box>
  );
}
```

- [ ] **Step 2: Add detail mode to `LeaderboardView.tsx`**

Replace the entire contents of `src/render/ink/LeaderboardView.tsx` with:

```tsx
import { useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { ItemTable } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { leaderboard, summaryStats, type SummaryStats } from './stats.js';
import { useScroll } from './scroll.js';

// Header + tab bar + view title + position line + stats band (~5 lines) + footer.
const CHROME = 12;

function StatsBand({ stats }: { stats: SummaryStats }) {
  const runtimes = stats.perRuntime.map((r) => `${r.runtime} ${r.skills}`).join(' · ') || 'none';
  const providers = stats.perProvider.map((p) => `${p.kind} ${p.skills}`).join(' · ') || 'none';
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text>
        <Text bold>STATS</Text> {stats.totals.skills} skills · {stats.totals.plugins} plugins ·{' '}
        {stats.totals.mcp} mcp
      </Text>
      <Text dimColor>by runtime {runtimes}</Text>
      <Text dimColor>by source {providers}</Text>
    </Box>
  );
}

export function LeaderboardView({ inv }: { inv: Inventory }) {
  const rows = leaderboard(inv);
  const stats = summaryStats(inv);
  const height = Math.max(3, useWindowSize().rows - CHROME);
  const { selected, start, end, moveUp, moveDown } = useScroll(rows.length, height);
  const [detail, setDetail] = useState(false);

  useInput((input, key) => {
    if (detail) {
      if (key.escape || key.leftArrow) setDetail(false);
      return;
    }
    if (key.downArrow || input === 'j') moveDown();
    if (key.upArrow || input === 'k') moveUp();
    if (key.return || key.rightArrow) setDetail(true);
  });

  if (detail) {
    return (
      <Box flexDirection="column">
        <DetailView row={rows[selected]} />
        <Text dimColor>Esc/← back · 1/2/3 or Tab switch · q quit</Text>
      </Box>
    );
  }

  const shown = rows.slice(start, end);

  return (
    <Box flexDirection="column">
      <Text bold>
        leaderboard <Text dimColor>({rows.length}) — skills by runtime reach</Text>
      </Text>
      {rows.length === 0 ? (
        <Text dimColor>no skills</Text>
      ) : (
        <ItemTable rows={shown} showKind={false} selectedIndex={selected - start} />
      )}
      {rows.length > height ? (
        <Text dimColor>
          {start + 1}–{end} of {rows.length}
        </Text>
      ) : null}
      <StatsBand stats={stats} />
      <Text dimColor>↑/↓ scroll · Enter detail · 1/2/3 or Tab switch · q quit</Text>
    </Box>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, unchanged count.

- [ ] **Step 5: Manual visual smoke**

Run: `npm run dev`:
- Tab `2` (Global): `↑/↓` scroll; `Enter` (or `→`) on a row opens its detail (skill / plugin / mcp fields); `Esc`/`←` returns to the list.
- Tab `3` (Leaderboard): same — `Enter` on a ranked skill opens its detail; `Esc`/`←` back; the STATS band shows on the list view.
- `q` quits.

- [ ] **Step 6: Commit**

```bash
git add src/render/ink/GlobalView.tsx src/render/ink/LeaderboardView.tsx
git commit -m "Add list⇄detail on Global and Leaderboard tabs (F3)"
```

---

## Self-Review

**Spec coverage:**
- F1 column focus (folders→items, dim inactive column, Enter/Esc/←) → Task 4 (`folderNav`) + Task 8 (`FoldersView`, `FolderList.dimmed`). ✓
- F2 expand/collapse plugin groups (`→`/`←`, `←`-collapse-then-back) → Task 3 (`groupedRows`) + Task 4 (`folderNav` left/right) + Task 5 (`ItemTable` marker). ✓
- C1 group plugin-bundled skills under their plugin → Task 3 (`groupedRows` groups by `bundledInPlugin`). ✓
- F3 skill detail view, replace-the-items-pane → Task 2 (`detailFields`) + Task 6 (`DetailView`) + Task 8 (col-2 swap). ✓
- Detail on all three tabs → Task 8 (Folders) + Task 9 (Global/Leaderboard). ✓
- `Esc` becomes contextual back; global `Esc` + `FOOTER` removed → Task 7 (App) + Tasks 8–9 (per-view footers). ✓
- `←/→` drive expand/collapse/back → Task 4 + Tasks 8–9. ✓
- `ItemRow` carries the record → Task 1. ✓
- Privacy: env/header names only → Task 2 (`mcpFields`) + `test/detail.test.ts` assertion. ✓
- `DetailPane` removed → Task 8. ✓
- Engine/adapters/resolver/`plain`/`json`/non-TTY untouched; no new deps → Global Constraints; no task edits those files. ✓
- Drill resets on tab switch → inherent (App unmounts inactive views; views hold drill state in `useState`). ✓

**Placeholder scan:** none — every code/command step is concrete. The `CHROME` constants (8/11/12) are commented heuristics; `scrollWindow`/`clampIndex` clamp safely so an off-by-a-few only changes how many rows show, never correctness.

**Type consistency:** `ItemRow` (extended in Task 1: `record?`, `depth?`, `expandState?`) flows unchanged through `detailFields` (Task 2), `groupedRows` (Task 3), `folderNav.NavContext.rows` (Task 4), `ItemTable` (Task 5), `DetailView` (Task 6), and all three views (Tasks 8–9). `DetailField` defined in `detail.ts` (Task 2) is consumed only inside `DetailView` (Task 6). `NavState`/`NavAction`/`NavContext`/`initialNav`/`folderNav` defined in `folderNav.ts` (Task 4) are consumed by `FoldersView` (Task 8). `groupedRows(projectScoped, local, expanded)` signature matches between Task 3 and its Task 8 call. `scrollWindow`/`clampIndex` (existing `scroll.ts`) signatures match the Task 8 calls. `useScroll` returns `{ selected, start, end, moveUp, moveDown }` (existing) as destructured in Tasks 9. Test record builders match `SkillRecord`/`PluginRecord`/`McpRecord` from `src/types.ts`.
