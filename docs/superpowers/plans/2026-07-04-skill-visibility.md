# Claude Code Skill Visibility (`skillOverrides`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model Claude Code's per-skill visibility (`skillOverrides`: `on` / `name-only` / `user-invocable-only` / `off`) so skillsight's global and per-folder effective views stop over-reporting parked/off skills and surface per-project promotions.

**Architecture:** A pure resolution helper (`src/adapters/claude-code-visibility.ts`) turns settings maps into a visibility verdict, keyed by skill **directory name**. The claude-code adapter applies it at record creation (user layer in `collectGlobal`, folder layers in `collectForDirectory`) and via a new optional `refineEffective` adapter hook that the engine calls per folder after the effective merge — that hook is what lets a folder's settings re-resolve a *global* skill's visibility (the promotion/demotion case). Renderers pick up the two new optional `SkillRecord` fields.

**Tech Stack:** TypeScript (strict, ESM with `.js` import suffixes), vitest, Ink/React for the dashboard. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-skill-visibility-design.md` (same branch).

## Resolved open questions (do not re-litigate)

- **Override key identity = the skill's DIRECTORY name.** Verified empirically 2026-07-04 on the live machine (Claude Code v2.1.201, scratch project, skill dir `dir-alpha` with frontmatter `name: fm-beta`): baseline lists the skill as `dir-alpha`; `{"dir-alpha":"off"}` hides it; `{"fm-beta":"off"}` is a no-op. Same identity rule as the Codex `[[skills.config]]` fix of 2026-07-03. Task 3 encodes this as a regression test.
- **Leaderboard/stats semantics:** parked skills count as-is (no split counts). Deferred per spec.
- **Filter chip:** deferred per spec.

## Global Constraints

- `skillOverrides` states are exactly `on` | `name-only` | `user-invocable-only` | `off`; absent = no override = `on`.
- Merge is per-key, higher layer wins: `local > project > user` (`settings.local.json` > project `settings.json` > `~/.claude/settings.json`). The user layer reads **only** `~/.claude/settings.json` (not user-level `settings.local.json`).
- Plugin-bundled skills (`bundledInPlugin` set) are **never** touched by visibility overrides.
- `enabled` for claude-code standalone skills derives as `visibility !== 'off'`. `name-only` and `user-invocable-only` stay `enabled: true`.
- Unknown/invalid state values: treat as `on` + push a `Warning`. Overrides naming nonexistent skills: ignore silently.
- `--json` schema is additive-only: the ONLY new fields are `SkillRecord.visibility?` and `SkillRecord.visibilitySource?`. Do not add other serialized fields.
- The engine (`src/index.ts`, `src/resolve.ts`) stays runtime-agnostic — claude-code logic lives in `src/adapters/`.
- skillsight is read-only: never write settings files.
- Follow existing patterns: `WeakMap<HomeCtx, …>` per-scan caches, `pendingWarnings` flush-once, `node:` import prefixes, `.js` suffixes on relative imports.
- Every task: `npm test` green before commit. Typecheck with `npm run typecheck`.
- Commit style (from repo history): `feat: …`, `fix: …`, `test: …`, scoped like `perf(skillscan): …`.

## File Structure

- **Create** `src/adapters/claude-code-visibility.ts` — pure: `parseSkillOverrides`, `resolveVisibility`, `visibilityOverlay`. No fs, no Node APIs beyond types.
- **Create** `test/claude-code-visibility.test.ts` — unit tests for the helper + `scanSkillsDir` overlay.
- **Modify** `src/types.ts` — `SkillVisibility`, `VisibilitySource`, two optional `SkillRecord` fields.
- **Modify** `src/skillscan.ts` — optional `overlay` callback (5th param).
- **Modify** `src/adapters/index.ts` — optional `refineEffective?` on `RuntimeAdapter`.
- **Modify** `src/adapters/claude-code.ts` — user map in `globalConfig`, overlays in both collectors, `refineEffective` implementation with realpath→dirName indexes.
- **Modify** `src/index.ts` — one loop calling `refineEffective` after the effective merge.
- **Modify** `src/render/ink/detail.ts`, `src/render/ink/rows.ts`, `src/render/ink/ItemTable.tsx`, `src/render/plain.ts` — presentation.
- **Modify** `test/claude-code.test.ts`, `test/engine.test.ts`, `test/detail.test.ts`, `test/rows.test.ts`, `test/render-output.test.ts` (+ snapshot).

---

### Task 1: Types + pure resolution helper

**Files:**
- Modify: `src/types.ts` (after the `Scope` type, ~line 16; and inside `SkillRecord`, ~line 63)
- Create: `src/adapters/claude-code-visibility.ts`
- Test: `test/claude-code-visibility.test.ts`

**Interfaces:**
- Consumes: `Warning` from `src/types.ts`.
- Produces (later tasks rely on these exact names):
  - `types.ts`: `type SkillVisibility = 'on' | 'name-only' | 'user-invocable-only' | 'off'`, `type VisibilitySource = 'user' | 'project' | 'local'`, `SkillRecord.visibility?: SkillVisibility`, `SkillRecord.visibilitySource?: VisibilitySource`.
  - helper: `parseSkillOverrides(raw: unknown, path: string, warnings?: Warning[]): SkillOverrides`, `resolveVisibility(dirName: string, layers: VisibilityLayers): ResolvedVisibility | undefined`, `visibilityOverlay(r: ResolvedVisibility | undefined): Partial<SkillRecord> | undefined`, `type SkillOverrides = Record<string, SkillVisibility>`, `interface VisibilityLayers { user?: SkillOverrides; project?: SkillOverrides; local?: SkillOverrides }`, `interface ResolvedVisibility { visibility: SkillVisibility; source: VisibilitySource }`.

- [ ] **Step 1: Write the failing tests**

Create `test/claude-code-visibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseSkillOverrides,
  resolveVisibility,
  visibilityOverlay,
} from '../src/adapters/claude-code-visibility.js';
import type { Warning } from '../src/types.js';

