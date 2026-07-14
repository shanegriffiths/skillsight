# Agent Handoff (`skillsight show` + pane handshake) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only `skillsight show <ref>` command returning the complete, fresh, machine-readable record an agent needs to act on an item, plus a detail-pane handshake (dim `agent → skillsight show <id12> --json` hint line and `y`/`Y` clipboard yank).

**Architecture:** Topology data that today dies inside the scan (dedup-merged copy paths, reverse-symlink link paths) is retained: `mergeSkill` accumulates a `copies` list, `buildReverseSymlinkIndex` keeps link paths, and a new `scanFull()` exposes the site index beside the Inventory. A pure `src/show.ts` resolves a name/id-prefix ref against the Inventory and assembles a versioned `ShowRecord` (copies + pure-fs git worktree grouping from new `src/git.ts` + symlink sites + name collisions). The CLI gains a `show` mode with deterministic exit codes; the Ink pane gains the hint line and OSC 52 yank.

**Tech Stack:** Node ≥22 ESM, TypeScript, vitest, Ink 7, tsup. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-14-agent-handoff-show-design.md`

## Global Constraints

- No new runtime dependencies; node builtins only (`Buffer`, `node:fs`, `node:path`, `node:module`).
- **Never spawn the `git` binary.** Worktree detection is pure fs (verified empirically 2026-07-14: worktree `.git` file = `gitdir: <abs>/.git/worktrees/<name>`; `commondir` = `../..`).
- Bulk `--json` / `--report` output must stay **byte-identical**. `test/render-output.test.ts` is the oracle; it must pass **unchanged** in every task.
- Never import `src/cli.ts` in tests (it runs `main()` on import). New parsing goes in `src/cliArgs.ts`; new executable logic goes in importable modules.
- OSC 52 for clipboard (verified: Shane runs tmux 3.7b with `set-clipboard on` + `allow-passthrough all` — tmux forwards OSC 52 natively).
- **This machine:** heredocs hang the shell. Write commit messages to a scratch file with the Write tool and commit with `git commit -F <file>`.
- Verify with `npm test` and `npm run typecheck`. TDD per task: failing test → implement → pass → commit.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `src/git.ts` | Pure-fs worktree linking (`gitLink`) |
| Create `src/show.ts` | Ref resolution + `ShowRecord` assembly + `runShow` executor |
| Create `src/render/show.ts` | Plain-text human panel for `show` on a TTY |
| Create `src/render/ink/clipboard.ts` | OSC 52 escape builder + stdout writer |
| Create `src/render/ink/useYank.ts` | Toast state + copy helper hook |
| Modify `src/symlinks.ts` | Index keeps link paths (`SiteIndex`); add `lookupSites` |
| Modify `src/types.ts` | `SkillCopy`, `SkillRecord.copies?` |
| Modify `src/resolve.ts` | `mergeSkill` accumulates copies; `EnrichContext.reverseIndex: SiteIndex` |
| Modify `src/render/json.ts` | Replacer strips `copies` from bulk JSON |
| Modify `src/index.ts` | `scanFull()` returning `{ inventory, sites }`; `scan()` becomes wrapper |
| Modify `src/cliArgs.ts` | `show <ref>` parsing, `Mode` gains `'show'` |
| Modify `src/cli.ts` | show branch, exit codes, HELP text |
| Modify `src/render/ink/detail.ts` | `agentRef`/`agentCommand` + `agent` field |
| Modify `src/render/ink/App.tsx`, `index.tsx` | `scanFull`, sites state, `yankJson` prop |
| Modify `src/render/ink/RankedView.tsx`, `GlobalView.tsx`, `FoldersView.tsx` | `y`/`Y` keys, footer hints, toast |
| Tests | `test/git.test.ts`, `test/symlinks.test.ts`, `test/show.test.ts`, `test/show-panel.test.ts`, `test/clipboard.test.ts`, additions to `test/resolve.test.ts`, `test/detail.test.ts`, `test/cli.test.ts`, `test/engine.test.ts` |

---

### Task 1: `src/git.ts` — pure-fs worktree linking

**Files:**
- Create: `src/git.ts`
- Test: `test/git.test.ts`

**Interfaces:**
- Produces: `interface GitLink { repoRoot: string; isWorktree: boolean; mainCheckout?: string }` and `function gitLink(start: string): GitLink | null` — consumed by Tasks 5, 6, 9.

- [ ] **Step 1: Write the failing test**

```ts
// test/git.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gitLink } from '../src/git.js';
import { cleanup, makeTempHome, writeFileEnsured } from './helpers.js';