describe('parseSkillOverrides', () => {
  it('returns {} for undefined without warning', () => {
    const w: Warning[] = [];
    expect(parseSkillOverrides(undefined, '/s.json', w)).toEqual({});
    expect(w).toEqual([]);
  });

  it('keeps all four valid states', () => {
    const raw = { a: 'on', b: 'name-only', c: 'user-invocable-only', d: 'off' };
    expect(parseSkillOverrides(raw, '/s.json')).toEqual(raw);
  });

  it('treats an invalid state as "on" and warns with the file path', () => {
    const w: Warning[] = [];
    expect(parseSkillOverrides({ chartli: 'sometimes' }, '/s.json', w)).toEqual({ chartli: 'on' });
    expect(w).toHaveLength(1);
    expect(w[0]!.path).toBe('/s.json');
    expect(w[0]!.reason).toContain('chartli');
    expect(w[0]!.reason).toContain('sometimes');
  });

  it('treats a non-string state as "on" and warns', () => {
    const w: Warning[] = [];
    expect(parseSkillOverrides({ x: 3 }, '/s.json', w)).toEqual({ x: 'on' });
    expect(w).toHaveLength(1);
  });

  it('returns {} + one warning when skillOverrides is not an object', () => {
    const w: Warning[] = [];
    expect(parseSkillOverrides('off', '/s.json', w)).toEqual({});
    expect(parseSkillOverrides([1], '/s.json', w)).toEqual({});
    expect(parseSkillOverrides(null, '/s.json', w)).toEqual({});
    expect(w).toHaveLength(3);
  });

  it('does not push warnings when no sink is given', () => {
    expect(() => parseSkillOverrides({ x: 'bad' }, '/s.json')).not.toThrow();
  });
});

describe('resolveVisibility', () => {
  it('returns undefined when no layer names the dir', () => {
    expect(resolveVisibility('ghost', { user: { other: 'off' } })).toBeUndefined();
    expect(resolveVisibility('ghost', {})).toBeUndefined();
  });

  it('user layer alone applies', () => {
    expect(resolveVisibility('a', { user: { a: 'user-invocable-only' } })).toEqual({
      visibility: 'user-invocable-only',
      source: 'user',
    });
  });

  it('project beats user (promotion: on beats user-invocable-only)', () => {
    expect(
      resolveVisibility('a', { user: { a: 'user-invocable-only' }, project: { a: 'on' } }),
    ).toEqual({ visibility: 'on', source: 'project' });
  });

  it('local beats project (demotion: off beats project on)', () => {
    expect(
      resolveVisibility('a', {
        user: { a: 'user-invocable-only' },
        project: { a: 'on' },
        local: { a: 'off' },
      }),
    ).toEqual({ visibility: 'off', source: 'local' });
  });

  it('a layer that does not name the dir falls through', () => {
    expect(
      resolveVisibility('a', { user: { a: 'name-only' }, project: { other: 'off' }, local: {} }),
    ).toEqual({ visibility: 'name-only', source: 'user' });
  });
});

describe('visibilityOverlay', () => {
  it('returns undefined for undefined', () => {
    expect(visibilityOverlay(undefined)).toBeUndefined();
  });

  it('derives enabled=false only for off', () => {
    expect(visibilityOverlay({ visibility: 'off', source: 'local' })).toEqual({
      visibility: 'off',
      visibilitySource: 'local',
      enabled: false,
    });
    expect(visibilityOverlay({ visibility: 'user-invocable-only', source: 'user' })).toEqual({
      visibility: 'user-invocable-only',
      visibilitySource: 'user',
      enabled: true,
    });
    expect(visibilityOverlay({ visibility: 'on', source: 'project' })).toEqual({
      visibility: 'on',
      visibilitySource: 'project',
      enabled: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/claude-code-visibility.test.ts`
Expected: FAIL — cannot find module `../src/adapters/claude-code-visibility.js`.

- [ ] **Step 3: Implement**

In `src/types.ts`, add after the `Scope` type (line 16):

```ts
/** Claude Code per-skill visibility state (settings `skillOverrides`). */
export type SkillVisibility = 'on' | 'name-only' | 'user-invocable-only' | 'off';

/** The settings layer whose `skillOverrides` entry decided a skill's visibility. */
export type VisibilitySource = 'user' | 'project' | 'local';
```

In `SkillRecord`, add two fields after `enabled: boolean;`:

```ts
  /**
   * Claude Code `skillOverrides` visibility (standalone skills only — plugin
   * skills follow plugin enablement). Absent = no override = `on`.
   */
  visibility?: SkillVisibility;
  /** The layer that decided `visibility` (`local > project > user`). */
  visibilitySource?: VisibilitySource;
```

Create `src/adapters/claude-code-visibility.ts`:

```ts
/**
 * Pure resolution for Claude Code per-skill visibility (`skillOverrides`).
 *
 * Keys are skill DIRECTORY names, not frontmatter `name` (verified
 * empirically 2026-07-04: an override keyed by frontmatter name is a no-op —
 * the same identity rule as the Codex `[[skills.config]]` fix). Merge is
 * per-key, higher layer wins: local > project > user. Plugin-bundled skills
 * are exempt; callers skip them.
 */
import type { SkillRecord, SkillVisibility, VisibilitySource, Warning } from '../types.js';

const STATES: readonly string[] = ['on', 'name-only', 'user-invocable-only', 'off'];

export type SkillOverrides = Record<string, SkillVisibility>;

export interface VisibilityLayers {
  user?: SkillOverrides;
  project?: SkillOverrides;
  local?: SkillOverrides;
}

export interface ResolvedVisibility {
  visibility: SkillVisibility;
  source: VisibilitySource;
}

/**
 * Validate a raw `skillOverrides` value from a settings file. Non-object →
 * `{}` + warning. An invalid state is kept as `'on'` (it is still an
 * override entry, just one we can't read) + warning.
 */
export function parseSkillOverrides(raw: unknown, path: string, warnings?: Warning[]): SkillOverrides {
  if (raw === undefined) return {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings?.push({ path, reason: 'invalid skillOverrides (not an object; ignored)' });
    return {};
  }
  const out: SkillOverrides = {};
  for (const [name, state] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof state === 'string' && STATES.includes(state)) {
      out[name] = state as SkillVisibility;
    } else {
      warnings?.push({
        path,
        reason: `invalid skillOverrides state ${JSON.stringify(state)} for "${name}" (treated as "on")`,
      });
      out[name] = 'on';
    }
  }
  return out;
}

/** `local ?? project ?? user` for one dir name; `undefined` when no layer names it. */
export function resolveVisibility(dirName: string, layers: VisibilityLayers): ResolvedVisibility | undefined {
  const local = layers.local?.[dirName];
  if (local !== undefined) return { visibility: local, source: 'local' };
  const project = layers.project?.[dirName];
  if (project !== undefined) return { visibility: project, source: 'project' };
  const user = layers.user?.[dirName];
  if (user !== undefined) return { visibility: user, source: 'user' };
  return undefined;
}

/** SkillRecord fields for a resolved override. `enabled` derives as `visibility !== 'off'`. */
export function visibilityOverlay(r: ResolvedVisibility | undefined): Partial<SkillRecord> | undefined {
  if (!r) return undefined;
  return { visibility: r.visibility, visibilitySource: r.source, enabled: r.visibility !== 'off' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/claude-code-visibility.test.ts && npm run typecheck`
Expected: PASS (16 tests), typecheck clean.

- [ ] **Step 5: Run the whole suite, then commit**

Run: `npm test`
Expected: 183 existing + 16 new pass.

```bash
git add src/types.ts src/adapters/claude-code-visibility.ts test/claude-code-visibility.test.ts
git commit -m "feat: SkillVisibility types + pure skillOverrides resolution helper"
```

---

### Task 2: `scanSkillsDir` overlay parameter

**Files:**
- Modify: `src/skillscan.ts:47-73` (the `scanSkillsDir` function)
- Test: `test/claude-code-visibility.test.ts` (append)

**Interfaces:**
- Consumes: `Partial<SkillRecord>` (Task 1 types).
- Produces: `scanSkillsDir(dir, ctx, scope, enabledFor?, overlay?)` where `overlay?: (dirName: string) => Partial<SkillRecord> | undefined` is merged **last** into each record (so it may override `enabled`). Existing 4-arg callers are untouched.

- [ ] **Step 1: Write the failing test**

Append to `test/claude-code-visibility.test.ts`:

```ts
import { join } from 'node:path';
import { makeTempHome, cleanup, ctxOf, writeSkillDir } from './helpers.js';
import { scanSkillsDir } from '../src/skillscan.js';

describe('scanSkillsDir overlay', () => {
  it('merges overlay fields by DIRECTORY entry name, after enabled default', () => {
    const home = makeTempHome();
    try {
      const skillsDir = join(home, '.claude', 'skills');
      writeSkillDir(skillsDir, 'dir-x', { name: 'fm-y' });
      writeSkillDir(skillsDir, 'plain');
      const out = scanSkillsDir(skillsDir, ctxOf(home), 'global', undefined, (dirName) =>
        dirName === 'dir-x'
          ? { visibility: 'off', visibilitySource: 'user', enabled: false }
          : undefined,
      );
      const byName = Object.fromEntries(out.map((s) => [s.name, s]));
      // overlay keyed by dir name lands on the record whose display name is the frontmatter name
      expect(byName['fm-y']!.visibility).toBe('off');
      expect(byName['fm-y']!.visibilitySource).toBe('user');
      expect(byName['fm-y']!.enabled).toBe(false);
      expect(byName['plain']!.visibility).toBeUndefined();
      expect(byName['plain']!.enabled).toBe(true);
    } finally {
      cleanup(home);
    }
  });
});
```

(Imports go at the top of the file with the existing ones.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/claude-code-visibility.test.ts`
Expected: FAIL — `scanSkillsDir` takes no 5th argument / `visibility` stays undefined.

- [ ] **Step 3: Implement**

In `src/skillscan.ts`, change the signature and record push of `scanSkillsDir`:

```ts
export function scanSkillsDir(
  dir: string,
  ctx: HomeCtx,
  scope: Scope,
  /** Enablement by DIRECTORY entry name (e.g. Codex `[[skills.config]]` stores paths, matched by basename). */
  enabledFor?: (dirName: string) => boolean,
  /**
   * Extra record fields by DIRECTORY entry name (e.g. Claude Code
   * `skillOverrides` visibility). Merged last, so it may override `enabled`.
   */
  overlay?: (dirName: string) => Partial<SkillRecord> | undefined,
): SkillRecord[] {
```

and in the loop body, replace the `out.push({ … })` object with:

```ts
    out.push({
      name: typeof fm.name === 'string' ? fm.name : e.name,
      description: typeof fm.description === 'string' ? fm.description : undefined,
      contentId: real,
      provider: providerForRealpath(real, ctx, scope),
      usedBy: [],
      enabled: enabledFor ? enabledFor(e.name) : true,
      scope,
      ...overlay?.(e.name),
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/claude-code-visibility.test.ts && npm test`
Expected: all PASS (existing `scanSkillsDir` callers unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/skillscan.ts test/claude-code-visibility.test.ts
git commit -m "feat: scanSkillsDir overlay callback for per-dir record fields"
```

---

### Task 3: User-layer visibility in `collectGlobal`

**Files:**
- Modify: `src/adapters/claude-code.ts` (`SettingsFile` ~line 23, `GlobalConfig` ~line 54, `globalConfig()` ~line 69, `collectGlobal` ~line 232)
- Test: `test/claude-code.test.ts` (append a describe block)

**Interfaces:**
- Consumes: Task 1 helper, Task 2 overlay param.
- Produces: `GlobalConfig.userSkillOverrides: SkillOverrides` (parsed+validated once per scan; validation warnings ride `pendingWarnings`). Global-bucket user skills carry user-layer `visibility`/`visibilitySource`/derived `enabled`. Task 4 and 5 rely on `globalConfig(ctx).userSkillOverrides`.

- [ ] **Step 1: Write the failing tests**

Append to `test/claude-code.test.ts`:

```ts
describe('claude-code adapter: skill visibility (user layer)', () => {
  it('applies user-layer skillOverrides to standalone skills by DIR name', () => {
    const { home: h } = buildHome();
    home = h;
    writeSkillDir(join(h, '.claude', 'skills'), 'dir-x', { name: 'fm-y' });
    writeFileEnsured(
      join(h, '.claude', 'settings.json'),
      JSON.stringify({
        enabledPlugins: { 'alpha@official': true, 'beta@official': false },
        skillOverrides: {
          localskill: 'user-invocable-only',
          hubskill: 'off',
          'dir-x': 'off', // dir name — applies
          'fm-y': 'name-only', // frontmatter name — must NOT apply
          ghost: 'off', // nonexistent skill — silently ignored
        },
      }),
    );
    const g = claudeCodeAdapter.collectGlobal(ctxOf(h), []);
    const byName = Object.fromEntries(g.skills.map((s) => [s.name, s]));

    expect(byName.localskill!.visibility).toBe('user-invocable-only');
    expect(byName.localskill!.visibilitySource).toBe('user');
    expect(byName.localskill!.enabled).toBe(true); // parked, still available

    expect(byName.hubskill!.visibility).toBe('off');
    expect(byName.hubskill!.enabled).toBe(false); // off at user layer -> disabled in global bucket

    expect(byName['fm-y']!.visibility).toBe('off'); // matched via dir-x, not fm-y
    expect(byName.ghost).toBeUndefined(); // no phantom record
  });

  it('never applies overrides to plugin-bundled skills', () => {
    const { home: h } = buildHome();
    home = h;
    writeFileEnsured(
      join(h, '.claude', 'settings.json'),
      JSON.stringify({
        enabledPlugins: { 'alpha@official': true },
        skillOverrides: { foo: 'off' }, // alpha's bundled skill dir name
      }),
    );
    const g = claudeCodeAdapter.collectGlobal(ctxOf(h), []);
    const foo = g.skills.find((s) => s.bundledInPlugin === 'alpha@official' && s.name === 'foo')!;
    expect(foo.visibility).toBeUndefined();
    expect(foo.enabled).toBe(true); // still follows plugin enablement
  });

  it('warns once per scan on an invalid state value and treats it as on', () => {
    const { home: h } = buildHome();
    home = h;
    writeFileEnsured(
      join(h, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: {}, skillOverrides: { localskill: 'sometimes' } }),
    );
    const warnings: Warning[] = [];
    const ctx = ctxOf(h);
    const g = claudeCodeAdapter.collectGlobal(ctx, warnings);
    claudeCodeAdapter.collectForDirectory(join(h, 'p1'), ctx, warnings);
    const visWarnings = warnings.filter((w) => w.reason.includes('skillOverrides'));
    expect(visWarnings).toHaveLength(1); // flushed once via pendingWarnings
    const s = g.skills.find((x) => x.name === 'localskill')!;
    expect(s.visibility).toBe('on');
    expect(s.visibilitySource).toBe('user');
    expect(s.enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/claude-code.test.ts`
Expected: FAIL — `visibility` is `undefined` on `localskill`, no warnings pushed.

- [ ] **Step 3: Implement**

In `src/adapters/claude-code.ts`:

1. Import the helper (top of file, with the other relative imports):

```ts
import {
  parseSkillOverrides,
  resolveVisibility,
  visibilityOverlay,
  type SkillOverrides,
  type VisibilityLayers,
} from './claude-code-visibility.js';
```

2. Extend `SettingsFile`:

```ts
interface SettingsFile {
  enabledPlugins?: Record<string, boolean>;
  enableAllProjectMcpServers?: boolean;
  skillOverrides?: unknown;
}
```

3. Extend `GlobalConfig` and `globalConfig()`. Add to the interface:

```ts
  /** User-layer `skillOverrides` from `<home>/settings.json`, validated. */
  userSkillOverrides: SkillOverrides;
```

and in `globalConfig()` build it (note: **no** warnings sink on this `readJson` — `collectGlobal` already reports a malformed settings.json via its own read; only the validation warnings are new, and they go to `pending`):

```ts
    const settingsPath = join(home, 'settings.json');
    cfg = {
      installed: readJson<InstalledPlugins>(join(home, 'plugins', 'installed_plugins.json'), pending),
      marketplaces: readJson<Record<string, MarketplaceEntry>>(join(home, 'plugins', 'known_marketplaces.json'), pending),
      claudeJson: readJson<ClaudeJson>(claudeJsonPath(ctx), pending),
      userSkillOverrides: parseSkillOverrides(
        readJson<SettingsFile>(settingsPath)?.skillOverrides,
        settingsPath,
        pending,
      ),
      pendingWarnings: pending,
    };
```

4. In `collectGlobal`, destructure it and pass an overlay to the user-skills scan. Replace:

```ts
    const { installed, marketplaces, claudeJson } = globalConfig(ctx, warnings);
```

with:

```ts
    const { installed, marketplaces, claudeJson, userSkillOverrides } = globalConfig(ctx, warnings);
```

and replace the user-skills line:

```ts
    // user skills (~/.claude/skills/*)
    bucket.skills.push(...scanSkillsDir(join(home, 'skills'), ctx, 'global'));
```

with:

```ts
    // user skills (~/.claude/skills/*), user-layer visibility resolved by DIR name
    bucket.skills.push(
      ...scanSkillsDir(join(home, 'skills'), ctx, 'global', undefined, (dirName) =>
        visibilityOverlay(resolveVisibility(dirName, { user: userSkillOverrides })),
      ),
    );
```

(Plugin skills are built by `pluginRecordAndSkills`, which gets no overlay — the exemption is structural.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/claude-code.test.ts && npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/claude-code.ts test/claude-code.test.ts
git commit -m "feat: user-layer skillOverrides visibility in claude-code collectGlobal"
```

---

### Task 4: Folder-layer visibility in `collectForDirectory`

**Files:**
- Modify: `src/adapters/claude-code.ts` (`collectForDirectory`, ~line 245)
- Test: `test/claude-code.test.ts` (append)

**Interfaces:**
- Consumes: Task 3's `globalConfig(ctx).userSkillOverrides`; Task 1's `parseSkillOverrides` / `resolveVisibility` / `visibilityOverlay`; Task 2's overlay param.
- Produces: project skills (`<dir>/.claude/skills`) carry fully folder-resolved visibility (`local ?? project ?? user`). Validation warnings for the two folder settings files are forwarded here (Task 5's hook stays silent).

- [ ] **Step 1: Write the failing test**

Append inside the `describe('claude-code adapter: skill visibility (user layer)'` block — or as its own block:

```ts
describe('claude-code adapter: skill visibility (folder layers)', () => {
  it('resolves project skills local > project > user', () => {
    const { home: h, proj } = buildHome();
    home = h;
    writeSkillDir(join(proj, '.claude', 'skills'), 'ps2');
    writeSkillDir(join(proj, '.claude', 'skills'), 'ps3');
    writeFileEnsured(
      join(h, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: {}, skillOverrides: { ps: 'user-invocable-only' } }),
    );
    writeFileEnsured(
      join(proj, '.claude', 'settings.json'),
      JSON.stringify({ skillOverrides: { ps: 'on', ps2: 'name-only', ps3: 'name-only' } }),
    );
    writeFileEnsured(
      join(proj, '.claude', 'settings.local.json'),
      JSON.stringify({ skillOverrides: { ps3: 'off' } }),
    );
    const d = claudeCodeAdapter.collectForDirectory(proj, ctxOf(h), []);
    const byName = Object.fromEntries(d.skills.map((s) => [s.name, s]));

    expect(byName.ps!.visibility).toBe('on'); // project promotion beats user park
    expect(byName.ps!.visibilitySource).toBe('project');
    expect(byName.ps!.enabled).toBe(true);

    expect(byName.ps2!.visibility).toBe('name-only');
    expect(byName.ps2!.visibilitySource).toBe('project');
    expect(byName.ps2!.enabled).toBe(true);

    expect(byName.ps3!.visibility).toBe('off'); // local demotion beats project name-only
    expect(byName.ps3!.visibilitySource).toBe('local');
    expect(byName.ps3!.enabled).toBe(false);
  });

  it('forwards invalid-state warnings for folder settings files', () => {
    const { home: h, proj } = buildHome();
    home = h;
    writeFileEnsured(
      join(proj, '.claude', 'settings.json'),
      JSON.stringify({ skillOverrides: { ps: 'nope' } }),
    );
    const warnings: Warning[] = [];
    claudeCodeAdapter.collectForDirectory(proj, ctxOf(h), warnings);
    expect(warnings.some((w) => w.reason.includes('skillOverrides') && w.path.includes('settings.json'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/claude-code.test.ts`
Expected: FAIL — `visibility` undefined on `ps`/`ps2`/`ps3`.

- [ ] **Step 3: Implement**

In `collectForDirectory`, replace the settings-read prologue:

```ts
    const settingsFiles = [
      readJson<SettingsFile>(join(dir, '.claude', 'settings.json'), warnings),
      readJson<SettingsFile>(join(dir, '.claude', 'settings.local.json'), warnings),
    ];
    const projEnabled = mergeEnabled(...settingsFiles);

    // project-scoped plugins installed for this directory
    const { installed, marketplaces, claudeJson } = globalConfig(ctx);
```

with:

```ts
    const projSettingsPath = join(dir, '.claude', 'settings.json');
    const localSettingsPath = join(dir, '.claude', 'settings.local.json');
    const settingsFiles = [
      readJson<SettingsFile>(projSettingsPath, warnings),
      readJson<SettingsFile>(localSettingsPath, warnings),
    ];
    const projEnabled = mergeEnabled(...settingsFiles);

    // project-scoped plugins installed for this directory
    const { installed, marketplaces, claudeJson, userSkillOverrides } = globalConfig(ctx);
    const visLayers: VisibilityLayers = {
      user: userSkillOverrides,
      project: parseSkillOverrides(settingsFiles[0]?.skillOverrides, projSettingsPath, warnings),
      local: parseSkillOverrides(settingsFiles[1]?.skillOverrides, localSettingsPath, warnings),
    };
```

and replace the project-skills line:

```ts
    // project skills
    bucket.skills.push(...scanSkillsDir(join(dir, '.claude', 'skills'), ctx, 'project-scoped'));
```

with:

```ts
    // project skills, folder-resolved visibility (local > project > user) by DIR name
    bucket.skills.push(
      ...scanSkillsDir(join(dir, '.claude', 'skills'), ctx, 'project-scoped', undefined, (dirName) =>
        visibilityOverlay(resolveVisibility(dirName, visLayers)),
      ),
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/claude-code.test.ts && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/claude-code.ts test/claude-code.test.ts
git commit -m "feat: folder-layer skillOverrides resolution for project skills"
```

---

### Task 5: `refineEffective` hook — per-folder visibility for global skills

This is the heart of the spec: a skill that physically lives globally gets different visibility in each folder's `effective` bucket, while `Inventory.global` keeps user-layer resolution.

**Files:**
- Modify: `src/adapters/index.ts` (add optional method)
- Modify: `src/index.ts:73-87` (folder loop)
- Modify: `src/adapters/claude-code.ts` (implement hook + realpath→dirName indexes)
- Test: `test/engine.test.ts` (append)

**Interfaces:**
- Consumes: everything above. `mergeBuckets` copies records on first insert (`mergeSkill` spreads), so mutating `effective` records never corrupts `Inventory.global` or the folder's `projectScoped`/`local` buckets.
- Produces: `RuntimeAdapter.refineEffective?(dir: string, effective: Bucket, ctx: HomeCtx): void`. Engine calls it for every active adapter per folder, after `mergeBuckets(global, folderBucket)`.

- [ ] **Step 1: Write the failing tests**

Append to `test/engine.test.ts` (uses the existing imports; also add `import { ctxOf } from './helpers.js'` if you use it — the code below does not need it):

```ts
describe('scan() skill visibility (per-folder effective)', () => {
  function visibilityHome(): { home: string; proj: string } {
    const h = makeTempHome();
    const proj = join(h, 'proj');
    writeSkillDir(join(h, '.claude', 'skills'), 'parked1');
    writeSkillDir(join(h, '.claude', 'skills'), 'plain1');
    writeFileEnsured(
      join(h, '.claude', 'settings.json'),
      JSON.stringify({ skillOverrides: { parked1: 'user-invocable-only' } }),
    );
    writeFileEnsured(join(proj, '.claude', 'settings.json'), JSON.stringify({}));
    return { home: h, proj };
  }

  it('global bucket keeps user-layer resolution; folder promotion only changes effective', () => {
    const { home: h, proj } = visibilityHome();
    home = h;
    writeFileEnsured(
      join(proj, '.claude', 'settings.json'),
      JSON.stringify({ skillOverrides: { parked1: 'on' } }),
    );
    const inv = scan(h, { walk: false, dir: proj, env: {} });

    const g = inv.global.skills.find((s) => s.name === 'parked1')!;
    expect(g.visibility).toBe('user-invocable-only');
    expect(g.visibilitySource).toBe('user');

    const eff = inv.folders[0]!.effective.skills.find((s) => s.name === 'parked1')!;
    expect(eff.visibility).toBe('on'); // promoted for this folder
    expect(eff.visibilitySource).toBe('project');
    expect(eff.enabled).toBe(true);

    const plain = inv.folders[0]!.effective.skills.find((s) => s.name === 'plain1')!;
    expect(plain.visibility).toBeUndefined(); // untouched when no layer names it
  });

  it('local demotion to off disables the skill in that folder effective only', () => {
    const { home: h, proj } = visibilityHome();
    home = h;
    writeFileEnsured(
      join(proj, '.claude', 'settings.json'),
      JSON.stringify({ skillOverrides: { parked1: 'on' } }),
    );
    writeFileEnsured(
      join(proj, '.claude', 'settings.local.json'),
      JSON.stringify({ skillOverrides: { parked1: 'off' } }),
    );
    const inv = scan(h, { walk: false, dir: proj, env: {} });

    const eff = inv.folders[0]!.effective.skills.find((s) => s.name === 'parked1')!;
    expect(eff.visibility).toBe('off');
    expect(eff.visibilitySource).toBe('local');
    expect(eff.enabled).toBe(false);

    expect(inv.global.skills.find((s) => s.name === 'parked1')!.enabled).toBe(true);
  });

  it('matches a hub-symlinked skill by its LINK name in ~/.claude/skills', () => {
    const { home: h, proj } = visibilityHome();
    home = h;
    const hub = writeSkillDir(join(h, '.agents', 'skills'), 'hubbed');
    symlinkInto(join(h, '.claude', 'skills', 'hubbed'), hub);
    writeFileEnsured(
      join(proj, '.claude', 'settings.json'),
      JSON.stringify({ skillOverrides: { hubbed: 'off' } }),
    );
    const inv = scan(h, { walk: false, dir: proj, env: {} });
    const eff = inv.folders[0]!.effective.skills.find((s) => s.name === 'hubbed')!;
    expect(eff.provider.kind).toBe('shared-store'); // dedup kept the claude record
    expect(eff.visibility).toBe('off');
    expect(eff.enabled).toBe(false);
  });

  it('surfaces invalid user-layer states as a single scan warning', () => {
    const { home: h, proj } = visibilityHome();
    home = h;
    writeFileEnsured(
      join(h, '.claude', 'settings.json'),
      JSON.stringify({ skillOverrides: { parked1: 'sideways' } }),
    );
    const inv = scan(h, { walk: false, dir: proj, env: {} });
    expect(inv.warnings.filter((w) => w.reason.includes('skillOverrides'))).toHaveLength(1);
    expect(inv.global.skills.find((s) => s.name === 'parked1')!.visibility).toBe('on');
  });

  it('ignores overrides naming skills that do not exist', () => {
    const { home: h, proj } = visibilityHome();
    home = h;
    writeFileEnsured(
      join(proj, '.claude', 'settings.json'),
      JSON.stringify({ skillOverrides: { ghost: 'off' } }),
    );
    const inv = scan(h, { walk: false, dir: proj, env: {} });
    expect(inv.folders[0]!.effective.skills.find((s) => s.name === 'ghost')).toBeUndefined();
    expect(inv.warnings.filter((w) => w.reason.includes('skillOverrides'))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/engine.test.ts`
Expected: FAIL — `eff.visibility` is `'user-invocable-only'` (inherited), not `'on'`; demotion test fails likewise.

- [ ] **Step 3: Implement**

1. `src/adapters/index.ts` — add to the `RuntimeAdapter` interface (import `Bucket` is already there):

```ts
  /**
   * Optional post-merge pass over one folder's `effective` bucket, for
   * runtime facts where folder settings re-scope records the folder pass
   * didn't produce (e.g. Claude Code per-folder `skillOverrides` re-resolving
   * a global skill's visibility). Mutates `effective` records in place; the
   * engine guarantees they are copies (mergeBuckets), never the global originals.
   */
  refineEffective?(dir: string, effective: Bucket, ctx: HomeCtx): void;
```

2. `src/index.ts` — in the folder loop, hoist `effective` and call the hooks:

```ts
    const { projectScoped, local } = splitByScope(folderBucket);
    const effective = mergeBuckets(global, folderBucket);
    for (const a of active) a.refineEffective?.(dir, effective, ctx);
    return {
      path: dir,
      group: groupFor(dir, homeRoot),
      runtimes: detected,
      global: emptyBucket(), // inherited layer lives at Inventory.global
      projectScoped,
      local,
      effective,
    };
```

3. `src/adapters/claude-code.ts` — add the index helpers near `globalConfigCache`:

```ts
// refineEffective must recover each record's DIRECTORY entry name (the
// skillOverrides key) from its realpath. The user-skills index is stable per
// scan — memoize per HomeCtx (same pattern as globalConfigCache).
const userSkillDirIndexCache = new WeakMap<HomeCtx, Map<string, string>>();

/** realpath -> directory entry name, for one skills dir. */
function skillDirIndex(dir: string): Map<string, string> {
  const idx = new Map<string, string>();
  for (const e of readDirEntries(dir)) {
    if (e.name.startsWith('.')) continue;
    if (!e.isDir && !e.isSymlink) continue;
    idx.set(realpathSafe(join(dir, e.name)), e.name);
  }
  return idx;
}

function userSkillDirIndex(ctx: HomeCtx): Map<string, string> {
  let idx = userSkillDirIndexCache.get(ctx);
  if (!idx) {
    idx = skillDirIndex(join(claudeHome(ctx), 'skills'));
    userSkillDirIndexCache.set(ctx, idx);
  }
  return idx;
}
```

and add the method to `claudeCodeAdapter` (after `collectForDirectory`):

```ts
  refineEffective(dir, effective, ctx) {
    const { userSkillOverrides } = globalConfig(ctx);
    const projSettingsPath = join(dir, '.claude', 'settings.json');
    const localSettingsPath = join(dir, '.claude', 'settings.local.json');
    // No warnings sink here: collectForDirectory already reported these
    // files for this folder in the same scan.
    const layers: VisibilityLayers = {
      user: userSkillOverrides,
      project: parseSkillOverrides(readJson<SettingsFile>(projSettingsPath)?.skillOverrides, projSettingsPath),
      local: parseSkillOverrides(readJson<SettingsFile>(localSettingsPath)?.skillOverrides, localSettingsPath),
    };
    if (
      !Object.keys(layers.user ?? {}).length &&
      !Object.keys(layers.project ?? {}).length &&
      !Object.keys(layers.local ?? {}).length
    ) {
      return;
    }
    const folderIdx = skillDirIndex(join(dir, '.claude', 'skills'));
    const userIdx = userSkillDirIndex(ctx);
    for (const s of effective.skills) {
      if (s.bundledInPlugin) continue; // plugin skills follow plugin enablement
      const dirName = folderIdx.get(s.provider.path) ?? userIdx.get(s.provider.path);
      if (dirName === undefined) continue;
      const overlay = visibilityOverlay(resolveVisibility(dirName, layers));
      if (overlay) Object.assign(s, overlay);
    }
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/engine.test.ts && npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/index.ts src/index.ts src/adapters/claude-code.ts test/engine.test.ts
git commit -m "feat: refineEffective hook — per-folder skillOverrides on global skills"
```

---

### Task 6: Detail view shows visibility + deciding layer

**Files:**
- Modify: `src/render/ink/detail.ts:22-38` (`skillFields`)
- Test: `test/detail.test.ts` (append to the `detailFields — skill` describe)

**Interfaces:**
- Consumes: `SkillRecord.visibility` / `.visibilitySource`.
- Produces: a `visibility` labelled field, e.g. `user-invocable-only (user)` or `on (project — promoted)`. Promoted tag only when `visibility === 'on'` and the source is `project`/`local`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('detailFields — skill', …)` in `test/detail.test.ts`:

```ts
  it('shows visibility with its deciding layer', () => {
    const f = detailFields(skillRow({ visibility: 'user-invocable-only', visibilitySource: 'user' }));
    expect(valueOf(f, 'visibility')).toBe('user-invocable-only (user)');
  });

  it('tags an explicit project/local on as promoted', () => {
    const f = detailFields(skillRow({ visibility: 'on', visibilitySource: 'project' }));
    expect(valueOf(f, 'visibility')).toBe('on (project — promoted)');
  });

  it('does not tag a user-layer on as promoted, and omits the field when absent', () => {
    const f = detailFields(skillRow({ visibility: 'on', visibilitySource: 'user' }));
    expect(valueOf(f, 'visibility')).toBe('on (user)');
    expect(valueOf(detailFields(skillRow({})), 'visibility')).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/detail.test.ts`
Expected: FAIL — no `visibility` field.

- [ ] **Step 3: Implement**

In `skillFields` in `src/render/ink/detail.ts`, insert between the `bundledInPlugin` and `!s.enabled` lines:

```ts
  if (s.visibility) {
    const promoted = s.visibility === 'on' && s.visibilitySource !== 'user' ? ' — promoted' : '';
    f.push({ label: 'visibility', value: `${s.visibility} (${s.visibilitySource}${promoted})` });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/detail.test.ts && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/detail.ts test/detail.test.ts
git commit -m "feat: DetailView visibility field with deciding layer + promoted tag"
```

---

### Task 7: Parked skills render dimmed in item tables

**Files:**
- Modify: `src/render/ink/rows.ts` (`ItemRow` + `skillRow`)
- Modify: `src/render/ink/ItemTable.tsx:98-101` (the NAME cell `Text`)
- Test: `test/rows.test.ts` (append)

**Interfaces:**
- Consumes: `SkillRecord.visibility`.
- Produces: `ItemRow.parked?: true` — present **only when true** (`test/rows.test.ts` compares rows with exact `toEqual`; an always-present `parked: false` would break eight existing tests). Set for `name-only` and `user-invocable-only`. `ItemTable` dims the name of parked rows (`off` rows are covered by the existing enabled/disabled presentation and get no new styling).

- [ ] **Step 1: Write the failing tests**

Append to `describe('itemRows', …)` in `test/rows.test.ts`:

```ts
  it('flags parked skills (name-only / user-invocable-only) and only those', () => {
    const parked = { ...skill('p1', ['cc']), visibility: 'user-invocable-only' as const, visibilitySource: 'user' as const };
    const nameOnly = { ...skill('p2', ['cc']), visibility: 'name-only' as const, visibilitySource: 'user' as const };
    const on = { ...skill('p3', ['cc']), visibility: 'on' as const, visibilitySource: 'project' as const };
    const off = { ...skill('p4', ['cc']), visibility: 'off' as const, visibilitySource: 'user' as const, enabled: false };
    const rows = itemRows({ ...emptyBucket(), skills: [parked, nameOnly, on, off, skill('p5', ['cc'])] });
    expect(rows.map((r) => r.parked)).toEqual([true, true, undefined, undefined, undefined]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/rows.test.ts`
Expected: FAIL — `parked` all `undefined`.

- [ ] **Step 3: Implement**

In `src/render/ink/rows.ts`, add to `ItemRow`:

```ts
  /** True for a skill parked by Claude Code visibility (`name-only` / `user-invocable-only`): still available, reduced/zero context cost. */
  parked?: boolean;
```

and change `skillRow`:

```ts
function skillRow(s: SkillRecord): ItemRow {
  const parked = s.visibility === 'name-only' || s.visibility === 'user-invocable-only';
  return {
    kind: 'skill',
    name: s.name,
    used: s.usedBy.length,
    source: s.provider.source ?? s.provider.kind,
    sourceDim: !s.provider.source,
    record: s,
    usedRuntimes: s.usedBy,
    ...(parked ? { parked: true } : {}),
  };
}
```

In `src/render/ink/ItemTable.tsx`, the NAME cell `Text` gains `dimColor`:

```tsx
        <Text wrap="truncate-end" inverse={active} bold={active || isGroup} dimColor={!!row.parked && !active}>
          {label}
        </Text>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/rows.test.ts && npm test && npm run typecheck`
Expected: all PASS (exact-object `toEqual` tests unaffected because `parked` is spread conditionally).

- [ ] **Step 5: Commit**

```bash
git add src/render/ink/rows.ts src/render/ink/ItemTable.tsx test/rows.test.ts
git commit -m "feat: dim parked skills in item tables"
```

---

### Task 8: Plain `--provenance` visibility line + characterization updates

**Files:**
- Modify: `src/render/plain.ts:24-30` (`skillLine`)
- Modify: `test/render-output.test.ts` (fixture gains a parked global skill + a promoted copy in one folder)
- Regenerate: `test/__snapshots__/render-output.test.ts.snap` (deliberately)

**Interfaces:**
- Consumes: `SkillRecord.visibility` / `.visibilitySource`.
- Produces: with `--provenance`, skills whose visibility is not `on` get a dim `visibility: <state> (<layer>)` continuation line (same shape as the `used by:` line). `--json` needs no code — the new fields serialize automatically; the fixture proves it via the round-trip test.

- [ ] **Step 1: Extend the fixture (this intentionally changes snapshots)**

In `test/render-output.test.ts`, add a parked skill to `globalBucket.skills` (after the `beta-skill` entry):

```ts
      skill({
        name: 'parked-skill', description: undefined, contentId: '/home/u/.claude/skills/parked-skill',
        provider: { kind: 'user', path: '/home/u/.claude/skills/parked-skill' },
        usedBy: ['claude-code'], visibility: 'user-invocable-only', visibilitySource: 'user',
      }),
```

And make the `full` folder's effective show a per-folder promotion — replace the `full` folder construction with:

```ts
  const promotedSkill = skill({
    name: 'parked-skill', description: undefined, contentId: '/home/u/.claude/skills/parked-skill',
    provider: { kind: 'user', path: '/home/u/.claude/skills/parked-skill' },
    usedBy: ['claude-code'], visibility: 'on', visibilitySource: 'project',
  });
  const full = folder(
    '/home/u/Developer/Projects/full', 'Developer/Projects',
    { ...emptyBucket(), skills: [projSkill] },
    { ...emptyBucket(), mcp: [localMcp] },
    {
      skills: [...globalBucket.skills.filter((s) => s.name !== 'parked-skill'), promotedSkill, projSkill],
      plugins: globalBucket.plugins,
      mcp: [...globalBucket.mcp, localMcp],
    },
  );
```

- [ ] **Step 2: Run to see the snapshot failures (proves the fixture reaches the output)**

Run: `npx vitest run test/render-output.test.ts`
Expected: 4 snapshot FAILs (new skill line in each report variant). The JSON round-trip test still PASSES (it's self-consistent) — that is expected; it proves the new fields serialize.

- [ ] **Step 3: Implement the provenance line**

In `src/render/plain.ts`, replace `skillLine`:

```ts
function skillLine(s: SkillRecord, prov: boolean, prefix: string): string {
  const src = s.provider.source ? ` ${s.provider.source}` : '';
  const tag = pc.dim(`[${s.provider.kind}${src}]`);
  const off = s.enabled ? '' : pc.red(' (disabled)');
  const used = prov ? pc.dim(`\n      used by: ${s.usedBy.join(', ') || '—'}`) : '';
  const vis = prov && s.visibility && s.visibility !== 'on'
    ? pc.dim(`\n      visibility: ${s.visibility} (${s.visibilitySource})`)
    : '';
  return `${prefix}${s.name} ${tag}${off}${used}${vis}`;
}
```

- [ ] **Step 4: Regenerate snapshots and inspect the diff**

Run: `npx vitest run test/render-output.test.ts -u && git diff test/__snapshots__/`
Expected diff contains ONLY: `parked-skill [user]` lines in the four report variants, and (in the `--provenance` snapshot) one `visibility: user-invocable-only (user)` line under it. If anything else changed, stop and investigate.

- [ ] **Step 5: Run everything, commit**

Run: `npm test && npm run typecheck`
Expected: all PASS.

```bash
git add src/render/plain.ts test/render-output.test.ts test/__snapshots__/render-output.test.ts.snap
git commit -m "feat: --provenance visibility line + characterization fixture for parked skills"
```

---

### Task 9: Verification sweep

**Files:** none created — verification only.

- [ ] **Step 1: Full suite + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 2: Live smoke test against the real machine**

Run: `node dist/cli.js --json 2>/dev/null | python3 -c "import json,sys; inv=json.load(sys.stdin); g=[s for s in inv['global']['skills'] if s.get('visibility')]; print(len(g), 'skills carry visibility'); print({s['visibility'] for s in g})"`

Expected: ≈27 skills carry visibility (the live machine's user-layer parks), states drawn from the four valid values. Then spot-check one known promotion: a folder whose `.claude/settings.json` promotes a skill should show `visibility: on, visibilitySource: project` in that folder's `effective` while `global` still shows the park. (If `dist/cli.js` is not the entry name, check `package.json` `bin`/`tsup` config — `npx tsx src/cli.ts --json` is an equivalent fallback.)

- [ ] **Step 3: Spec cross-check**

Re-read `docs/superpowers/specs/2026-07-04-skill-visibility-design.md` sections "Spec'd behavior changes" (all 6) and "Tests" (all 7 fixture cases) and confirm each maps to a shipped task: 1→Task 1/3/4 (+json via Task 8), 2→Tasks 3/5, 3→Task 6, 4→Task 7, 5→Task 8, 6→Tasks 5/6 (recoverable via `visibilitySource`). Fixture cases: user park→T3/T5, promotion→T4/T5, local demotion→T4/T5, off-at-user in global→T3, nonexistent→T3/T5, plugin-bundled→T3, invalid value→T3/T5.

- [ ] **Step 4: Use superpowers:requesting-code-review, then superpowers:finishing-a-development-branch**