describe('gitLink', () => {
  const homes: string[] = [];
  const home = () => { const h = makeTempHome(); homes.push(h); return h; };
  afterEach(() => { for (const h of homes.splice(0)) cleanup(h); });

  it('finds a normal checkout from a nested dir', () => {
    const h = home();
    mkdirSync(join(h, 'repo', '.git'), { recursive: true });
    mkdirSync(join(h, 'repo', 'a', 'b'), { recursive: true });
    expect(gitLink(join(h, 'repo', 'a', 'b'))).toEqual({
      repoRoot: join(h, 'repo'), isWorktree: false,
    });
  });

  it('identifies a linked worktree via an absolute gitdir', () => {
    const h = home();
    mkdirSync(join(h, 'repo', '.git', 'worktrees', 'wt'), { recursive: true });
    writeFileEnsured(join(h, 'wt', '.git'), `gitdir: ${join(h, 'repo', '.git', 'worktrees', 'wt')}\n`);
    mkdirSync(join(h, 'wt', 'deep'), { recursive: true });
    expect(gitLink(join(h, 'wt', 'deep'))).toEqual({
      repoRoot: join(h, 'wt'), isWorktree: true, mainCheckout: join(h, 'repo'),
    });
  });

  it('identifies a linked worktree via a relative gitdir', () => {
    const h = home();
    mkdirSync(join(h, 'repo', '.git', 'worktrees', 'wt'), { recursive: true });
    writeFileEnsured(join(h, 'wt', '.git'), 'gitdir: ../repo/.git/worktrees/wt\n');
    expect(gitLink(join(h, 'wt'))).toEqual({
      repoRoot: join(h, 'wt'), isWorktree: true, mainCheckout: join(h, 'repo'),
    });
  });

  it('treats a submodule-style gitdir as a plain checkout', () => {
    const h = home();
    writeFileEnsured(join(h, 'sub', '.git'), `gitdir: ${join(h, '.git', 'modules', 'sub')}\n`);
    expect(gitLink(join(h, 'sub'))).toEqual({ repoRoot: join(h, 'sub'), isWorktree: false });
  });

  it('returns null when no .git exists up to the root', () => {
    const h = home();
    mkdirSync(join(h, 'plain'), { recursive: true });
    expect(gitLink(join(h, 'plain'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/git.test.ts`
Expected: FAIL — `Cannot find module '../src/git.js'`

- [ ] **Step 3: Write the implementation**

```ts
// src/git.ts
/**
 * Pure-fs git worktree linking — never spawns the git binary.
 *
 * A `.git` DIRECTORY marks a normal checkout root. A `.git` FILE holds
 * `gitdir: <path>`; when that path ends in `/.git/worktrees/<name>` the
 * checkout is a linked worktree and the segment before `/.git/worktrees/`
 * is the main checkout. (Format verified against git 2.x on disk — see the
 * 2026-07-14 design spec.) Submodule gitdirs (`/.git/modules/…`) are plain
 * checkouts for our purposes.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface GitLink {
  /** Root of the checkout containing the path (the worktree root for worktrees). */
  repoRoot: string;
  isWorktree: boolean;
  /** Main checkout root when this is a linked worktree. */
  mainCheckout?: string;
}

const WORKTREE_GITDIR = /^(.+)\/\.git\/worktrees\/[^/]+\/?$/;

function fromGitFile(gitFile: string, checkoutDir: string): GitLink {
  let target: string | undefined;
  try {
    target = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(gitFile, 'utf8'))?.[1];
  } catch {
    /* unreadable — fall through to plain */
  }
  if (target) {
    const abs = isAbsolute(target) ? target : resolve(checkoutDir, target);
    const m = WORKTREE_GITDIR.exec(abs);
    if (m) return { repoRoot: checkoutDir, isWorktree: true, mainCheckout: m[1]! };
  }
  return { repoRoot: checkoutDir, isWorktree: false };
}

/** Nearest enclosing git checkout of `start`, or null when there is none. */
export function gitLink(start: string): GitLink | null {
  for (let dir = start; ; ) {
    let st;
    try {
      st = statSync(join(dir, '.git'));
    } catch {
      st = undefined;
    }
    if (st?.isDirectory()) return { repoRoot: dir, isWorktree: false };
    if (st?.isFile()) return fromGitFile(join(dir, '.git'), dir);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/git.test.ts`
Expected: PASS (5 tests). Note: `makeTempHome` returns a realpath-unresolved tmpdir on macOS; the tests compare against the same `join(h, …)` values so no realpath is needed.

- [ ] **Step 5: Commit**

`git add src/git.ts test/git.test.ts`, message: `feat: pure-fs git worktree linking (gitLink)`

---

### Task 2: symlink index keeps link paths (`SiteIndex`)

**Files:**
- Modify: `src/symlinks.ts` (index value type, `lookupUsedBy`, new `lookupSites`)
- Modify: `src/resolve.ts:31` (`EnrichContext.reverseIndex` type)
- Test: `test/symlinks.test.ts` (create)

**Interfaces:**
- Produces: `type SiteIndex = Map<string, Map<Runtime, string>>` (realpath → runtime → linkPath), `interface SymlinkSite { runtime: Runtime; linkPath: string }`, `function lookupSites(index: SiteIndex, realPath: string): SymlinkSite[]` — consumed by Tasks 4, 5.
- `lookupUsedBy(index, realPath): Runtime[]` keeps its exact signature and sorted-output behavior.

- [ ] **Step 1: Write the failing test**

```ts
// test/symlinks.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { join } from 'node:path';
import { buildReverseSymlinkIndex, lookupSites, lookupUsedBy, realpathSafe } from '../src/symlinks.js';
import { cleanup, ctxOf, makeTempHome, symlinkInto, writeSkillDir } from './helpers.js';

describe('SiteIndex link paths', () => {
  let home: string;
  afterEach(() => cleanup(home));

  it('records the symlink path per runtime and keeps lookupUsedBy behavior', () => {
    home = makeTempHome();
    const real = writeSkillDir(join(home, '.agents', 'skills'), 'demo');
    const link = join(home, '.claude', 'skills', 'demo');
    symlinkInto(link, real);

    const index = buildReverseSymlinkIndex(ctxOf(home));
    const key = realpathSafe(real);
    expect(lookupUsedBy(index, key)).toContain('claude-code');
    expect(lookupSites(index, key)).toContainEqual({ runtime: 'claude-code', linkPath: link });
    expect(lookupSites(index, '/nowhere')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/symlinks.test.ts`
Expected: FAIL — `lookupSites` is not exported.

- [ ] **Step 3: Implement**

In `src/symlinks.ts`, change the index to carry link paths and adapt lookups:

```ts
/** realpath of content -> runtime id -> the symlink path that references it. */
export type SiteIndex = Map<string, Map<Runtime, string>>;

export interface SymlinkSite {
  runtime: Runtime;
  linkPath: string;
}

export function buildReverseSymlinkIndex(ctx: HomeCtx): SiteIndex {
  const hub = realpathSafe(sharedHubDir(ctx));
  const index: SiteIndex = new Map();

  for (const def of KNOWN_RUNTIMES) {
    const dir = globalSkillsDir(def, ctx);
    // Skip agents whose global skills dir is the hub itself.
    if (realpathSafe(dir) === hub) continue;

    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue; // runtime not present
    }

    for (const name of names) {
      if (name.startsWith('.')) continue;
      const linkPath = join(dir, name);
      const real = realpathSafe(linkPath);
      let sites = index.get(real);
      if (!sites) {
        sites = new Map();
        index.set(real, sites);
      }
      if (!sites.has(def.id)) sites.set(def.id, linkPath);
    }
  }

  return index;
}

/** Runtimes referencing the content at `realPath`, sorted for stable output. */
export function lookupUsedBy(index: SiteIndex, realPath: string): Runtime[] {
  const sites = index.get(realPath);
  return sites ? [...sites.keys()].sort() : [];
}

/** Symlink sites referencing the content at `realPath`, sorted by runtime. */
export function lookupSites(index: SiteIndex, realPath: string): SymlinkSite[] {
  const sites = index.get(realPath);
  if (!sites) return [];
  return [...sites]
    .map(([runtime, linkPath]) => ({ runtime, linkPath }))
    .sort((a, b) => a.runtime.localeCompare(b.runtime));
}
```

In `src/resolve.ts`, update the import and the context type (no logic changes — `lookupUsedBy` calls are signature-compatible):

```ts
import { lookupUsedBy, type SiteIndex } from './symlinks.js';
// …
export interface EnrichContext {
  sharedByRealpath: Map<string, SharedSkill>;
  reverseIndex: SiteIndex;
  usageByKey: Map<string, SkillUsage>;
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — all existing tests (engine, adapters, render-output snapshots) green plus the new one. `npm run typecheck` clean.

- [ ] **Step 5: Commit**

Message: `feat: symlink index retains link paths (SiteIndex + lookupSites)`

---

### Task 3: copies survive dedup; bulk JSON stays byte-identical

**Files:**
- Modify: `src/types.ts` (after the `Provider` interface, ~line 67)
- Modify: `src/resolve.ts:99-113` (`mergeSkill`)
- Modify: `src/render/json.ts`
- Test: `test/resolve.test.ts` (add cases)

**Interfaces:**
- Produces: `interface SkillCopy { path: string; providerKind: Provider['kind'] }` and `SkillRecord.copies?: SkillCopy[]` — merged-away duplicate physical paths; **never** contains the surviving `provider.path`; `undefined` when there are none. Consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

Add to `test/resolve.test.ts` (match the file's existing fixture style for building `SkillRecord`s — there are existing `mergeBuckets` tests to crib the record-literal shape from):

```ts
// helper local to the new describe block
const skillAt = (path: string, contentId: string, kind: Provider['kind'] = 'project-local'): SkillRecord => ({
  name: 'dupe', contentId,
  provider: { kind, path },
  usedBy: [], enabled: true, scope: 'project-scoped',
});

describe('mergeSkill copies retention', () => {
  it('keeps the merged-away path as a copy', () => {
    const merged = mergeBuckets(
      { ...emptyBucket(), skills: [skillAt('/a/x', 'c1')] },
      { ...emptyBucket(), skills: [skillAt('/b/x', 'c1')] },
    );
    expect(merged.skills).toHaveLength(1);
    expect(merged.skills[0]!.copies).toEqual([{ path: '/b/x', providerKind: 'project-local' }]);
  });

  it('does not record the survivor path or duplicates as copies', () => {
    const merged = mergeBuckets(
      { ...emptyBucket(), skills: [skillAt('/a/x', 'c1')] },
      { ...emptyBucket(), skills: [skillAt('/a/x', 'c1')] },
    );
    expect(merged.skills[0]!.copies).toBeUndefined();
  });

  it('accumulates copies across repeated merges', () => {
    const first = mergeBuckets(
      { ...emptyBucket(), skills: [skillAt('/a/x', 'c1')] },
      { ...emptyBucket(), skills: [skillAt('/b/x', 'c1')] },
    );
    const merged = mergeBuckets(first, { ...emptyBucket(), skills: [skillAt('/c/x', 'c1')] });
    expect(merged.skills[0]!.copies).toEqual([
      { path: '/b/x', providerKind: 'project-local' },
      { path: '/c/x', providerKind: 'project-local' },
    ]);
  });

  it('a higher-ranked newcomer keeps the demoted record as a copy', () => {
    const merged = mergeBuckets(
      { ...emptyBucket(), skills: [skillAt('/proj/x', 'c1', 'project-local')] },
      { ...emptyBucket(), skills: [skillAt('/hub/x', 'c1', 'shared-store')] },
    );
    expect(merged.skills[0]!.provider.path).toBe('/hub/x');
    expect(merged.skills[0]!.copies).toEqual([{ path: '/proj/x', providerKind: 'project-local' }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/resolve.test.ts`
Expected: FAIL — `copies` is undefined where a value is expected (and a type error on `SkillCopy` until types.ts changes).

- [ ] **Step 3: Implement**

`src/types.ts` — after `Provider`:

```ts
/** A physical duplicate of a skill's content that dedup merged away. */
export interface SkillCopy {
  path: string;
  providerKind: Provider['kind'];
}
```

and on `SkillRecord`:

```ts
  /**
   * Merged-away duplicate physical paths (dedup bookkeeping; never includes
   * `provider.path`). Internal: stripped from bulk JSON, surfaced via `show`.
   */
  copies?: SkillCopy[];
```

`src/resolve.ts` — replace `mergeSkill`:

```ts
function mergeSkill(into: Map<string, SkillRecord>, s: SkillRecord): void {
  const existing = into.get(s.contentId);
  if (!existing) {
    into.set(s.contentId, { ...s, usedBy: [...s.usedBy] });
    return;
  }
  const keepNew = PROVIDER_RANK[s.provider.kind] > PROVIDER_RANK[existing.provider.kind];
  const base = keepNew ? { ...s } : existing;
  const loser = keepNew ? existing : s;
  base.usedBy = [...new Set([...existing.usedBy, ...s.usedBy])].sort();
  base.bundledInPlugin ??= keepNew ? existing.bundledInPlugin : s.bundledInPlugin;
  base.description ??= keepNew ? existing.description : s.description;
  base.usageCount ??= keepNew ? existing.usageCount : s.usageCount;
  base.lastUsedAt ??= keepNew ? existing.lastUsedAt : s.lastUsedAt;
  // Retain the merged-away physical path (agent-handoff topology; see show.ts).
  const copies = new Map<string, SkillCopy>();
  for (const c of [
    ...(existing.copies ?? []),
    ...(s.copies ?? []),
    { path: loser.provider.path, providerKind: loser.provider.kind },
  ]) {
    if (c.path !== base.provider.path) copies.set(c.path, c);
  }
  base.copies = copies.size ? [...copies.values()] : undefined;
  into.set(s.contentId, base);
}
```

(`SkillCopy` joins the existing type-only import from `./types.js`.)

`src/render/json.ts`:

```ts
/** The machine-readable contract (stable schema for the future UI). */
export function renderJson(inv: Inventory): string {
  // `copies` is internal dedup bookkeeping surfaced only via `show` —
  // stripping it keeps this bulk contract byte-identical to prior releases.
  return JSON.stringify(inv, (key, value) => (key === 'copies' ? undefined : value), 2);
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. **Pay attention to `test/render-output.test.ts`: it must pass with NO snapshot update.** If it fails, the replacer is wrong — do not update the snapshot. `npm run typecheck` clean.

- [ ] **Step 5: Commit**

Message: `feat: retain merged-away skill copies through dedup (stripped from bulk json)`

---

### Task 4: `scanFull()` exposes the site index

**Files:**
- Modify: `src/index.ts:60-107`
- Test: `test/engine.test.ts` (add one case)

**Interfaces:**
- Produces: `interface ScanResult { inventory: Inventory; sites: SiteIndex }`, `function scanFull(homeRoot?: string, opts?: ScanOptions): ScanResult`. `scan()` keeps its exact signature/behavior as a wrapper. Consumed by Tasks 5 (runShow), 8 (dashboard).

- [ ] **Step 1: Write the failing test** — add to `test/engine.test.ts`, mirroring its existing home-fixture setup style:

```ts
it('scanFull exposes the symlink site index beside the inventory', () => {
  const home = makeTempHome();
  try {
    const real = writeSkillDir(join(home, '.agents', 'skills'), 'sited');
    symlinkInto(join(home, '.claude', 'skills', 'sited'), real);
    const { inventory, sites } = scanFull(home, { walk: false });
    expect(inventory.runtimesDetected).toContain('claude-code');
    expect(lookupSites(sites, realpathSafe(real))).toContainEqual({
      runtime: 'claude-code',
      linkPath: join(home, '.claude', 'skills', 'sited'),
    });
  } finally {
    cleanup(home);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/engine.test.ts`
Expected: FAIL — `scanFull` is not exported.

- [ ] **Step 3: Implement** — in `src/index.ts`: rename the existing `scan` body to `scanFull`, keep the built `reverseIndex` in a local, and return it:

```ts
import { buildReverseSymlinkIndex, type SiteIndex } from './symlinks.js';

export interface ScanResult {
  inventory: Inventory;
  /** realpath -> runtime -> symlink path; powers `show`'s `sites` output. */
  sites: SiteIndex;
}

export function scanFull(homeRoot: string = homedir(), opts: ScanOptions = {}): ScanResult {
  const ctx: HomeCtx = { homeRoot, env: opts.env ?? process.env };
  const warnings: Warning[] = [];

  const shared = collectSharedStore(ctx);
  warnings.push(...shared.warnings);
  const sites = buildReverseSymlinkIndex(ctx);
  const enr: EnrichContext = {
    sharedByRealpath: new Map(shared.skills.map((s) => [s.realPath, s])),
    reverseIndex: sites,
    usageByKey: readSkillUsage(ctx),
  };

  // …existing body unchanged through the folders map…

  return {
    inventory: {
      generatedAt: new Date().toISOString(),
      homeRoot,
      runtimesDetected: detected,
      warnings,
      global,
      folders,
    },
    sites,
  };
}

export function scan(homeRoot: string = homedir(), opts: ScanOptions = {}): Inventory {
  return scanFull(homeRoot, opts).inventory;
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test` — PASS; `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

Message: `feat: scanFull() returns the inventory plus the symlink site index`

---

### Task 5: `src/show.ts` — ref resolution + ShowRecord assembly + runShow

**Files:**
- Create: `src/show.ts`
- Test: `test/show.test.ts`

**Interfaces (the agent-facing contract):**
- Consumes: `scanFull` (Task 4), `lookupSites`/`SymlinkSite` (Task 2), `gitLink`/`GitLink` (Task 1), `SkillCopy` (Task 3).
- Produces (consumed by Tasks 6, 7, 8):

```ts
export type ShowHit =
  | { kind: 'skill'; record: SkillRecord }
  | { kind: 'plugin'; record: PluginRecord }
  | { kind: 'mcp'; record: McpRecord };

export interface ShowCopy {
  path: string;
  /** Layers containing this physical copy: 'global' or a project folder path. */
  folders: string[];
  providerKind: Provider['kind'];
  git: GitLink | null;
}

export interface ShowCandidate { name: string; kind: Kind; id: string; folders: string[] }

export interface ShowRecord {
  schemaVersion: 1;
  scanTime: string;          // Inventory.generatedAt
  skillsightVersion: string; // package.json version
  homeRoot: string;
  kind: Kind;
  item: SkillRecord | PluginRecord | McpRecord; // full ids; internal `copies` stripped
  copies: ShowCopy[];        // skills: every physical copy INCLUDING provider.path; mcp: declaring configs; plugins: []
  sites: SymlinkSite[];
  collisions: ShowCandidate[]; // same name, different identity
}

export type RefResolution =
  | { status: 'found'; hit: ShowHit }
  | { status: 'not-found'; suggestions: string[] }
  | { status: 'ambiguous'; candidates: ShowCandidate[] };

export function resolveRef(inv: Inventory, ref: string): RefResolution;
export function assembleShow(inv: Inventory, sites: SiteIndex, hit: ShowHit): ShowRecord;
export function runShow(homeRoot: string, opts: ScanOptions, ref: string, io: ShowIO): 0 | 1 | 2;
export interface ShowIO { out: (s: string) => void; err: (s: string) => void; isTTY: boolean; json: boolean }
```

**Semantics to implement exactly:**
- Identity key per record: skills `skill:${contentId}`, plugins `plugin:${id}`, mcp `mcp:${name}` (same convention as `src/render/ink/stats.ts` — do NOT import from render/ink; engine code must not depend on the Ink layer).
- Layers walked: `[{folder:'global', bucket: inv.global}, …each folder's projectScoped and local]`.
- Ref matching: exact `record.name` match (all kinds), plus — when `ref.length >= 4` — prefix match on skill `contentId` and plugin `id`. Union deduped by identity key. 0 → not-found with up to 5 case-insensitive substring name suggestions (sorted); 1 → found (prefer the global-layer record as `hit.record`, else first in layer order); >1 → ambiguous.
- Skill copies: for every same-`contentId` record across layers, take `record.provider.path` **and** each `record.copies[].path`, attributing each to that layer's folder. Merge by path (union folders, sorted); `git: gitLink(path)`; sort copies by path. `item` = the hit record with its internal `copies` field removed (`const { copies: _internal, ...item }`).
- Skill sites: union `lookupSites(sites, path)` over every copy path, deduped by `linkPath`, sorted by runtime.
- Mcp: same-name records across layers each contribute a copy `{ path: provider.path, folders, providerKind: provider.kind, git: gitLink(path) }` (the declaring config); `sites: []`; `collisions: []` (name is mcp identity).
- Plugin: `copies: []`, `sites: []`; collisions as below.
- Collisions (skills/plugins): other identity groups with the same `name` but different key → `{ name, kind, id, folders }`.
- Version: `createRequire(import.meta.url)('../package.json').version` (module-level const — works from `src/` via tsx and from the bundled `dist/`).
- `runShow`: `scanFull` → `resolveRef` → not-found: `io.err` message + suggestions, return 1; ambiguous: `io.err` header + one line per candidate (`  <name> · <kind> · <id ≤12 chars> · <folders>`), return 2; found: `io.out` — JSON (`JSON.stringify(rec, null, 2)`) when `io.json || !io.isTTY`, else `renderShowPanel(rec)` (Task 6; until Task 6 lands, temporarily emit JSON on both paths and leave a `// TODO(task-6)` — replaced within this plan).

- [ ] **Step 1: Write the failing tests**

```ts
// test/show.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { join } from 'node:path';
import { scanFull } from '../src/index.js';
import { resolveRef, assembleShow, runShow } from '../src/show.js';
import { cleanup, makeTempHome, symlinkInto, writeSkillDir } from './helpers.js';

describe('show', () => {
  let home: string;
  afterEach(() => cleanup(home));

  /** Two projects with a byte-identical skill + one same-name different-content skill. */
  function fixture() {
    home = makeTempHome();
    writeSkillDir(join(home, 'proj-a', '.claude', 'skills'), 'dupe', { description: 'same' });
    writeSkillDir(join(home, 'proj-b', '.claude', 'skills'), 'dupe', { description: 'same' });
    writeSkillDir(join(home, 'proj-c', '.claude', 'skills'), 'dupe', { description: 'DIFFERENT' });
    writeSkillDir(join(home, 'proj-a', '.claude', 'skills'), 'lonely');
    return scanFull(home, { walk: true });
  }

  it('resolves a unique name and lists every physical copy with folders', () => {
    const { inventory, sites } = fixture();
    const res = resolveRef(inventory, 'lonely');
    expect(res.status).toBe('found');
    if (res.status !== 'found') return;
    const rec = assembleShow(inventory, sites, res.hit);
    expect(rec.schemaVersion).toBe(1);
    expect(rec.copies).toHaveLength(1);
    expect(rec.copies[0]!.folders).toEqual([join(home, 'proj-a')]);
    expect((rec.item as { copies?: unknown }).copies).toBeUndefined();
  });

  it('reports byte-identical cross-project copies and same-name collisions as ambiguity', () => {
    const { inventory } = fixture();
    // 'dupe' exists as two identities (a+b share a hash; c differs) -> ambiguous
    const res = resolveRef(inventory, 'dupe');
    expect(res.status).toBe('ambiguous');
    if (res.status !== 'ambiguous') return;
    expect(res.candidates).toHaveLength(2);
    const shared = res.candidates.find((c) => c.folders.length === 2)!;
    expect(shared.folders).toEqual([join(home, 'proj-a'), join(home, 'proj-b')]);
  });

  it('resolves an id prefix to one identity, with copies for both projects and the collision listed', () => {
    const { inventory, sites } = fixture();
    const amb = resolveRef(inventory, 'dupe');
    if (amb.status !== 'ambiguous') throw new Error('expected ambiguous');
    const sharedId = amb.candidates.find((c) => c.folders.length === 2)!.id;
    const res = resolveRef(inventory, sharedId.slice(0, 12));
    expect(res.status).toBe('found');
    if (res.status !== 'found') return;
    const rec = assembleShow(inventory, sites, res.hit);
    expect(rec.copies.map((c) => c.path).sort()).toEqual([
      join(home, 'proj-a', '.claude', 'skills', 'dupe'),
      join(home, 'proj-b', '.claude', 'skills', 'dupe'),
    ]);
    expect(rec.collisions).toHaveLength(1);
    expect(rec.collisions[0]!.folders).toEqual([join(home, 'proj-c')]);
  });

  it('includes symlink sites for hub-linked skills', () => {
    home = makeTempHome();
    const real = writeSkillDir(join(home, '.agents', 'skills'), 'hubbed');
    symlinkInto(join(home, '.claude', 'skills', 'hubbed'), real);
    const { inventory, sites } = scanFull(home, { walk: false });
    const res = resolveRef(inventory, 'hubbed');
    expect(res.status).toBe('found');
    if (res.status !== 'found') return;
    const rec = assembleShow(inventory, sites, res.hit);
    expect(rec.sites).toContainEqual({
      runtime: 'claude-code',
      linkPath: join(home, '.claude', 'skills', 'hubbed'),
    });
  });

  it('runShow returns 1 with suggestions and 2 with candidates', () => {
    fixture();
    let err = '';
    const io = { out: () => {}, err: (s: string) => (err += s), isTTY: false, json: true };
    expect(runShow(home, { walk: true }, 'lonel', io)).toBe(1); // 5 chars, no id match, not exact
    expect(err).toContain('lonely');
    err = '';
    expect(runShow(home, { walk: true }, 'dupe', io)).toBe(2);
    expect(err).toContain('ambiguous');
    let out = '';
    const io0 = { out: (s: string) => (out += s), err: () => {}, isTTY: false, json: true };
    expect(runShow(home, { walk: true }, 'lonely', io0)).toBe(0);
    expect((JSON.parse(out) as { schemaVersion: number }).schemaVersion).toBe(1);
  });
});
```

Note for the executor: if `walk: true` discovery does not pick up `<home>/proj-a` (check `src/discovery.ts` walk depth/markers — `.claude` presence is a marker), place the projects at the path shape `test/discovery.test.ts` uses. The assertions stay the same.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/show.test.ts`
Expected: FAIL — `Cannot find module '../src/show.js'`.

- [ ] **Step 3: Implement `src/show.ts`** per the Interfaces/Semantics blocks above. Skeleton:

```ts
// src/show.ts
/**
 * `skillsight show <ref>` — the agent-handoff read model.
 *
 * Resolves a name / id-prefix ref against a fresh scan and assembles the
 * versioned ShowRecord: every physical copy (dedup survivors + merged-away
 * paths), symlink sites, pure-fs git worktree grouping, and same-name
 * collisions. Read-only by design: skillsight reports topology; the agent
 * executes mutations. See docs/superpowers/specs/2026-07-14-agent-handoff-show-design.md.
 */
import { createRequire } from 'node:module';
import type { Bucket, Inventory, Kind, McpRecord, PluginRecord, Provider, SkillRecord } from './types.js';
import { scanFull, type ScanOptions } from './index.js';
import { lookupSites, type SiteIndex, type SymlinkSite } from './symlinks.js';
import { gitLink, type GitLink } from './git.js';
import { renderShowPanel } from './render/show.js'; // Task 6

const VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

// …types from the Interfaces block…

interface Layer { folder: string; bucket: Bucket }
function layers(inv: Inventory): Layer[] {
  return [
    { folder: 'global', bucket: inv.global },
    ...inv.folders.flatMap((f) => [
      { folder: f.path, bucket: f.projectScoped },
      { folder: f.path, bucket: f.local },
    ]),
  ];
}

interface Entry { key: string; kind: Kind; name: string; id: string; folder: string; hit: ShowHit }
function entries(inv: Inventory): Entry[] { /* walk layers; one Entry per record */ }
function grouped(inv: Inventory): Map<string, { first: Entry; folders: string[] }> { /* stable layer order; sorted unique folders */ }
// resolveRef, assembleShow, runShow per Semantics.
```

Implementation notes (bind the executor):
- `grouped` preserves first-seen (global-first) `hit` per key; folders sorted + deduped.
- Prefix matching guard: `ref.length >= 4 && id.startsWith(ref)` where id = contentId (skills) / plugin id (plugins).
- Suggestions: unique names where `name.toLowerCase().includes(ref.toLowerCase())`, sorted, `slice(0, 5)`.
- Copies merge map keyed by path; folders unioned + sorted; final array sorted by path.
- Do NOT call `gitLink` on the `'global'` pseudo-folder attribution — call it on each copy's *path* (works everywhere).

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run test/show.test.ts` — PASS; `npm test` — PASS; `npm run typecheck` — clean.
(Until Task 6, stub `renderShowPanel` usage behind the JSON path as noted in Semantics.)

- [ ] **Step 5: Commit**

Message: `feat: show.ts — ref resolution + ShowRecord assembly + runShow executor`

---

### Task 6: human panel renderer `src/render/show.ts`

**Files:**
- Create: `src/render/show.ts`
- Modify: `src/show.ts` (wire `renderShowPanel` into `runShow`'s TTY path, removing the Task-5 stub)
- Test: `test/show-panel.test.ts`

**Interfaces:**
- Produces: `function renderShowPanel(rec: ShowRecord): string` — plain text, no ANSI color (keeps tests simple; the JSON path is the machine contract).

- [ ] **Step 1: Write the failing test**

```ts
// test/show-panel.test.ts
import { describe, expect, it } from 'vitest';
import { renderShowPanel } from '../src/render/show.js';
import type { ShowRecord } from '../src/show.js';

const base: ShowRecord = {
  schemaVersion: 1, scanTime: '2026-07-14T12:00:00.000Z', skillsightVersion: '0.2.0',
  homeRoot: '/Users/x', kind: 'skill',
  item: {
    name: 'dupe', contentId: 'abcdef1234567890', usedBy: ['claude-code'],
    provider: { kind: 'project-local', path: '/Users/x/proj-a/.claude/skills/dupe' },
    enabled: true, scope: 'project-scoped',
  },
  copies: [
    { path: '/Users/x/repo/.claude/skills/dupe', folders: ['/Users/x/repo'], providerKind: 'project-local',
      git: { repoRoot: '/Users/x/repo', isWorktree: false } },
    { path: '/Users/x/repo.wt/a/.claude/skills/dupe', folders: ['/Users/x/repo.wt/a'], providerKind: 'project-local',
      git: { repoRoot: '/Users/x/repo.wt/a', isWorktree: true, mainCheckout: '/Users/x/repo' } },
  ],
  sites: [{ runtime: 'claude-code', linkPath: '/Users/x/.claude/skills/dupe' }],
  collisions: [{ name: 'dupe', kind: 'skill', id: 'fff111', folders: ['/Users/x/proj-c'] }],
};

describe('renderShowPanel', () => {
  it('groups copies by repo and flags worktrees', () => {
    const out = renderShowPanel(base);
    expect(out).toContain('dupe');
    expect(out).toContain('copies (2)');
    expect(out).toContain('main checkout + 1 worktree');
    expect(out).toContain('(worktree)');
    expect(out).toContain('sites (1)');
    expect(out).toContain('collisions (1)');
    expect(out).toContain('skillsight show abcdef123456 --json');
  });

  it('omits empty sections', () => {
    const out = renderShowPanel({ ...base, sites: [], collisions: [] });
    expect(out).not.toContain('sites (');
    expect(out).not.toContain('collisions (');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/show-panel.test.ts` → module not found.

- [ ] **Step 3: Implement**

```ts
// src/render/show.ts
/** Plain-text panel for `skillsight show` on a TTY (the JSON path is the contract). */
import type { ShowRecord } from '../show.js';

function repoKey(c: ShowRecord['copies'][number]): string {
  if (!c.git) return '(no repo)';
  return c.git.isWorktree ? (c.git.mainCheckout ?? c.git.repoRoot) : c.git.repoRoot;
}

export function renderShowPanel(rec: ShowRecord): string {
  const L: string[] = [];
  L.push(`${rec.item.name}  ·  ${rec.kind}  ·  scanned ${rec.scanTime}`);
  if ('scope' in rec.item) L.push(`scope     ${rec.item.scope}`);
  if ('usedBy' in rec.item && rec.item.usedBy.length) L.push(`used by   ${rec.item.usedBy.join(', ')}`);

  if (rec.copies.length) {
    L.push('', `copies (${rec.copies.length})`);
    const groups = new Map<string, ShowRecord['copies']>();
    for (const c of rec.copies) {
      const k = repoKey(c);
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
    }
    for (const [root, copies] of groups) {
      const wts = copies.filter((c) => c.git?.isWorktree).length;
      const label = wts
        ? `${root} — main checkout + ${wts} worktree${wts === 1 ? '' : 's'}`
        : root;
      L.push(`  ${label}`);
      for (const c of copies) {
        const mark = c.git?.isWorktree ? '  (worktree)' : '';
        L.push(`    ${c.path}${mark}  [${c.folders.join(', ')}]`);
      }
    }
  }
  if (rec.sites.length) {
    L.push('', `sites (${rec.sites.length})`);
    for (const s of rec.sites) L.push(`  ${s.runtime}  ${s.linkPath}`);
  }
  if (rec.collisions.length) {
    L.push('', `collisions (${rec.collisions.length}) — same name, different content`);
    for (const c of rec.collisions) L.push(`  ${c.name} · ${c.kind} · ${c.id.slice(0, 12)} · ${c.folders.join(', ')}`);
  }
  const id = 'contentId' in rec.item ? rec.item.contentId.slice(0, 12) : ('id' in rec.item ? rec.item.id : rec.item.name);
  L.push('', `agent → skillsight show ${id} --json`);
  return L.join('\n');
}
```

Then in `src/show.ts` `runShow`, replace the Task-5 stub so the found branch is:
`io.out((io.json || !io.isTTY ? JSON.stringify(rec, null, 2) : renderShowPanel(rec)) + '\n');`

Note the grouping subtlety the first panel test pins: a main-checkout copy AND its worktree copies share one `repoKey`, so they render under one header. `main checkout + N worktrees` appears whenever `wts > 0`.

- [ ] **Step 4: Run** — `npx vitest run test/show-panel.test.ts test/show.test.ts` → PASS; `npm run typecheck` clean.

- [ ] **Step 5: Commit** — message: `feat: plain-text panel renderer for skillsight show`

---

### Task 7: CLI wiring — `skillsight show <ref>`

**Files:**
- Modify: `src/cliArgs.ts` (Args, parseArgs, Mode, decideMode)
- Modify: `src/cli.ts` (show branch + HELP)
- Test: `test/cli.test.ts` (add cases)

**Interfaces:**
- Consumes: `runShow` (Task 5/6).
- Produces: `Args.show: boolean`, `Args.showRef?: string`, `Mode` union gains `'show'`; `decideMode` takes `{ json, watch, report, show }` and returns `'show'` first when `show` is set.

- [ ] **Step 1: Write the failing tests** — add to `test/cli.test.ts` beside the existing parseArgs/decideMode cases:

```ts
it('parses show with a ref', () => {
  const a = parseArgs(['show', 'obsidian-cli']);
  expect(a.show).toBe(true);
  expect(a.showRef).toBe('obsidian-cli');
  expect(a.errors).toEqual([]);
});

it('show without a ref is a fatal error', () => {
  const a = parseArgs(['show']);
  expect(a.errors).toContain('show requires a <ref> (item name or id prefix)');
});

it('show wins mode selection, even with --json', () => {
  expect(decideMode({ json: true, watch: false, report: false, show: true }, true)).toBe('show');
  expect(decideMode({ json: false, watch: false, report: false, show: true }, false)).toBe('show');
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/cli.test.ts` → type/assert failures.

- [ ] **Step 3: Implement**

`src/cliArgs.ts`:
- `Args` gains `show: boolean; showRef?: string;` (init `show: false` in `parseArgs`).
- `export type Mode = 'json' | 'dashboard' | 'report' | 'show';`
- `decideMode` first line: `if (args.show) return 'show';` and widen its args type with `show: boolean`.
- `parseArgs` switch, next to the `watch` case:

```ts
      case 'show':
        a.show = true;
        if (i + 1 < argv.length && !isFlag(argv[i + 1])) a.showRef = argv[++i];
        else a.errors.push('show requires a <ref> (item name or id prefix)');
        break;
```

`src/cli.ts` — after the `mode === 'dashboard'` block (static import `runShow` from `./show.js` at top; it pulls no Ink):

```ts
  if (mode === 'show') {
    process.exitCode = runShow(homeRoot, scanOpts, args.showRef!, {
      out: (s) => process.stdout.write(s),
      err: (s) => process.stderr.write(s),
      isTTY: Boolean(process.stdout.isTTY),
      json: args.json,
    });
    return;
  }
```

HELP additions — under Usage: `  skillsight show <ref>           full record for one item (name or id prefix)`; under Options a line for the exit codes: `                                  show exits 0 found · 1 no match · 2 ambiguous; piped output is JSON`.

- [ ] **Step 4: Run + end-to-end smoke**

Run: `npm test` → PASS. Then a real-world smoke (not a test):
`npx tsx src/cli.ts show definitely-not-a-skill; echo "exit=$?"` → prints `no item matching…`, `exit=1`.
`npx tsx src/cli.ts show obsidian-cli --json | head -20` → JSON with `"schemaVersion": 1` (uses your real home scan).

- [ ] **Step 5: Commit** — message: `feat: skillsight show <ref> CLI mode with deterministic exit codes`

---

### Task 8: Ink handshake — hint line, y/Y yank, toast

**Files:**
- Modify: `src/render/ink/detail.ts` (agentRef/agentCommand + `agent` field)
- Create: `src/render/ink/clipboard.ts`, `src/render/ink/useYank.ts`
- Modify: `src/render/ink/index.tsx`, `App.tsx` (scanFull + sites + `yankJson`), `RankedView.tsx`, `GlobalView.tsx`, `FoldersView.tsx` (key wiring + footer)
- Test: `test/clipboard.test.ts`, additions to `test/detail.test.ts`

**Interfaces:**
- Consumes: `assembleShow`, `ShowHit` (Task 5); `SiteIndex` + `scanFull` (Tasks 2/4).
- Produces: `agentRef(row): string | undefined` (skill → `contentId.slice(0,12)`, plugin → plugin `id`, mcp → name), `agentCommand(row): string | undefined` (`skillsight show <ref> --json`), `osc52(text): string`, `copyToClipboard(text, write?)`, hook `useYank(): { toast: string; copy: (text: string, label: string) => void }`. Views receive `yankJson?: (row: ItemRow) => string | undefined` from App.

- [ ] **Step 1: Write the failing tests**

```ts
// test/clipboard.test.ts
import { describe, expect, it } from 'vitest';
import { osc52, copyToClipboard } from '../src/render/ink/clipboard.js';

describe('osc52', () => {
  it('base64-encodes into the clipboard escape', () => {
    expect(osc52('hi')).toBe('\u001b]52;c;aGk=\u0007');
  });
  it('copyToClipboard writes through the injected sink', () => {
    let got = '';
    copyToClipboard('hi', (s) => (got = s));
    expect(got).toBe(osc52('hi'));
  });
});
```

Add to `test/detail.test.ts` (reuse its existing row fixtures for the three kinds):

```ts
it('appends the agent handshake line per kind', () => {
  // skill row fixture with contentId 'abcdef1234567890…'
  expect(detailFields(skillRow).at(-1)).toEqual(
    { label: 'agent', value: 'skillsight show abcdef123456 --json', dim: true });
  // plugin row → its plugin id; mcp row → its name
  expect(detailFields(pluginRow).at(-1)!.value).toBe(`skillsight show ${pluginId} --json`);
  expect(detailFields(mcpRow).at(-1)!.value).toBe(`skillsight show ${mcpName} --json`);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/clipboard.test.ts test/detail.test.ts` → module not found / missing field.

- [ ] **Step 3: Implement**

`src/render/ink/clipboard.ts`:

```ts
/**
 * OSC 52 clipboard write — no subprocess, works over SSH. tmux with
 * `set-clipboard on` (Shane's setup, verified 2026-07-14) forwards it to the
 * outer terminal.
 */
export function osc52(text: string): string {
  return `\u001b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\u0007`;
}

export function copyToClipboard(
  text: string,
  write: (s: string) => void = (s) => process.stdout.write(s),
): void {
  write(osc52(text));
}
```

`src/render/ink/detail.ts` — add after `shortId`:

```ts
/** The ref an agent passes to `skillsight show` for this row's record. */
export function agentRef(row: ItemRow): string | undefined {
  if (!row.record) return undefined;
  if (row.kind === 'skill') return (row.record as SkillRecord).contentId.slice(0, 12);
  if (row.kind === 'plugin') return (row.record as PluginRecord).id;
  return row.name;
}

/** The screenshot-visible handshake: how an agent re-fetches this record. */
export function agentCommand(row: ItemRow): string | undefined {
  const ref = agentRef(row);
  return ref ? `skillsight show ${ref} --json` : undefined;
}
```

and at the end of `detailFields`, after the switch result is computed:

```ts
export function detailFields(row: ItemRow): DetailField[] {
  if (!row.record) return [];
  const fields = (() => {
    switch (row.kind) {
      case 'skill': return skillFields(row.record as SkillRecord);
      case 'plugin': return pluginFields(row.record as PluginRecord);
      case 'mcp': return mcpFields(row.record as McpRecord);
    }
  })();
  const cmd = agentCommand(row);
  if (cmd) fields.push({ label: 'agent', value: cmd, dim: true });
  return fields;
}
```

`src/render/ink/useYank.ts`:

```ts
import { useEffect, useState } from 'react';
import { copyToClipboard } from './clipboard.js';

/** Clipboard copy + a self-clearing "copied …" toast for the footer line. */
export function useYank(): { toast: string; copy: (text: string, label: string) => void } {
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 1500);
    return () => clearTimeout(t);
  }, [toast]);
  return {
    toast,
    copy: (text, label) => {
      copyToClipboard(text);
      setToast(`copied ${label}`);
    },
  };
}
```

`src/render/ink/index.tsx` — `const initial = scanFull(homeRoot, opts);`; non-TTY branch uses `initial.inventory`; `<App … initial={initial.inventory} initialSites={initial.sites} />`.

`src/render/ink/App.tsx`:
- Props gain `initialSites: SiteIndex`; state `const [sites, setSites] = useState(initialSites);`
- Rescan trigger becomes: `const r = scanFull(homeRoot, opts); setRaw(r.inventory); setSites(r.sites);`
- Build the yank payload from the RAW (unfiltered) inventory:

```ts
  const yankJson = (row: ItemRow): string | undefined => {
    if (!row.record) return undefined;
    const hit = { kind: row.kind, record: row.record } as ShowHit;
    return JSON.stringify(assembleShow(raw, sites, hit), null, 2);
  };
```

- Pass `yankJson={yankJson}` to FoldersView, GlobalView, and both RankedViews.

View wiring (same pattern ×3; RankedView shown — insert into its `useInput` immediately after the `sort.handleKey` line, and only when `detail` is truthy):

```ts
      if (detail && selRow && !isHeader) {
        if (input === 'y') {
          const cmd = agentCommand(selRow);
          if (cmd) yank.copy(cmd, 'agent cmd');
          return;
        }
        if (input === 'Y') {
          const json = yankJson?.(selRow);
          if (json) yank.copy(json, 'json record');
          return;
        }
      }
```

with `const yank = useYank();` in the component and the detail footer extended:

```ts
  const footer = detail
    ? (yank.toast ? `✓ ${yank.toast} · ` : '') + 'y agent cmd · Y json · Esc/← back · 1/2/3/4 or Tab switch · q quit'
    : '↑/↓ move · → expand source · Enter detail · 1/2/3/4 or Tab · q quit';
```

GlobalView and FoldersView: same three additions (hook, key handling inside their detail-focused input branch, footer text) — locate each view's detail branch (`GlobalView.tsx:41` `useInput`, `FoldersView.tsx:119` `useInput` when `nav.focus === 'detail'`) and mirror the snippet with their focused-row variable. `y`/`Y` are verified unused across all views (checked 2026-07-14: q f tab 1-4 s . hjkl arrows enter esc space a).

- [ ] **Step 4: Run + manual smoke**

Run: `npm test` → PASS (detail.test.ts and any listDetail expectations updated for the new trailing field); `npm run typecheck` → clean.
Manual: `npx tsx src/cli.ts` → open a skill detail → pane shows the dim `agent  skillsight show … --json` line → press `y` → footer shows `✓ copied agent cmd` → paste into another terminal to confirm the clipboard content. Press `Y` → paste shows the ShowRecord JSON.

- [ ] **Step 5: Commit** — message: `feat: detail-pane agent handshake — hint line + y/Y OSC 52 yank`

---

### Task 9: worktree marks in "lives in", README, final verification

**Files:**
- Modify: `src/render/ink/RankedView.tsx` (Locations rows)
- Modify: `README.md`
- Test: existing suites (no new files)

- [ ] **Step 1: Worktree marks**

In `RankedView.tsx`, compute marks for the detail's location list (module-scope import `gitLink` from `../../git.js`):

```ts
  const wtMarks = useMemo(
    () => new Map(locs.map((p) => [p, Boolean(gitLink(p)?.isWorktree)])),
    [locs],
  );
```

Pass `wtMarks` into the `Locations` component and render a dim ` (worktree)` suffix on marked rows (adapt to the component's existing row markup in the same file). This is display-only polish; if the Locations markup makes threading the prop awkward, compute the suffix inline where rows render.

- [ ] **Step 2: README**

Add an "Agent handoff" section after the existing usage docs: the workflow (dashboard → screenshot → agent runs the pane's `agent →` command), the `show` synopsis, the exit codes (0/1/2), a truncated example of the JSON record highlighting `copies[]` with `git.mainCheckout`, `sites[]`, `collisions[]`, and a note that `schemaVersion: 1` is the stable agent contract while `copies` never appears in bulk `--json`.

- [ ] **Step 3: Full verification**

Run: `npm test` → all green. `npm run typecheck` → clean. `npm run build` → tsup succeeds.
Real-machine spot check of the flagship scenario: `npx tsx src/cli.ts show obsidian-cli --json` (or by id prefix if the name is ambiguous) → copies list the SnowbridgeMedia main checkout + the three worktrees, each worktree copy carrying `"isWorktree": true` and the shared `"mainCheckout"`.

- [ ] **Step 4: Commit** — message: `feat: worktree marks in lives-in + agent-handoff docs`

---

## Self-Review (completed at write time)

- **Spec coverage:** §1 copies/sites retention → Tasks 2–4; §2 git.ts → Task 1; §3 show command/addressing/JSON/modes → Tasks 5–7; §4 hint+yank+toast → Task 8, optional lives-in marks → Task 9; §5 exit codes → Tasks 5/7; §6 testing patterns → per-task tests + snapshot-byte-identity guard in Task 3.
- **Placeholder scan:** the single deliberate stub (Task 5's TTY panel path) is created and removed *within this plan* (Task 6) and marked as such.
- **Type consistency:** `SiteIndex`/`SymlinkSite` (T2) consumed by T4/T5/T8; `SkillCopy` (T3) by T5; `GitLink` (T1) by T5/T6/T9; `ShowHit`/`ShowRecord` (T5) by T6/T7/T8; `agentCommand` (T8 detail.ts) used by T8 views.
