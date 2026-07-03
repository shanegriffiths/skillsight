# Codebase Review & Consolidation Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the consolidation pass approved in `docs/superpowers/specs/2026-07-03-codebase-review-design.md` — characterization safety net, eight verified bug fixes, hub-direct skill visibility, plain-report parity, render/adapter consolidation, memoization, dead-code removal.

**Architecture:** Tests-first: Tasks 1–3 pin current behavior; Tasks 4–8 fix root-caused bugs TDD-style; Tasks 9–12 land the spec'd behavior changes (each updating snapshots deliberately); Tasks 13–18 consolidate the render layer; Tasks 19–21 consolidate/speed up adapters; Task 22 sweeps dead code and comments.

**Tech Stack:** Node/TS ESM, vitest, Ink (React terminal), picocolors, smol-toml, yaml.

## Global Constraints

- Branch: `code-review-cleanup`. Run `npm test` and `npm run typecheck` after every task; both must stay green.
- Output parity: `--json` and `--report` output changes ONLY in Tasks 4, 10, 11, 12 (the spec'd changes). Any other snapshot diff is a bug in your change.
- Privacy invariant: env/header KEY NAMES only, never values. Do not touch the adapter footguns (Gemini `httpUrl`=http/`url`=sse; OpenCode `mcp` key + `command` array + `environment`; Codex `http_headers` + seconds; Cursor typeless remote).
- Do not change the shape of `SkillRecord`/`PluginRecord`/`McpRecord`/`Inventory` (JSON output is public surface).
- Commit after each task with the message given in its final step. Do not batch tasks into one commit.
- Snapshot updates: only via `npx vitest run <file> -u` in the task that specs the change, after inspecting the diff.

---

### Task 1: Characterization tests for renderPlain + renderJson

**Files:**
- Test (create): `test/render-output.test.ts`

**Interfaces:**
- Produces: the fixture builder `fixtureInventory(): Inventory` and snapshot files under `test/__snapshots__/` that Tasks 11 and 12 will deliberately update. Later tasks rely on these tests existing — do not skip snapshot commit.

- [ ] **Step 1: Write the test file**

Key facts baked in: `renderJson` is `JSON.stringify(inv, null, 2)`; picocolors must be forced off via `NO_COLOR` set BEFORE the module loads (hence the dynamic imports after `process.env.NO_COLOR = '1'`); the fixture uses a fixed `generatedAt` so snapshots are stable. The dot-path folder (`/home/u/.config/tool`) is included ON PURPOSE — today it renders (that's current behavior; Task 11 changes it deliberately).

```ts
// test/render-output.test.ts
import { describe, it, expect } from 'vitest';
import type {
  Inventory, SkillRecord, PluginRecord, McpRecord, FolderReport, Bucket,
} from '../src/types.js';
import { emptyBucket } from '../src/types.js';

// picocolors reads the env at module load — force color off BEFORE importing the renderers.
process.env.NO_COLOR = '1';
const { renderPlain } = await import('../src/render/plain.js');
const { renderJson } = await import('../src/render/json.js');

function skill(over: Partial<SkillRecord> = {}): SkillRecord {
  return {
    name: 'alpha-skill',
    description: 'First skill',
    contentId: 'hash-alpha',
    provider: {
      kind: 'shared-store',
      path: '/home/u/.agents/skills/alpha-skill',
      source: 'owner/alpha',
      sourceUrl: 'https://github.com/owner/alpha',
      skillFolderHash: 'hash-alpha',
    },
    usedBy: ['claude-code', 'codex', 'warp'],
    enabled: true,
    scope: 'global',
    ...over,
  };
}

function plugin(over: Partial<PluginRecord> = {}): PluginRecord {
  return {
    id: 'super@official',
    name: 'super',
    marketplace: 'official',
    marketplaceRepo: 'org/official',
    version: '1.2.3',
    scope: 'user',
    enabled: true,
    provides: { skills: ['alpha-skill'], commands: ['go'], agents: [], mcpServers: ['srv'] },
    supportsRuntimes: ['claude-code', 'codex'],
    runtime: 'claude-code',
    ...over,
  };
}

function mcp(over: Partial<McpRecord> = {}): McpRecord {
  return {
    name: 'stdio-srv',
    transport: { kind: 'stdio', command: 'npx', args: ['-y', 'srv'], envKeys: ['API_KEY'] },
    provider: { kind: 'user', path: '/home/u/.claude.json' },
    scope: 'global',
    enabled: true,
    runtime: 'claude-code',
    ...over,
  };
}

function folder(path: string, group: string, projectScoped: Bucket, local: Bucket, effective: Bucket): FolderReport {
  return { path, group, runtimes: ['claude-code', 'codex'], global: emptyBucket(), projectScoped, local, effective };
}

export function fixtureInventory(): Inventory {
  const globalBucket: Bucket = {
    skills: [
      skill(),
      skill({
        name: 'beta-skill', description: undefined, contentId: '/home/u/.claude/skills/beta-skill',
        provider: { kind: 'user', path: '/home/u/.claude/skills/beta-skill' },
        usedBy: ['claude-code'], enabled: false,
      }),
    ],
    plugins: [plugin()],
    mcp: [
      mcp(),
      mcp({
        name: 'http-srv',
        transport: { kind: 'http', url: 'https://example.com/mcp', headerKeys: ['Authorization'], timeoutMs: 30000 },
        enabled: false,
        runtime: 'codex',
      }),
    ],
  };

  const projSkill = skill({
    name: 'proj-skill', contentId: '/home/u/Developer/Projects/full/.claude/skills/proj-skill',
    provider: { kind: 'project-local', path: '/home/u/Developer/Projects/full/.claude/skills/proj-skill' },
    usedBy: ['claude-code'], scope: 'project-scoped', description: undefined,
  });
  const localMcp = mcp({
    name: 'local-srv', transport: { kind: 'stdio', command: 'y' },
    provider: { kind: 'project-local', path: '/home/u/.claude.json' }, scope: 'local',
  });
  const dotSkill = skill({
    name: 'dot-skill', contentId: '/home/u/.config/tool/.claude/skills/dot-skill',
    provider: { kind: 'project-local', path: '/home/u/.config/tool/.claude/skills/dot-skill' },
    usedBy: ['claude-code'], scope: 'project-scoped', description: undefined,
  });

  const full = folder(
    '/home/u/Developer/Projects/full', 'Developer/Projects',
    { ...emptyBucket(), skills: [projSkill] },
    { ...emptyBucket(), mcp: [localMcp] },
    { skills: [...globalBucket.skills, projSkill], plugins: globalBucket.plugins, mcp: [...globalBucket.mcp, localMcp] },
  );
  const quiet = folder(
    '/home/u/Developer/Projects/quiet', 'Developer/Projects',
    emptyBucket(), emptyBucket(), globalBucket,
  );
  const dotted = folder(
    '/home/u/.config/tool', '.config',
    { ...emptyBucket(), skills: [dotSkill] }, emptyBucket(),
    { ...globalBucket, skills: [...globalBucket.skills, dotSkill] },
  );

  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    homeRoot: '/home/u',
    runtimesDetected: ['claude-code', 'codex'],
    warnings: [{ path: '/home/u/.claude/settings.json', reason: 'unreadable: malformed JSON' }],
    global: globalBucket,
    folders: [dotted, full, quiet],
  };
}

describe('renderPlain characterization', () => {
  it('default report', () => {
    expect(renderPlain(fixtureInventory())).toMatchSnapshot();
  });
  it('--full', () => {
    expect(renderPlain(fixtureInventory(), { full: true })).toMatchSnapshot();
  });
  it('--global', () => {
    expect(renderPlain(fixtureInventory(), { globalOnly: true })).toMatchSnapshot();
  });
  it('--provenance', () => {
    expect(renderPlain(fixtureInventory(), { provenance: true })).toMatchSnapshot();
  });
});

describe('renderJson characterization', () => {
  it('is exactly JSON.stringify(inv, null, 2) and round-trips', () => {
    const inv = fixtureInventory();
    const out = renderJson(inv);
    expect(out).toBe(JSON.stringify(inv, null, 2));
    expect(JSON.parse(out)).toEqual(inv);
  });
});
```

- [ ] **Step 2: Run — snapshots are written on first run**

Run: `npx vitest run test/render-output.test.ts`
Expected: 5 tests PASS, "4 snapshots written". Open `test/__snapshots__/render-output.test.ts.snap` and eyeball it: the default report must show the GLOBAL section, a `.config` group with `tool`, a `Developer/Projects` group with `full` (showing `+` lines) and `quiet  global only`; no ANSI escape codes anywhere (if you see `[` codes, the NO_COLOR ordering is broken — fix before continuing).

- [ ] **Step 3: Run the whole suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: 135 tests pass (130 + 5), no type errors.

- [ ] **Step 4: Commit**

```bash
git add test/render-output.test.ts test/__snapshots__/render-output.test.ts.snap
git commit -m "test: characterization snapshots for renderPlain/renderJson"
```

---

### Task 2: Adapter collectForDirectory coverage

**Files:**
- Test (create): `test/adapters-dir.test.ts`
- Test (modify): `test/claude-code.test.ts` (three additions at the end of the file)

**Interfaces:**
- Consumes: `test/helpers.ts` (`makeTempHome`, `cleanup`, `ctxOf`, `writeFileEnsured`, `writeSkillDir`), adapters' public `collectForDirectory`/`collectGlobal`.
- Produces: coverage that protects Tasks 19–20's claude-code refactors and Task 7's codex change.

- [ ] **Step 1: Write test/adapters-dir.test.ts**

```ts
// test/adapters-dir.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup, ctxOf, writeFileEnsured, writeSkillDir } from './helpers.js';
import { codexAdapter } from '../src/adapters/codex.js';
import { geminiAdapter } from '../src/adapters/gemini.js';
import { opencodeAdapter } from '../src/adapters/opencode.js';

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

describe('codex collectForDirectory', () => {
  it('scans .codex/skills as project-scoped', () => {
    home = makeTempHome();
    const proj = join(home, 'proj');
    writeSkillDir(join(proj, '.codex', 'skills'), 'proj-skill');
    const d = codexAdapter.collectForDirectory(proj, ctxOf(home), []);
    const s = d.skills.find((x) => x.name === 'proj-skill')!;
    expect(s.scope).toBe('project-scoped');
    expect(s.provider.kind).toBe('project-local');
  });
});

describe('gemini collectForDirectory', () => {
  it('reads .gemini/settings.json mcp + .gemini/skills', () => {
    home = makeTempHome();
    const proj = join(home, 'proj');
    writeFileEnsured(
      join(proj, '.gemini', 'settings.json'),
      JSON.stringify({ mcpServers: { g1: { httpUrl: 'https://p/mcp' } } }),
    );
    writeSkillDir(join(proj, '.gemini', 'skills'), 'gs');
    const d = geminiAdapter.collectForDirectory(proj, ctxOf(home), []);
    const m = d.mcp.find((x) => x.name === 'g1')!;
    expect(m.transport.kind).toBe('http'); // httpUrl => http (footgun invariant)
    expect(m.scope).toBe('project-scoped');
    expect(d.skills.map((s) => s.name)).toContain('gs');
  });
});

describe('opencode collectForDirectory', () => {
  it('reads project opencode.json `mcp` key + .opencode/skills; splits command array', () => {
    home = makeTempHome();
    const proj = join(home, 'proj');
    writeFileEnsured(
      join(proj, 'opencode.json'),
      JSON.stringify({ mcp: { o1: { type: 'local', command: ['bun', 'x', 'srv'], environment: { KEY: 'v' } } } }),
    );
    writeSkillDir(join(proj, '.opencode', 'skills'), 'op-skill');
    const d = opencodeAdapter.collectForDirectory(proj, ctxOf(home), []);
    const m = d.mcp.find((x) => x.name === 'o1')!;
    expect(m.transport.kind).toBe('stdio');
    expect(m.transport.command).toBe('bun');
    expect(m.transport.args).toEqual(['x', 'srv']); // command array split
    expect(m.transport.envKeys).toEqual(['KEY']); // names only (privacy)
    expect(d.skills.map((s) => s.name)).toContain('op-skill');
  });
});
```

- [ ] **Step 2: Add three claude-code cases at the end of test/claude-code.test.ts**

```ts
describe('claude-code adapter: coverage extras', () => {
  it('plugin with no settings entry and no defaultEnabled is enabled by default', () => {
    const { home: h } = buildHome();
    home = h;
    // delta: registry entry + minimal manifest (no defaultEnabled), no settings entry
    writeFileEnsured(
      join(h, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: { 'delta@official': [{ scope: 'user', installPath: cacheDir(h, 'delta'), version: '1.0.0' }] },
      }),
    );
    writeFileEnsured(join(cacheDir(h, 'delta'), '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'delta' }));
    const g = claudeCodeAdapter.collectGlobal(ctxOf(h), []);
    expect(g.plugins.find((p) => p.id === 'delta@official')!.enabled).toBe(true);
  });

  it('gemini-extension.json marks gemini-cli support', () => {
    const { home: h } = buildHome();
    home = h;
    writeFileEnsured(join(cacheDir(h, 'alpha'), 'gemini-extension.json'), JSON.stringify({ name: 'alpha' }));
    const g = claudeCodeAdapter.collectGlobal(ctxOf(h), []);
    expect(g.plugins.find((p) => p.id === 'alpha@official')!.supportsRuntimes).toContain('gemini-cli');
  });

  it('merges manifest mcpServers with the .mcp.json sidecar', () => {
    const { home: h } = buildHome();
    home = h;
    writeFileEnsured(
      join(cacheDir(h, 'alpha'), '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'alpha', mcpServers: { fromManifest: {} } }),
    );
    const g = claudeCodeAdapter.collectGlobal(ctxOf(h), []);
    const provides = g.plugins.find((p) => p.id === 'alpha@official')!.provides.mcpServers;
    expect(provides).toContain('fromManifest');
    expect(provides).toContain('srv'); // sidecar (from buildHome)
  });
});
```

Note: the first extra test overwrites `installed_plugins.json` after `buildHome()` — that is intended; it isolates the delta plugin.

- [ ] **Step 3: Run**

Run: `npx vitest run test/adapters-dir.test.ts test/claude-code.test.ts`
Expected: all PASS (3 new dir tests + 3 new claude extras + 4 existing).

- [ ] **Step 4: Full suite + commit**

```bash
npm test && npm run typecheck
git add test/adapters-dir.test.ts test/claude-code.test.ts
git commit -m "test: collectForDirectory + claude-code branch coverage"
```

---

### Task 3: resolve unit tests + tree/scroll/decideMode edge cases

**Files:**
- Test (create): `test/resolve.test.ts`
- Test (modify): `test/tree.test.ts`, `test/scroll.test.ts`, `test/cli.test.ts` (one case each)

**Interfaces:**
- Consumes: `mergeBuckets`, `splitByScope`, `bucketCounts` from `src/resolve.js`; `buildFolderRows` from tree; `scrollWindow` from scroll; `decideMode` from cli.
- Produces: `test/resolve.test.ts`, which Task 9 extends with `bucketTotal` and Task 10's engine test complements.

- [ ] **Step 1: Write test/resolve.test.ts**

```ts
// test/resolve.test.ts
import { describe, it, expect } from 'vitest';
import { mergeBuckets, splitByScope, bucketCounts } from '../src/resolve.js';
import { emptyBucket } from '../src/types.js';
import type { Bucket, SkillRecord } from '../src/types.js';

function sk(over: Partial<SkillRecord>): SkillRecord {
  return {
    name: 'a', contentId: 'c1',
    provider: { kind: 'user', path: '/p/a' },
    usedBy: [], enabled: true, scope: 'global',
    ...over,
  };
}
const withSkills = (...skills: SkillRecord[]): Bucket => ({ ...emptyBucket(), skills });

describe('mergeBuckets skill precedence (PROVIDER_RANK)', () => {
  it('higher-ranked provider wins regardless of order', () => {
    const user = sk({ provider: { kind: 'user', path: '/p/a' } });
    const shared = sk({ provider: { kind: 'shared-store', path: '/hub/a' } });
    expect(mergeBuckets(withSkills(user), withSkills(shared)).skills[0]!.provider.kind).toBe('shared-store');
    expect(mergeBuckets(withSkills(shared), withSkills(user)).skills[0]!.provider.kind).toBe('shared-store');
  });

  it('unions usedBy sorted', () => {
    const a = sk({ usedBy: ['codex', 'claude-code'] });
    const b = sk({ usedBy: ['warp', 'codex'] });
    expect(mergeBuckets(withSkills(a), withSkills(b)).skills[0]!.usedBy).toEqual(['claude-code', 'codex', 'warp']);
  });

  it('backfills description and bundledInPlugin from the losing record', () => {
    const winner = sk({ provider: { kind: 'shared-store', path: '/hub/a' } }); // no description
    const loser = sk({ description: 'from loser', bundledInPlugin: 'pl@m' });
    const merged = mergeBuckets(withSkills(loser), withSkills(winner)).skills[0]!;
    expect(merged.provider.kind).toBe('shared-store');
    expect(merged.description).toBe('from loser');
    expect(merged.bundledInPlugin).toBe('pl@m');
  });

  it('does not mutate input records (copies on insert)', () => {
    const a = sk({ usedBy: ['claude-code'] });
    mergeBuckets(withSkills(a), withSkills(sk({ usedBy: ['codex'] })));
    expect(a.usedBy).toEqual(['claude-code']);
  });
});

describe('mergeBuckets mcp identity', () => {
  it('same name+scope but different provider path both survive', () => {
    const mk = (path: string) => ({
      ...emptyBucket(),
      mcp: [{
        name: 'srv', transport: { kind: 'stdio' as const }, scope: 'global' as const,
        enabled: true, provider: { kind: 'user' as const, path },
      }],
    });
    expect(mergeBuckets(mk('/a.json'), mk('/b.json')).mcp).toHaveLength(2);
  });
});

describe('splitByScope', () => {
  it('routes local skills/mcp to local; all plugins to projectScoped', () => {
    const bucket: Bucket = {
      skills: [sk({ scope: 'local' }), sk({ contentId: 'c2', scope: 'project-scoped' })],
      plugins: [{
        id: 'p@m', name: 'p', marketplace: 'm', version: '1', scope: 'user', enabled: true,
        provides: { skills: [], commands: [], agents: [], mcpServers: [] }, supportsRuntimes: [],
      }],
      mcp: [{
        name: 'l', transport: { kind: 'stdio' }, scope: 'local', enabled: true,
        provider: { kind: 'project-local', path: '/x' },
      }],
    };
    const { projectScoped, local } = splitByScope(bucket);
    expect(local.skills).toHaveLength(1);
    expect(local.mcp).toHaveLength(1);
    expect(projectScoped.skills).toHaveLength(1);
    expect(projectScoped.plugins).toHaveLength(1);
    expect(bucketCounts(local)).toEqual({ skills: 1, plugins: 0, mcp: 1 });
  });
});
```

- [ ] **Step 2: Add the three edge cases**

In `test/tree.test.ts` (the file's local `folder(path, delta?, runtimes?)` helper builds a FolderReport — verified):

```ts
it('renders folders outside homeRoot flat by full path', () => {
  const rows = buildFolderRows(
    [folder('/srv/elsewhere/app')],
    '/home/u',
    { sort: 'items', showHidden: false, collapsed: new Set() },
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]!.label).toBe('/srv/elsewhere/app');
  expect(rows[0]!.depth).toBe(0);
});
```

In `test/scroll.test.ts`:

```ts
it('height === length shows everything (boundary of the short-circuit)', () => {
  expect(scrollWindow(5, 5, 3)).toEqual({ start: 0, end: 5 });
});
```

In `test/cli.test.ts`:

```ts
it('watch wins over --report when both are given', () => {
  expect(decideMode(flags({ watch: true, report: true }), false)).toBe('dashboard');
});
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run test/resolve.test.ts test/tree.test.ts test/scroll.test.ts test/cli.test.ts
npm test && npm run typecheck
git add test/resolve.test.ts test/tree.test.ts test/scroll.test.ts test/cli.test.ts
git commit -m "test: resolver precedence + tree/scroll/decideMode edges"
```

---

### Task 4: CLI argument hardening + error boundary (bug fixes CLI-3/CLI-5 + spec'd warnings CLI-6)

**Files:**
- Modify: `src/cli.ts`
- Test (modify): `test/cli.test.ts`

**Interfaces:**
- Produces: exported `parseArgs(argv: string[]): Args` where `Args` gains `issues: string[]` (non-fatal, printed as `warning:` on stderr) and `errors: string[]` (fatal, printed as `error:`, exit code 1). Filter semantics unchanged: unknown `--runtime` values are still pushed (still yield empty output — now with a warning); invalid `--kind` values are still dropped.

- [ ] **Step 1: Write failing tests (append to test/cli.test.ts)**

```ts
import { parseArgs } from '../src/cli.js';

describe('parseArgs hardening', () => {
  it('--dir does not swallow a following flag; missing path is a fatal error', () => {
    const a = parseArgs(['--dir', '--json']);
    expect(a.dir).toBeUndefined();
    expect(a.json).toBe(true); // --json parsed as its own flag
    expect(a.errors).toEqual(['--dir requires a path']);
    expect(parseArgs(['--dir']).errors).toEqual(['--dir requires a path']);
    expect(parseArgs(['--dir', '/tmp/x']).dir).toBe('/tmp/x');
  });

  it('unknown tokens produce warnings, not silence', () => {
    const a = parseArgs(['--repot', 'stray']);
    expect(a.issues).toEqual(['unknown option: --repot', 'unknown option: stray']);
    expect(a.report).toBe(false);
  });

  it('invalid --kind values warn and are dropped (filter behavior unchanged)', () => {
    const a = parseArgs(['--kind', 'skil,mcp']);
    expect(a.kinds).toEqual(['mcp']);
    expect(a.issues).toEqual(['unknown kind: skil (expected skill|plugin|mcp)']);
  });

  it('unknown --runtime ids warn but are still applied', () => {
    const a = parseArgs(['--runtime', 'bogus', 'claude-code']);
    expect(a.runtimes).toEqual(['bogus', 'claude-code']);
    expect(a.issues).toEqual(['unknown runtime: bogus']);
  });

  it('clean invocations carry no issues or errors', () => {
    const a = parseArgs(['--report', '--kind', 'skill', '--runtime', 'codex']);
    expect(a.issues).toEqual([]);
    expect(a.errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL — `parseArgs` is not exported.

- [ ] **Step 3: Implement in src/cli.ts**

Export the `Args` interface and `parseArgs`; add `issues`/`errors`; guard `--dir`; add a `default` case; validate `--kind`/`--runtime` values. Add `runtimeById` to the imports:

```ts
import { runtimeById } from './runtimes.js';
```

```ts
export interface Args {
  watch: boolean;
  json: boolean;
  report: boolean;
  full: boolean;
  provenance: boolean;
  global: boolean;
  noWalk: boolean;
  help: boolean;
  dir?: string;
  runtimes: string[];
  kinds: Kind[];
  /** Non-fatal parse problems, printed as `warning:` on stderr. */
  issues: string[];
  /** Fatal parse problems, printed as `error:` on stderr; exit 1. */
  errors: string[];
}
```

```ts
const KIND_SET = new Set<string>(KINDS);

export function parseArgs(argv: string[]): Args {
  const a: Args = {
    watch: false, json: false, report: false, full: false, provenance: false,
    global: false, noWalk: false, help: false, runtimes: [], kinds: [],
    issues: [], errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case 'watch': a.watch = true; break;
      case '--json': a.json = true; break;
      case '--report': a.report = true; break;
      case '--full': a.full = true; break;
      case '--provenance': a.provenance = true; break;
      case '--global': a.global = true; break;
      case '--no-walk': a.noWalk = true; break;
      case '--help': case '-h': a.help = true; break;
      case '--dir':
        if (i + 1 < argv.length && !isFlag(argv[i + 1])) a.dir = argv[++i];
        else a.errors.push('--dir requires a path');
        break;
      case '--runtime':
        while (i + 1 < argv.length && !isFlag(argv[i + 1])) {
          const id = argv[++i]!;
          a.runtimes.push(id);
          if (!runtimeById(id)) a.issues.push(`unknown runtime: ${id}`);
        }
        break;
      case '--kind':
        while (i + 1 < argv.length && !isFlag(argv[i + 1])) {
          for (const k of argv[++i]!.split(',')) {
            if (KIND_SET.has(k)) a.kinds.push(k as Kind);
            else a.issues.push(`unknown kind: ${k} (expected skill|plugin|mcp)`);
          }
        }
        break;
      default:
        a.issues.push(`unknown option: ${arg}`);
    }
  }
  return a;
}
```

In `main()`, immediately after `parseArgs`:

```ts
  for (const w of args.issues) process.stderr.write(`warning: ${w}\n`);
  if (args.errors.length) {
    for (const e of args.errors) process.stderr.write(`error: ${e}\n`);
    process.exitCode = 1;
    return;
  }
```

Replace the last line of the file (`void main();`) with the error boundary:

```ts
main().catch((err: unknown) => {
  process.stderr.write(`skillsight: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Verify**

Run: `npx vitest run test/cli.test.ts` → PASS.
Run: `npm test && npm run typecheck` → green (stdout snapshots untouched — warnings go to stderr).
Manual: `npx tsx src/cli.ts --dir --json` prints `error: --dir requires a path` and exits 1 (`echo $?`).

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "fix(cli): --dir flag guard, unknown-token warnings, error boundary"
```

---

### Task 5: enableAllProjectMcpServers honors settings.local.json (bug ADP-1)

**Files:**
- Modify: `src/adapters/claude-code.ts:229-258`
- Test (modify): `test/claude-code.test.ts`

- [ ] **Step 1: Failing test (append inside the collectForDirectory describe)**

```ts
  it('honors enableAllProjectMcpServers from settings.local.json', () => {
    const { home: h, proj } = buildHome();
    home = h;
    writeFileEnsured(
      join(proj, '.claude', 'settings.local.json'),
      JSON.stringify({ enableAllProjectMcpServers: true }),
    );
    const d = claudeCodeAdapter.collectForDirectory(proj, ctxOf(h), []);
    const mcp = Object.fromEntries(d.mcp.map((m) => [m.name, m]));
    expect(mcp.pendingSrv!.enabled).toBe(true); // was false: flag only read from settings.json
  });
```

Run: `npx vitest run test/claude-code.test.ts` → the new test FAILS (`pendingSrv.enabled` is `false`).

- [ ] **Step 2: Implement**

In `collectForDirectory`, read the settings pair once and derive both values. Replace:

```ts
    const projEnabled = mergeEnabled(
      readJson<SettingsFile>(join(dir, '.claude', 'settings.json'), warnings),
      readJson<SettingsFile>(join(dir, '.claude', 'settings.local.json'), warnings),
    );
```

with:

```ts
    const settingsFiles = [
      readJson<SettingsFile>(join(dir, '.claude', 'settings.json'), warnings),
      readJson<SettingsFile>(join(dir, '.claude', 'settings.local.json'), warnings),
    ];
    const projEnabled = mergeEnabled(...settingsFiles);
```

and replace the two `enableAll` lines (`const settingsForDir = readJson…` / `const enableAll = …`) with:

```ts
    const enableAll = settingsFiles.some((f) => f?.enableAllProjectMcpServers === true);
```

- [ ] **Step 3: Verify + commit**

```bash
npx vitest run test/claude-code.test.ts && npm test && npm run typecheck
git add src/adapters/claude-code.ts test/claude-code.test.ts
git commit -m "fix(claude-code): honor enableAllProjectMcpServers from settings.local.json"
```

---

### Task 6: Plugin-bundled skills read SKILL.md frontmatter (bug ADP-3)

**Files:**
- Modify: `src/adapters/claude-code.ts:150-162`
- Test (modify): `test/claude-code.test.ts`

- [ ] **Step 1: Failing test (append inside the collectGlobal describe)**

```ts
  it('plugin-bundled skills read SKILL.md frontmatter (name + description)', () => {
    const { home: h } = buildHome();
    home = h;
    writeSkillDir(join(cacheDir(h, 'alpha'), 'skills'), 'fancy', {
      name: 'fancy-pants',
      description: 'Does fancy things',
    });
    const g = claudeCodeAdapter.collectGlobal(ctxOf(h), []);
    const s = g.skills.find((x) => x.bundledInPlugin === 'alpha@official' && x.name === 'fancy-pants');
    expect(s).toBeDefined();
    expect(s!.description).toBe('Does fancy things');
  });
```

Run: FAILS (record is named `fancy`, description undefined).

- [ ] **Step 2: Implement**

Add the import:

```ts
import { readFrontmatterFile } from '../frontmatter.js';
```

Replace the skill construction in `pluginRecordAndSkills`:

```ts
  const skills: SkillRecord[] = skillDirs.map((sName) => {
    const real = realpathSafe(join(installPath, 'skills', sName));
    const fm = readFrontmatterFile(join(installPath, 'skills', sName, 'SKILL.md'));
    return {
      name: typeof fm.name === 'string' ? fm.name : sName,
      description: typeof fm.description === 'string' ? fm.description : undefined,
      contentId: real,
      provider: { kind: 'plugin', pluginId: key, marketplace, marketplaceRepo, path: real },
      usedBy: [],
      bundledInPlugin: key,
      supportsRuntimes,
      enabled,
      scope: plugin.scope === 'project' ? 'project-scoped' : 'global',
    };
  });
```

Note: `plugin.provides.skills` stays directory names — only the SkillRecord changes. `buildHome`'s `foo` skill has frontmatter name `foo`, so existing assertions (`byName.foo`) still pass.

- [ ] **Step 3: Verify + commit**

```bash
npx vitest run test/claude-code.test.ts && npm test && npm run typecheck
git add src/adapters/claude-code.ts test/claude-code.test.ts
git commit -m "fix(claude-code): plugin-bundled skills read SKILL.md frontmatter"
```

---

### Task 7: Codex skill disable matches directory names (bug ADP-2) + Gemini semantics comment

**Files:**
- Modify: `src/skillscan.ts` (optional `enabledFor` param), `src/adapters/codex.ts`, `src/adapters/gemini.ts` (comment only)
- Test (modify): `test/adapters-m5.test.ts`

**Interfaces:**
- Produces: `scanSkillsDir(dir, ctx, scope, enabledFor?: (dirName: string) => boolean)` — 4th param optional; existing callers unaffected. `enabledFor` receives the DIRECTORY ENTRY name (the symlink/dir name in the scanned dir), not the frontmatter name.

- [ ] **Step 1: Failing test (append inside the codex describe in adapters-m5.test.ts)**

```ts
  it('disables by directory name even when frontmatter name differs', () => {
    home = makeTempHome();
    writeFileEnsured(
      join(home, '.codex', 'config.toml'),
      ['[[skills.config]]', 'path = "/somewhere/skills/dir-name"', 'enabled = false', ''].join('\n'),
    );
    writeSkillDir(join(home, '.codex', 'skills'), 'dir-name', { name: 'pretty-name' });
    const g = codexAdapter.collectGlobal(ctxOf(home), []);
    const s = g.skills.find((x) => x.name === 'pretty-name')!;
    expect(s.enabled).toBe(false); // was true: disable set holds dir basenames, match used frontmatter name
  });
```

Run: FAILS (`enabled` is `true`).

- [ ] **Step 2: Implement**

`src/skillscan.ts` — extend `scanSkillsDir`:

```ts
export function scanSkillsDir(
  dir: string,
  ctx: HomeCtx,
  scope: Scope,
  /** Enablement by DIRECTORY entry name (e.g. Codex `[[skills.config]]` stores paths, matched by basename). */
  enabledFor?: (dirName: string) => boolean,
): SkillRecord[] {
  const out: SkillRecord[] = [];
  for (const e of readDirEntries(dir)) {
    if (e.name.startsWith('.')) continue;
    if (!e.isDir && !e.isSymlink) continue;
    const linkPath = join(dir, e.name);
    const real = realpathSafe(linkPath);
    if (!isDir(real)) continue;
    const fm = readFrontmatterFile(join(linkPath, 'SKILL.md'));
    out.push({
      name: typeof fm.name === 'string' ? fm.name : e.name,
      description: typeof fm.description === 'string' ? fm.description : undefined,
      contentId: real,
      provider: providerForRealpath(real, ctx, scope),
      usedBy: [],
      enabled: enabledFor ? enabledFor(e.name) : true,
      scope,
    });
  }
  return out;
}
```

`src/adapters/codex.ts` — `scanSystemSkills` gains the same param; the post-hoc mutation loop dies:

```ts
function scanSystemSkills(
  systemDir: string,
  ctx: HomeCtx,
  enabledFor: (dirName: string) => boolean,
): SkillRecord[] {
  const out: SkillRecord[] = [];
  for (const e of readDirEntries(systemDir)) {
    if (e.name.startsWith('.') || (!e.isDir && !e.isSymlink)) continue;
    const real = realpathSafe(join(systemDir, e.name));
    const fm = readFrontmatterFile(join(systemDir, e.name, 'SKILL.md'));
    out.push({
      name: typeof fm.name === 'string' ? fm.name : e.name,
      description: typeof fm.description === 'string' ? fm.description : undefined,
      contentId: real,
      provider: { kind: 'runtime-builtin', path: real },
      usedBy: [],
      enabled: enabledFor(e.name),
      scope: 'global',
    });
  }
  return out;
}
```

and in `collectGlobal` replace the skills block:

```ts
    // skills: user dir (symlinks -> hub) + bundled .system.
    // `[[skills.config]]` stores PATHS; disablement matches the directory name.
    const disabled = disabledSkillNames(config);
    const enabledFor = (dirName: string) => !disabled.has(dirName);
    bucket.skills.push(
      ...scanSkillsDir(join(home, 'skills'), ctx, 'global', enabledFor),
      ...scanSystemSkills(join(home, 'skills', '.system'), ctx, enabledFor),
    );
```

`src/adapters/gemini.ts` — comment only, above the `disabled` loop in `collectGlobal`:

```ts
    // Gemini's `/skills disable <name>` stores skill NAMES (frontmatter-derived),
    // so matching `s.name` is correct here — unlike Codex, which stores paths.
```

- [ ] **Step 3: Verify + commit**

The existing `migrate-to-codex` disable test still passes (dir name == frontmatter name there).

```bash
npx vitest run test/adapters-m5.test.ts && npm test && npm run typecheck
git add src/skillscan.ts src/adapters/codex.ts src/adapters/gemini.ts test/adapters-m5.test.ts
git commit -m "fix(codex): match skill disablement by directory name, not frontmatter name"
```

---

### Task 8: Frontmatter closing fence must be exactly `---` (bug ENG-3)

**Files:**
- Modify: `src/frontmatter.ts:18-30`
- Test (create): `test/frontmatter.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// test/frontmatter.test.ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, readFrontmatterFile } from '../src/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses a standard fenced block', () => {
    expect(parseFrontmatter('---\nname: a\ndescription: b\n---\nbody')).toEqual({ name: 'a', description: 'b' });
  });
  it('a ---- underline is NOT a closing fence', () => {
    // Was {name:'a'} with the lax indexOf('\n---') match — the block is actually unterminated.
    expect(parseFrontmatter('---\nname: a\n----\nbody')).toEqual({});
  });
  it('accepts a fence at EOF with no trailing newline', () => {
    expect(parseFrontmatter('---\nname: a\n---')).toEqual({ name: 'a' });
  });
  it('accepts CRLF line endings', () => {
    expect(parseFrontmatter('---\r\nname: a\r\n---\r\nbody')).toEqual({ name: 'a' });
  });
  it('tolerates absence/malformation: {} fallbacks', () => {
    expect(parseFrontmatter('no fence at all')).toEqual({});
    expect(parseFrontmatter('---\nnever closed')).toEqual({});
    expect(parseFrontmatter('---\n[not: valid: yaml\n---\nbody')).toEqual({});
  });
  it('readFrontmatterFile returns {} for a missing file', () => {
    expect(readFrontmatterFile('/nonexistent/SKILL.md')).toEqual({});
  });
});
```

Run: `npx vitest run test/frontmatter.test.ts` — the `----` case FAILS (returns `{name:'a'}`).

- [ ] **Step 2: Implement**

Replace the fence detection in `parseFrontmatter`:

```ts
export function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith('---')) return {};
  // Closing fence: a line that is exactly `---` (tolerating \r\n and EOF).
  const m = /\r?\n---(?:\r?\n|$)/.exec(content.slice(3));
  if (!m) return {};
  const raw = content.slice(3, 3 + m.index).replace(/^\r?\n/, '');
  try {
    const data = parse(raw);
    return data && typeof data === 'object' ? (data as Frontmatter) : {};
  } catch {
    return {};
  }
}
```

- [ ] **Step 3: Verify + commit**

```bash
npx vitest run test/frontmatter.test.ts && npm test && npm run typecheck
git add src/frontmatter.ts test/frontmatter.test.ts
git commit -m "fix(frontmatter): closing fence must be exactly ---"
```

---

### Task 9: Shared bucketTotal kills the plain.ts delta drift (bug CLI-2)

**Files:**
- Modify: `src/resolve.ts` (add export), `src/render/ink/tree.ts:38-43`, `src/render/plain.ts:73-75`
- Test (modify): `test/resolve.test.ts`

**Interfaces:**
- Produces: `bucketTotal(b: Bucket): number` exported from `src/resolve.js` — total record count of a bucket. Consumed here by tree + plain; nothing else.

- [ ] **Step 1: Failing test (append to test/resolve.test.ts)**

```ts
import { bucketTotal } from '../src/resolve.js';

describe('bucketTotal', () => {
  it('sums skills + plugins + mcp', () => {
    const b = {
      skills: [sk({}), sk({ contentId: 'c2' })],
      plugins: [],
      mcp: [{
        name: 'm', transport: { kind: 'stdio' as const }, scope: 'global' as const,
        enabled: true, provider: { kind: 'user' as const, path: '/x' },
      }],
    };
    expect(bucketTotal(b)).toBe(3);
    expect(bucketTotal(emptyBucket())).toBe(0);
  });
});
```

Run: FAILS (no export).

- [ ] **Step 2: Implement**

`src/resolve.ts`, below `bucketCounts`:

```ts
/** Total record count of a bucket (skills + plugins + mcp). */
export function bucketTotal(b: Bucket): number {
  const c = bucketCounts(b);
  return c.skills + c.plugins + c.mcp;
}
```

`src/render/ink/tree.ts` — replace `ownDelta`'s body (and its `bucketCounts` import if now unused):

```ts
import { bucketTotal } from '../../resolve.js';
```
```ts
/** project-scoped ∪ local item count — what a folder adds beyond the global layer. */
function ownDelta(f: FolderReport): number {
  return bucketTotal(f.projectScoped) + bucketTotal(f.local);
}
```

`src/render/plain.ts` — replace the inline delta (which omitted `local.plugins` — latent today since `splitByScope` routes all plugins to projectScoped, so output is provably unchanged):

```ts
import { bucketCounts, bucketTotal } from '../resolve.js';
```
```ts
    const delta = bucketTotal(f.projectScoped) + bucketTotal(f.local);
```

- [ ] **Step 3: Verify + commit**

Snapshots from Task 1 must be UNCHANGED (this is the parity proof for the latent fix).

```bash
npm test && npm run typecheck
git add src/resolve.ts src/render/ink/tree.ts src/render/plain.ts test/resolve.test.ts
git commit -m "refactor: shared bucketTotal replaces drifted per-renderer delta sums"
```

---

### Task 10: Hub-direct skill visibility (spec'd change #1, ENG-1)

**Files:**
- Modify: `src/resolve.ts` (new `sharedStoreBucket`), `src/index.ts:67-69`
- Test (modify): `test/engine.test.ts`

**Interfaces:**
- Consumes: `SharedSkill` (sharedstore), `EnrichContext`, `lookupUsedBy`, module-private `universalUsedBy`.
- Produces: `sharedStoreBucket(shared: SharedSkill[], enr: EnrichContext): Bucket` exported from `src/resolve.js`. NO owner fallback: a hub skill with no symlinks and no universal lock agents gets `usedBy: []`.

- [ ] **Step 1: Failing tests (append to test/engine.test.ts)**

```ts
  it('surfaces hub-direct-only skills (no symlinks) with usedBy from lock universal agents', () => {
    home = makeTempHome();
    writeSkillDir(join(home, '.agents', 'skills'), 'hubonly', { description: 'Hub only' });
    writeFileEnsured(
      join(home, '.agents', '.skill-lock.json'),
      JSON.stringify({
        version: 3,
        skills: { hubonly: { source: 'o/r', sourceUrl: 'https://github.com/o/r', skillFolderHash: 'hh' } },
        lastSelectedAgents: ['warp', 'zed'],
      }),
    );
    const inv = scan(home, { walk: false, env: {} });
    const s = inv.global.skills.find((x) => x.name === 'hubonly');
    expect(s).toBeDefined();
    expect(s!.provider.kind).toBe('shared-store');
    expect(s!.contentId).toBe('hh');
    expect(s!.description).toBe('Hub only');
    expect(s!.usedBy).toEqual(['warp', 'zed']);
  });

  it('hub skill with no symlinks and no universal agents reports usedBy [] (no owner fallback)', () => {
    home = makeTempHome();
    writeSkillDir(join(home, '.agents', 'skills'), 'idle');
    const inv = scan(home, { walk: false, env: {} });
    const s = inv.global.skills.find((x) => x.name === 'idle');
    expect(s).toBeDefined();
    expect(s!.usedBy).toEqual([]);
  });
```

Run: `npx vitest run test/engine.test.ts` → both FAIL (skills absent from `inv.global`).

- [ ] **Step 2: Implement**

`src/resolve.ts` — add (below `enrichBucket`):

```ts
/**
 * Every hub skill as a `shared-store` SkillRecord — including hub-direct-only
 * skills that no runtime symlinks (e.g. installed for warp/zed/cline only).
 * No owner fallback: an unused hub skill honestly reports `usedBy: []`.
 */
export function sharedStoreBucket(shared: SharedSkill[], enr: EnrichContext): Bucket {
  const skills: SkillRecord[] = shared.map((info) => {
    const used = new Set<Runtime>(lookupUsedBy(enr.reverseIndex, info.realPath));
    for (const u of universalUsedBy(enr.lastSelectedAgents)) used.add(u);
    return {
      name: info.name,
      description: info.description,
      contentId: info.contentId,
      provider: {
        kind: 'shared-store',
        path: info.realPath,
        source: info.source,
        sourceUrl: info.sourceUrl,
        skillFolderHash: info.skillFolderHash,
      },
      usedBy: [...used].sort(),
      enabled: true,
      scope: 'global',
    };
  });
  return { ...emptyBucket(), skills };
}
```

`src/index.ts` — merge it LAST so records that already exist today are byte-identical (`mergeSkill` keeps the earlier record on rank ties, unions `usedBy` — which is already identical for hub copies — and backfills description; hub-direct-only records simply append):

```ts
import { enrichBucket, mergeBuckets, sharedStoreBucket, splitByScope, type EnrichContext } from './resolve.js';
```
```ts
  const global = mergeBuckets(
    ...active.map((a) => tagBucket(enrichBucket(a.collectGlobal(ctx, warnings), a.id, enr), a.id)),
    sharedStoreBucket(shared.skills, enr),
  );
```

- [ ] **Step 3: Verify**

Run: `npx vitest run test/engine.test.ts` → PASS, including the existing dedupe test (`shared1` still appears exactly once — the hub copy merges into the adapter copy).
Run: `npm test && npm run typecheck` → green. Task 1 snapshots are unaffected (fixture inventory is constructed, not scanned).

- [ ] **Step 4: Commit**

```bash
git add src/resolve.ts src/index.ts test/engine.test.ts
git commit -m "feat(engine): surface hub-direct-only skills from the shared store"
```

---

### Task 11: Plain report hides dot-path folders (spec'd change #2, CLI-4a)

**Files:**
- Create: `src/render/hidden.ts`
- Modify: `src/render/ink/tree.ts:33-36`, `src/render/plain.ts`
- Test (create): `test/hidden.test.ts`; snapshot update in `test/__snapshots__/render-output.test.ts.snap`

**Interfaces:**
- Produces: `isHiddenPath(relPath: string): boolean` and `isHiddenFolder(path: string, homeRoot: string): boolean` from `src/render/hidden.js`. `tree.ts` re-exports `isHiddenPath` so `test/tree.test.ts` imports keep working.

- [ ] **Step 1: Write test/hidden.test.ts**

```ts
// test/hidden.test.ts
import { describe, it, expect } from 'vitest';
import { isHiddenPath, isHiddenFolder } from '../src/render/hidden.js';

describe('isHiddenPath', () => {
  it('hides any path with a dot segment', () => {
    expect(isHiddenPath('.config/tool')).toBe(true);
    expect(isHiddenPath('Developer/.secret/x')).toBe(true);
    expect(isHiddenPath('Developer/Projects/app')).toBe(false);
  });
});

describe('isHiddenFolder', () => {
  it('applies the dot-segment rule home-relatively', () => {
    expect(isHiddenFolder('/home/u/.config/tool', '/home/u')).toBe(true);
    expect(isHiddenFolder('/home/u/Developer/app', '/home/u')).toBe(false);
  });
  it('folders outside homeRoot are never hidden', () => {
    expect(isHiddenFolder('/srv/.weird/app', '/home/u')).toBe(false);
  });
});
```

Run: FAILS (module missing).

- [ ] **Step 2: Create src/render/hidden.ts and rewire**

```ts
// src/render/hidden.ts
/**
 * Shared "hidden folder" predicate — the dashboard's `.`-toggle default and the
 * plain report use the same rule so the two default views agree.
 */
import { relative, sep } from 'node:path';

/** A home-relative path is hidden if any segment starts with '.'. */
export function isHiddenPath(relPath: string): boolean {
  return relPath.split('/').some((seg) => seg.startsWith('.'));
}

/** Absolute-path variant: folders outside `homeRoot` are never hidden. */
export function isHiddenFolder(path: string, homeRoot: string): boolean {
  const rel = relative(homeRoot, path);
  if (!rel || rel.startsWith('..')) return false;
  return isHiddenPath(rel.split(sep).join('/'));
}
```

`src/render/ink/tree.ts` — delete the local `isHiddenPath` definition (lines 33-36) and replace with:

```ts
import { isHiddenPath } from '../hidden.js';
export { isHiddenPath };
```

`src/render/plain.ts` — filter folders (default AND `--full`; plain has no toggle) and count the visible set:

```ts
import { isHiddenFolder } from './hidden.js';
```

In `renderPlain`, replace `const folderCount = inv.folders.length;` with:

```ts
  const folders = inv.folders.filter((f) => !isHiddenFolder(f.path, inv.homeRoot));
  const folderCount = folders.length;
```

and change the loop header `for (const f of inv.folders) {` to `for (const f of folders) {`.

- [ ] **Step 3: Update snapshots deliberately**

Run: `npx vitest run test/render-output.test.ts` → default + `--full` + `--provenance` snapshots FAIL (the `.config` group and `tool` folder disappear; folder count drops 3 → 2).
Inspect that the diff is EXACTLY that, then: `npx vitest run test/render-output.test.ts -u`.

- [ ] **Step 4: Verify + commit**

```bash
npm test && npm run typecheck
git add src/render/hidden.ts src/render/ink/tree.ts src/render/plain.ts test/hidden.test.ts test/__snapshots__/render-output.test.ts.snap
git commit -m "feat(plain): hide dot-path folders, matching the dashboard default"
```

---

### Task 12: --provenance expands MCP lines (spec'd change #4, CLI-7)

**Files:**
- Modify: `src/render/plain.ts:37-47`
- Test: snapshot update in `test/__snapshots__/render-output.test.ts.snap`

- [ ] **Step 1: Implement**

Replace `mcpLine` and its call in `renderBucket`:

```ts
function mcpLine(m: McpRecord, prov: boolean, prefix: string): string {
  const off = m.enabled ? '' : pc.red(' (pending/disabled)');
  const t = m.transport;
  let extra = '';
  if (prov) {
    const bits: string[] = [];
    if (t.command) bits.push([t.command, ...(t.args ?? [])].join(' '));
    if (t.url) bits.push(t.url);
    // PRIVACY: key NAMES only — the records never carry env/header values.
    if (t.envKeys?.length) bits.push(`env keys: ${t.envKeys.join(', ')}`);
    if (t.headerKeys?.length) bits.push(`header keys: ${t.headerKeys.join(', ')}`);
    bits.push(`scope: ${m.scope}`);
    extra = pc.dim(`\n      ${bits.join(' · ')}`);
  }
  return `${prefix}${m.name} ${pc.dim(`[mcp ${t.kind}]`)}${off}${extra}`;
}
```

```ts
  for (const m of b.mcp) lines.push(mcpLine(m, !!opts.provenance, `${prefix}`));
```

- [ ] **Step 2: Update the provenance snapshot deliberately**

Run: `npx vitest run test/render-output.test.ts` → only the `--provenance` snapshot fails. Inspect: each mcp line gains one indented detail line (`npx -y srv · env keys: API_KEY · scope: global` for stdio-srv; `https://example.com/mcp · header keys: Authorization · scope: global` for http-srv). Then `-u`.

- [ ] **Step 3: Verify + commit**

```bash
npm test && npm run typecheck
git add src/render/plain.ts test/__snapshots__/render-output.test.ts.snap
git commit -m "feat(plain): --provenance expands MCP transport detail (key names only)"
```

---

### Task 13: Tabs single source of truth (CMP-2)

**Files:**
- Create: `src/render/ink/tabs.ts`
- Modify: `src/render/ink/TabBar.tsx`, `src/render/ink/App.tsx`
- Test (create): `test/tabs.test.ts`

**Interfaces:**
- Produces: from `src/render/ink/tabs.js`: `type TabId = 'folders' | 'global' | 'leaderboard'`, `TABS: { id: TabId; key: string; label: string }[]`, `tabForKey(input: string): TabId | undefined`, `nextTab(current: TabId, dir: 1 | -1): TabId`. `TabId` moves here; App.tsx is the only importer of the old location (verified by grep).

- [ ] **Step 1: Failing test**

```ts
// test/tabs.test.ts
import { describe, it, expect } from 'vitest';
import { TABS, tabForKey, nextTab } from '../src/render/ink/tabs.js';

describe('tabs', () => {
  it('defines exactly three tabs with unique ids and number keys', () => {
    expect(TABS.map((t) => t.id)).toEqual(['folders', 'global', 'leaderboard']);
    expect(TABS.map((t) => t.key)).toEqual(['1', '2', '3']);
  });
  it('tabForKey maps number keys and rejects everything else', () => {
    expect(tabForKey('2')).toBe('global');
    expect(tabForKey('9')).toBeUndefined();
    expect(tabForKey('f')).toBeUndefined();
  });
  it('nextTab cycles forward and backward with wrapping', () => {
    expect(nextTab('folders', 1)).toBe('global');
    expect(nextTab('leaderboard', 1)).toBe('folders');
    expect(nextTab('folders', -1)).toBe('leaderboard');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/render/ink/tabs.ts
/** Single source of truth for the tab set: order, number keys, labels. */
export type TabId = 'folders' | 'global' | 'leaderboard';

export interface TabDef {
  id: TabId;
  key: string;
  label: string;
}

export const TABS: TabDef[] = [
  { id: 'folders', key: '1', label: 'Folders' },
  { id: 'global', key: '2', label: 'Global' },
  { id: 'leaderboard', key: '3', label: 'Leaderboard' },
];

export function tabForKey(input: string): TabId | undefined {
  return TABS.find((t) => t.key === input)?.id;
}

export function nextTab(current: TabId, dir: 1 | -1): TabId {
  const i = TABS.findIndex((t) => t.id === current);
  return TABS[(i + dir + TABS.length) % TABS.length]!.id;
}
```

`TabBar.tsx` — delete its local `TABS` array and `TabId` type; import instead:

```tsx
import { Box, Text } from 'ink';
import { TABS, type TabId } from './tabs.js';

export function TabBar({ active }: { active: TabId }) {
  // ... unchanged JSX ...
}
```

`App.tsx` — delete the local `const TABS: TabId[]` (line 17); change the import `import { TabBar, type TabId } from './TabBar.js';` to:

```ts
import { TabBar } from './TabBar.js';
import { tabForKey, nextTab, type TabId } from './tabs.js';
```

and replace the tab-switching lines in the first `useInput`:

```ts
    const t = tabForKey(input);
    if (t) setTab(t);
    if (key.tab) setTab((cur) => nextTab(cur, key.shift ? -1 : 1));
```

- [ ] **Step 3: Verify + commit**

```bash
npx vitest run test/tabs.test.ts && npm test && npm run typecheck
git add src/render/ink/tabs.ts src/render/ink/TabBar.tsx src/render/ink/App.tsx test/tabs.test.ts
git commit -m "refactor(ink): single tab source of truth + pure nextTab"
```

---

### Task 14: toAction moves into folderNav.ts; items-switch default arm (CMP-4 + RLG-4)

**Files:**
- Modify: `src/render/ink/folderNav.ts`, `src/render/ink/FoldersView.tsx:16-27`
- Test (modify): `test/folderNav.test.ts`

**Interfaces:**
- Produces: from `folderNav.js`: `type NavKey = Pick<Key, 'upArrow' | 'downArrow' | 'leftArrow' | 'rightArrow' | 'return' | 'escape'>` (Ink's `Key`, type-only import) and `toAction(input: string, key: NavKey): NavAction | null`.

- [ ] **Step 1: Failing tests (append to test/folderNav.test.ts)**

```ts
import { toAction, type NavKey } from '../src/render/ink/folderNav.js';

const keyOf = (over: Partial<NavKey> = {}): NavKey => ({
  upArrow: false, downArrow: false, leftArrow: false, rightArrow: false, return: false, escape: false,
  ...over,
});

describe('toAction', () => {
  it('maps arrows, vim keys, return, and escape', () => {
    expect(toAction('', keyOf({ downArrow: true }))).toBe('down');
    expect(toAction('j', keyOf())).toBe('down');
    expect(toAction('', keyOf({ upArrow: true }))).toBe('up');
    expect(toAction('k', keyOf())).toBe('up');
    expect(toAction('', keyOf({ return: true }))).toBe('enter');
    expect(toAction('', keyOf({ rightArrow: true }))).toBe('right');
    expect(toAction('', keyOf({ leftArrow: true }))).toBe('left');
    expect(toAction('', keyOf({ escape: true }))).toBe('escape');
    expect(toAction('x', keyOf())).toBeNull();
  });
});

describe('items focus is defensive against unknown actions', () => {
  it('clamps and returns state for an unhandled action (no fall-through to the detail switch)', () => {
    // item: 3 with empty rows — the items switch clamps to 0; the detail switch would return state untouched.
    const state = { ...initialNav(), focus: 'items' as const, item: 3 };
    const ctx = { folderRows: [], rows: [] };
    expect(folderNav(state, 'bogus' as never, ctx)).toEqual({ ...state, item: 0 });
  });
});
```

(Adapt imports to the file's existing style — it already imports `folderNav`/`initialNav`.)

Run: FAILS twice — `toAction` is not exported, and the bogus action falls through to the detail switch (which returns `state` with `item` still 3 instead of the items-switch's clamped `item: 0`).

- [ ] **Step 2: Implement**

`folderNav.ts` — add at the top:

```ts
import type { Key } from 'ink';

export type NavKey = Pick<Key, 'upArrow' | 'downArrow' | 'leftArrow' | 'rightArrow' | 'return' | 'escape'>;

/** Keypress → NavAction mapping (pure; lives here so it's testable next to the reducer). */
export function toAction(input: string, key: NavKey): NavAction | null {
  if (key.downArrow || input === 'j') return 'down';
  if (key.upArrow || input === 'k') return 'up';
  if (key.return) return 'enter';
  if (key.rightArrow) return 'right';
  if (key.leftArrow) return 'left';
  if (key.escape) return 'escape';
  return null;
}
```

In the `state.focus === 'items'` switch, add after `case 'escape':`:

```ts
      default:
        return s;
```

`FoldersView.tsx` — delete the local `toAction` (lines 16-27) and import it:

```ts
import { folderNav, initialNav, toAction } from './folderNav.js';
```

- [ ] **Step 3: Verify + commit**

```bash
npx vitest run test/folderNav.test.ts && npm test && npm run typecheck
git add src/render/ink/folderNav.ts src/render/ink/FoldersView.tsx test/folderNav.test.ts
git commit -m "refactor(ink): toAction into folderNav (tested, Ink Key type) + defensive default"
```

---

### Task 15: useListDetail hook dedupes GlobalView/LeaderboardView + empty-list guard (CMP-1 + CMP-9)

**Files:**
- Create: `src/render/ink/listDetail.ts`
- Modify: `src/render/ink/GlobalView.tsx`, `src/render/ink/LeaderboardView.tsx`
- Test (create): `test/listDetail.test.ts`

**Interfaces:**
- Produces: from `listDetail.js`:
  - `listDetailAction(input, key, ctx: { detail: boolean; rowCount: number }): ListDetailAction` — pure, tested; encodes the empty-list guard (`openDetail` requires `rowCount > 0`).
  - `useListDetail(rowCount: number, height: number): { detail: boolean; selected: number; start: number; end: number; onInput: (input: string, key: ListDetailKey) => boolean }` — thin React glue over `useScroll` + the pure mapper; `onInput` returns true when it consumed the key.

- [ ] **Step 1: Failing tests**

```ts
// test/listDetail.test.ts
import { describe, it, expect } from 'vitest';
import { listDetailAction, type ListDetailKey } from '../src/render/ink/listDetail.js';

const keyOf = (over: Partial<ListDetailKey> = {}): ListDetailKey => ({
  escape: false, leftArrow: false, rightArrow: false, upArrow: false, downArrow: false, return: false,
  ...over,
});

describe('listDetailAction — list mode', () => {
  const ctx = { detail: false, rowCount: 5 };
  it('maps movement (arrows + j/k)', () => {
    expect(listDetailAction('', keyOf({ downArrow: true }), ctx)).toEqual({ type: 'down' });
    expect(listDetailAction('j', keyOf(), ctx)).toEqual({ type: 'down' });
    expect(listDetailAction('', keyOf({ upArrow: true }), ctx)).toEqual({ type: 'up' });
    expect(listDetailAction('k', keyOf(), ctx)).toEqual({ type: 'up' });
  });
  it('return/right opens detail when rows exist', () => {
    expect(listDetailAction('', keyOf({ return: true }), ctx)).toEqual({ type: 'openDetail' });
    expect(listDetailAction('', keyOf({ rightArrow: true }), ctx)).toEqual({ type: 'openDetail' });
  });
  it('does NOT open detail on an empty list (CMP-9 guard)', () => {
    expect(listDetailAction('', keyOf({ return: true }), { detail: false, rowCount: 0 })).toEqual({ type: 'none' });
  });
});

describe('listDetailAction — detail mode', () => {
  const ctx = { detail: true, rowCount: 5 };
  it('escape/left closes; everything else is inert', () => {
    expect(listDetailAction('', keyOf({ escape: true }), ctx)).toEqual({ type: 'closeDetail' });
    expect(listDetailAction('', keyOf({ leftArrow: true }), ctx)).toEqual({ type: 'closeDetail' });
    expect(listDetailAction('j', keyOf(), ctx)).toEqual({ type: 'none' });
    expect(listDetailAction('', keyOf({ return: true }), ctx)).toEqual({ type: 'none' });
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/render/ink/listDetail.ts
/**
 * The shared flat-list-with-detail interaction (Global + Leaderboard tabs):
 * j/k/arrows move, Enter/→ opens the detail pane, Esc/← closes it. The pure
 * mapper is tested directly; the hook is thin glue over useScroll.
 */
import { useState } from 'react';
import type { Key } from 'ink';
import { useScroll } from './scroll.js';

export type ListDetailKey = Pick<Key, 'escape' | 'leftArrow' | 'rightArrow' | 'upArrow' | 'downArrow' | 'return'>;

export type ListDetailAction =
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'openDetail' }
  | { type: 'closeDetail' }
  | { type: 'none' };

export function listDetailAction(
  input: string,
  key: ListDetailKey,
  ctx: { detail: boolean; rowCount: number },
): ListDetailAction {
  if (ctx.detail) {
    if (key.escape || key.leftArrow) return { type: 'closeDetail' };
    return { type: 'none' };
  }
  if (key.downArrow || input === 'j') return { type: 'down' };
  if (key.upArrow || input === 'k') return { type: 'up' };
  if ((key.return || key.rightArrow) && ctx.rowCount > 0) return { type: 'openDetail' };
  return { type: 'none' };
}

export function useListDetail(rowCount: number, height: number) {
  const { selected, start, end, moveUp, moveDown } = useScroll(rowCount, height);
  const [detail, setDetail] = useState(false);

  const onInput = (input: string, key: ListDetailKey): boolean => {
    const action = listDetailAction(input, key, { detail, rowCount });
    switch (action.type) {
      case 'down': moveDown(); return true;
      case 'up': moveUp(); return true;
      case 'openDetail': setDetail(true); return true;
      case 'closeDetail': setDetail(false); return true;
      default: return false;
    }
  };

  return { detail, selected, start, end, onInput };
}
```

`GlobalView.tsx` — replace the scroll/detail state and handler:

```tsx
import { useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { itemRows, sortItemRows, type ItemSort } from './rows.js';
import { ItemTable } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { useListDetail } from './listDetail.js';

// Header + tab bar + view title + position line + footer + margins.
const CHROME = 9;

export function GlobalView({ inv, inputActive = true }: { inv: Inventory; inputActive?: boolean }) {
  const [sort, setSort] = useState<ItemSort>('used');
  const rows = sortItemRows(itemRows(inv.global), sort);
  const height = Math.max(3, useWindowSize().rows - CHROME);
  const { detail, selected, start, end, onInput } = useListDetail(rows.length, height);

  useInput((input, key) => {
    if (!detail && input === 's') {
      setSort((m) => (m === 'used' ? 'name' : 'used'));
      return;
    }
    onInput(input, key);
  }, { isActive: inputActive });

  // ... the two return blocks are unchanged from the current file ...
```

`LeaderboardView.tsx` — same swap (it has no sort key):

```tsx
  const { detail, selected, start, end, onInput } = useListDetail(rows.length, height);

  useInput((input, key) => {
    onInput(input, key);
  }, { isActive: inputActive });
```

and delete both views' `import { useScroll } from './scroll.js';` and the `const [detail, setDetail] = useState(false);` lines (LeaderboardView keeps no `useState` import unless still used).

- [ ] **Step 3: Verify + commit**

```bash
npx vitest run test/listDetail.test.ts && npm test && npm run typecheck
```

Manual smoke: `npm run dev` → Global tab: j/k move, Enter opens detail, Esc closes, s toggles sort; Leaderboard same minus sort; on an empty filtered list (filter to a runtime with nothing), Enter does NOT open an empty detail.

```bash
git add src/render/ink/listDetail.ts src/render/ink/GlobalView.tsx src/render/ink/LeaderboardView.tsx test/listDetail.test.ts
git commit -m "refactor(ink): shared useListDetail hook + empty-list detail guard"
```

---

### Task 16: Shared Band + Position components, formatCounts (CMP-5)

**Files:**
- Create: `src/render/format.ts`, `src/render/ink/Band.tsx`, `src/render/ink/Position.tsx`
- Modify: `src/render/plain.ts` (use formatCounts), `src/render/ink/GlobalBand.tsx`, `src/render/ink/LeaderboardView.tsx` (StatsBand), `src/render/ink/GlobalView.tsx`, `src/render/ink/FoldersView.tsx`
- Test (modify): `test/stats.test.ts` (formatCounts unit test)

**Interfaces:**
- Produces: `formatCounts(c: { skills: number; plugins: number; mcp: number }): string` from `src/render/format.js` (→ `"N skills · N plugins · N mcp"`); `<Band marginTop?>{children}</Band>` (round gray border, paddingX 1, column) and `<Position start end total height />` (renders the `X–Y of Z` line, or nothing when everything fits) from `src/render/ink/`.

- [ ] **Step 1: Failing test (append to test/stats.test.ts)**

```ts
import { formatCounts } from '../src/render/format.js';

describe('formatCounts', () => {
  it('formats the counts triple', () => {
    expect(formatCounts({ skills: 2, plugins: 1, mcp: 3 })).toBe('2 skills · 1 plugins · 3 mcp');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/render/format.ts
/** Shared "N skills · N plugins · N mcp" formatting (plain report + Ink bands). */
export function formatCounts(c: { skills: number; plugins: number; mcp: number }): string {
  return `${c.skills} skills · ${c.plugins} plugins · ${c.mcp} mcp`;
}
```

```tsx
// src/render/ink/Band.tsx
import { Box } from 'ink';
import type { ReactNode } from 'react';
import { theme } from './theme.js';

/** The bordered band chrome shared by GLOBAL and STATS. */
export function Band({ children, marginTop }: { children: ReactNode; marginTop?: number }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} marginTop={marginTop}>
      {children}
    </Box>
  );
}
```

```tsx
// src/render/ink/Position.tsx
import { Text } from 'ink';

/** The "X–Y of Z" scroll position line; renders nothing when the list fits. */
export function Position({ start, end, total, height }: { start: number; end: number; total: number; height: number }) {
  if (total <= height) return null;
  return (
    <Text dimColor>
      {start + 1}–{end} of {total}
    </Text>
  );
}
```

Rewire (each change keeps the rendered characters identical):
- `plain.ts`: replace the `counts` helper body with `formatCounts(bucketCounts(b))` (import `formatCounts` from `./format.js`), or inline it at its single call site.
- `GlobalBand.tsx`: wrap content in `<Band>` (dropping its own bordered Box) and render the triple as `{formatCounts(bucketCounts(g))}` (import `bucketCounts` from `../../resolve.js`, `formatCounts` from `../format.js`).
- `LeaderboardView.tsx` `StatsBand`: wrap in `<Band marginTop={1}>`; totals line becomes `<Text><Text bold>STATS</Text> {formatCounts(stats.totals)}</Text>`.
- `GlobalView.tsx`, `LeaderboardView.tsx`, `FoldersView.tsx`: replace the three `{rows.length > height ? (...position line...) : null}` blocks with `<Position start={start} end={end} total={rows.length} height={height} />`.

- [ ] **Step 3: Verify + commit**

Task 1 snapshots must be unchanged (plain's string is identical).

```bash
npm test && npm run typecheck
```

Manual smoke: `npm run dev` — GLOBAL band, STATS band, and all three position lines look identical to before.

```bash
git add src/render/format.ts src/render/ink/Band.tsx src/render/ink/Position.tsx src/render/plain.ts src/render/ink/GlobalBand.tsx src/render/ink/LeaderboardView.tsx src/render/ink/GlobalView.tsx src/render/ink/FoldersView.tsx test/stats.test.ts
git commit -m "refactor(render): shared Band/Position components + formatCounts"
```

---

### Task 17: leaderboardStats — one universe() per render; sort delegation (RLG-1 + RLG-2)

**Files:**
- Modify: `src/render/ink/stats.ts`, `src/render/ink/LeaderboardView.tsx`
- Test (modify): `test/stats.test.ts`

**Interfaces:**
- Produces: `leaderboardStats(inv: Inventory): { rows: ItemRow[]; stats: SummaryStats }` from `stats.js` — single `universe()` merge. Existing exports `leaderboard`/`summaryStats` keep their signatures (now thin wrappers), so `test/stats.test.ts`'s existing cases pass untouched.

- [ ] **Step 1: Failing test (append to test/stats.test.ts, using the file's existing fixture inventory)**

The file's local helpers are `skill(name, …)`, `bucket(partial)`, `folder(partial)`, `inv(parts)` (verified). Add `leaderboardStats` to the stats import and append:

```ts
describe('leaderboardStats', () => {
  it('returns the same rows and stats as the two single-purpose functions', () => {
    const inventory = inv({
      global: bucket({ skills: [skill('a')] }),
      folders: [folder({ projectScoped: bucket({ skills: [skill('b')] }) })],
      runtimes: ['claude-code'],
    });
    const { rows, stats } = leaderboardStats(inventory);
    expect(rows).toEqual(leaderboard(inventory));
    expect(stats).toEqual(summaryStats(inventory));
  });
});
```

- [ ] **Step 2: Implement**

Restructure `stats.ts` so each entry point runs `universe()` once:

```ts
import type { Bucket, Inventory, Provider, Runtime } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { bucketCounts, mergeBuckets } from '../../resolve.js';
import { itemRows, sortItemRows, type ItemRow } from './rows.js';

// ... SummaryStats interface unchanged ...

/** Dedupe every skill/plugin/mcp across global + all folder layers. */
function universe(inv: Inventory): Bucket {
  return mergeBuckets(inv.global, ...inv.folders.flatMap((f) => [f.projectScoped, f.local]));
}

function leaderboardRows(all: Bucket): ItemRow[] {
  // Delegates to the shared 'used' comparator (kills the divergent `?? 0` clone —
  // identical output for skill rows, whose `used` is never null).
  return sortItemRows(itemRows({ ...emptyBucket(), skills: all.skills }), 'used');
}

function statsOf(all: Bucket, runtimesDetected: Runtime[]): SummaryStats {
  const totals = bucketCounts(all);
  const perRuntime = runtimesDetected
    .map((runtime) => ({
      runtime,
      skills: all.skills.filter((s) => s.usedBy.includes(runtime)).length,
    }))
    .sort((a, b) => b.skills - a.skills || a.runtime.localeCompare(b.runtime));
  const byKind = new Map<Provider['kind'], number>();
  for (const s of all.skills) byKind.set(s.provider.kind, (byKind.get(s.provider.kind) ?? 0) + 1);
  const perProvider = [...byKind.entries()]
    .map(([kind, skills]) => ({ kind, skills }))
    .sort((a, b) => b.skills - a.skills || a.kind.localeCompare(b.kind));
  return { totals, perRuntime, perProvider };
}

/** All distinct skills ranked by how many runtimes use them (desc, then name). */
export function leaderboard(inv: Inventory): ItemRow[] {
  return leaderboardRows(universe(inv));
}

export function summaryStats(inv: Inventory): SummaryStats {
  return statsOf(universe(inv), inv.runtimesDetected);
}

/** Rows + stats from ONE universe merge (LeaderboardView calls this per render). */
export function leaderboardStats(inv: Inventory): { rows: ItemRow[]; stats: SummaryStats } {
  const all = universe(inv);
  return { rows: leaderboardRows(all), stats: statsOf(all, inv.runtimesDetected) };
}
```

`LeaderboardView.tsx` — replace the two calls:

```ts
import { leaderboardStats, type SummaryStats } from './stats.js';
```
```ts
  const { rows, stats } = leaderboardStats(inv);
```

- [ ] **Step 3: Verify + commit**

```bash
npx vitest run test/stats.test.ts && npm test && npm run typecheck
git add src/render/ink/stats.ts src/render/ink/LeaderboardView.tsx test/stats.test.ts
git commit -m "refactor(stats): single universe() per render; leaderboard delegates to sortItemRows"
```

---

### Task 18: Memoize the per-keypress pipelines (CMP-3 + RLG-3)

**Files:**
- Modify: `src/render/ink/App.tsx`, `src/render/ink/FoldersView.tsx`, `src/render/ink/GlobalView.tsx`, `src/render/ink/LeaderboardView.tsx`

No new tests (pure React wiring; the pure functions are already unit-tested). Verification is the full suite + typecheck + a manual smoke.

- [ ] **Step 1: App.tsx**

```ts
import { useEffect, useMemo, useState } from 'react';
```
```ts
  const inv = useMemo(
    () => filterInventory(raw, { runtimes: [...runtimes], kinds: [...kinds] }),
    [raw, runtimes, kinds],
  );
  const chipList = useMemo(() => buildChips(raw.runtimesDetected), [raw.runtimesDetected]);
```

(`runtimes`/`kinds` are Sets whose identity changes only on toggle — clean deps.)

- [ ] **Step 2: FoldersView.tsx**

```ts
import { useMemo, useState } from 'react';
```
```ts
  const folderRows = useMemo(
    () => buildFolderRows(inv.folders, inv.homeRoot, { sort, showHidden, collapsed: nav.folderCollapsed }),
    [inv.folders, inv.homeRoot, sort, showHidden, nav.folderCollapsed],
  );

  const folderIdx = clampIndex(nav.folder, folderRows.length);
  const sel = folderRows[folderIdx];
  const selFolder = sel?.folder ?? null;
  const rows = useMemo(
    () => (selFolder ? groupedRows(selFolder.projectScoped, selFolder.local, nav.expanded) : []),
    [selFolder, nav.expanded],
  );
```

- [ ] **Step 3: GlobalView.tsx + LeaderboardView.tsx**

```ts
  const rows = useMemo(() => sortItemRows(itemRows(inv.global), sort), [inv.global, sort]);
```
```ts
  const { rows, stats } = useMemo(() => leaderboardStats(inv), [inv]);
```

(add `useMemo` to each file's react import.)

- [ ] **Step 4: Verify + commit**

```bash
npm test && npm run typecheck
```

Manual smoke: `npm run dev` — all tabs; move cursors rapidly; toggle filter chips (f, space, a); toggle sort and hidden; open/close details; trigger a rescan by touching a watched file (e.g. `touch ~/.claude/settings.json`) and confirm the dashboard refreshes.

```bash
git add src/render/ink/App.tsx src/render/ink/FoldersView.tsx src/render/ink/GlobalView.tsx src/render/ink/LeaderboardView.tsx
git commit -m "perf(ink): memoize filter/tree/rows/stats pipelines (Ink re-renders per keypress)"
```

---

### Task 19: mcpFromMap → shared buildMcpRecords (ADP-4)

**Files:**
- Modify: `src/adapters/claude-code.ts` (delete `mcpFromMap`, lines 167-181; rewire 3 call sites)

Protected by: `test/claude-code.test.ts` (userSrv/projSrv/pendingSrv/localSrv assertions) + Task 1 snapshots.

- [ ] **Step 1: Implement**

Change the mcp import:

```ts
import { normalizeClaudeTransport, buildMcpRecords } from '../mcp.js';
```

Delete the `mcpFromMap` function. Replace the three call sites:

In `collectGlobal`:

```ts
    bucket.mcp.push(
      ...buildMcpRecords(claudeJson?.mcpServers, normalizeClaudeTransport, 'global', {
        kind: 'user',
        path: claudeJsonPath(ctx),
      }, () => true),
    );
```

In `collectForDirectory` (project-scoped, gated):

```ts
    bucket.mcp.push(
      ...buildMcpRecords(mcpJson?.mcpServers, normalizeClaudeTransport, 'project-scoped', {
        kind: 'project-local',
        path: join(dir, '.mcp.json'),
      }, (name) => enableAll || (enabledSet.has(name) && !disabledSet.has(name))),
    );
```

In `collectForDirectory` (local):

```ts
    bucket.mcp.push(
      ...buildMcpRecords(projState?.mcpServers, normalizeClaudeTransport, 'local', {
        kind: 'project-local',
        path: claudeJsonPath(ctx),
      }, () => true),
    );
```

(Providers match what `mcpFromMap` derived: `'global'` → `user`, `'project-scoped'`/`'local'` → `project-local`. All three pass explicit `enabledFor`, so `buildMcpRecords`' different default is irrelevant.)

- [ ] **Step 2: Verify + commit**

```bash
npm test && npm run typecheck
git add src/adapters/claude-code.ts
git commit -m "refactor(claude-code): reuse shared buildMcpRecords, drop mcpFromMap clone"
```

---

### Task 20: claude-code global-file cache + single warning emission (ADP-9)

**Files:**
- Modify: `src/adapters/claude-code.ts`
- Test (modify): `test/claude-code.test.ts`

**Interfaces:**
- Produces (module-private): `globalConfig(ctx, warnings?)` returning `{ installed, marketplaces, claudeJson }`, cached per `HomeCtx` object via WeakMap. `scan()` creates one ctx per scan and calls `collectGlobal` first, so warnings attach exactly once; watch-mode rescans build a fresh ctx → fresh cache. The `Warning` type import becomes live here.

- [ ] **Step 1: Failing test (append to test/claude-code.test.ts)**

```ts
describe('claude-code adapter: global-file reads', () => {
  it('warns once on a malformed plugin registry, not once per directory', () => {
    home = makeTempHome();
    writeFileEnsured(join(home, '.claude', 'plugins', 'installed_plugins.json'), '{nope');
    const warnings: Warning[] = [];
    const ctx = ctxOf(home);
    claudeCodeAdapter.collectGlobal(ctx, warnings);
    claudeCodeAdapter.collectForDirectory(join(home, 'p1'), ctx, warnings);
    claudeCodeAdapter.collectForDirectory(join(home, 'p2'), ctx, warnings);
    expect(warnings.filter((w) => w.path.includes('installed_plugins')).length).toBe(1);
  });
});
```

Run: FAILS (3 warnings — one from collectGlobal + one per directory).

- [ ] **Step 2: Implement**

Add near the top of the adapter (after the interfaces):

```ts
interface GlobalConfig {
  installed: InstalledPlugins | undefined;
  marketplaces: Record<string, MarketplaceEntry> | undefined;
  claudeJson: ClaudeJson | undefined;
}

// The three global files are needed for every directory pass; read once per scan
// (scan() shares one HomeCtx) and emit warnings only from the first (global) read.
const globalConfigCache = new WeakMap<HomeCtx, GlobalConfig>();

function globalConfig(ctx: HomeCtx, warnings?: Warning[]): GlobalConfig {
  const hit = globalConfigCache.get(ctx);
  if (hit) return hit;
  const home = claudeHome(ctx);
  const cfg: GlobalConfig = {
    installed: readJson<InstalledPlugins>(join(home, 'plugins', 'installed_plugins.json'), warnings),
    marketplaces: readJson<Record<string, MarketplaceEntry>>(join(home, 'plugins', 'known_marketplaces.json'), warnings),
    claudeJson: readJson<ClaudeJson>(claudeJsonPath(ctx), warnings),
  };
  globalConfigCache.set(ctx, cfg);
  return cfg;
}
```

In `collectGlobal`, replace the `installed`/`marketplaces`/`claudeJson` reads with:

```ts
    const { installed, marketplaces, claudeJson } = globalConfig(ctx, warnings);
```

(keep the settings.json/settings.local.json reads as they are — they're global-scope-only), and in `collectForDirectory` replace its `installed`/`marketplaces`/`claudeJson` reads with:

```ts
    const { installed, marketplaces, claudeJson } = globalConfig(ctx);
```

Delete the now-redundant standalone `readJson` lines for those three files in both methods.

- [ ] **Step 3: Verify + commit**

Existing tests pass because they build fresh `ctxOf(...)` objects per call (cache miss → reads still happen).

```bash
npx vitest run test/claude-code.test.ts && npm test && npm run typecheck
git add src/adapters/claude-code.ts test/claude-code.test.ts
git commit -m "perf(claude-code): cache global config reads per scan; warn once"
```

---

### Task 21: Memoize providerForRealpath's classifier roots (ENG-2b)

**Files:**
- Modify: `src/skillscan.ts:18-24`

Protected by: the whole adapter suite (fresh ctx per test keeps correctness visible).

- [ ] **Step 1: Implement**

```ts
// Hub + personal-repo realpaths are stable per scan; resolving them per skill
// costs two realpath syscalls each — memoize per HomeCtx.
// NOTE: `~/Developer/Skills` is a personal-repo convention, not a cross-runtime
// standard; other setups classify as user/project-local (see ROADMAP "Beyond v0.2").
const classifierRootsCache = new WeakMap<HomeCtx, { hub: string; personal: string }>();

function classifierRoots(ctx: HomeCtx): { hub: string; personal: string } {
  const hit = classifierRootsCache.get(ctx);
  if (hit) return hit;
  const roots = {
    hub: realpathSafe(sharedHubDir(ctx)),
    personal: realpathSafe(join(ctx.homeRoot, 'Developer', 'Skills')),
  };
  classifierRootsCache.set(ctx, roots);
  return roots;
}

/** Classify a skill's provider from where its real content lives. */
export function providerForRealpath(real: string, ctx: HomeCtx, scope: Scope): Provider {
  const { hub, personal } = classifierRoots(ctx);
  if (isInside(real, hub)) return { kind: 'shared-store', path: real };
  if (isInside(real, personal)) return { kind: 'personal-repo', path: real };
  return { kind: scope === 'global' ? 'user' : 'project-local', path: real };
}
```

- [ ] **Step 2: Verify + commit**

```bash
npm test && npm run typecheck
git add src/skillscan.ts
git commit -m "perf(skillscan): memoize classifier realpath roots per scan"
```

---

### Task 22: Dead code, stale comments, cosmetics sweep

**Files:**
- Modify: `src/adapters/claude-code.ts`, `src/adapters/codex.ts`, `src/resolve.ts`, `src/runtimes.ts`, `src/render/ink/watchpaths.ts`, `src/render/ink/App.tsx`, `src/render/plain.ts`, `src/render/ink/FilterBar.tsx`, `src/render/ink/runtimeMark.ts`, `src/render/ink/ItemTable.tsx`

All mechanical; protected by the full suite + snapshots. Verify each removal with grep before deleting.

- [ ] **Step 1: Unused imports**

- `claude-code.ts`: remove `isDir` from the fsread import (only the `e.isDir` DirEntry property is used). `Warning` became live in Task 20 — keep it.
- `codex.ts`: remove `providerForRealpath` from the skillscan import (never called; verified by grep).

- [ ] **Step 2: Stale comments**

- `resolve.ts` `mergeBuckets` doc: `/** Merge buckets, deduping skills by contentId, plugins by id, mcp by name+scope+provider path. */`
- `codex.ts` `collectForDirectory` comment: `// project skills live in .codex/skills; the shared .agents/skills project hub is not scanned yet (ROADMAP "Beyond v0.2")`
- `watchpaths.ts` header, append: `* hermes-agent has no single canonical config file to watch (skills are a directory tree), so it is deliberately absent here.`
- `App.tsx` watcher effect, above `useEffect`: `// Watch set is computed once at mount (from the initial scan); folders discovered by later rescans aren't added until restart — a deliberate trade-off vs. re-creating the watcher on every rescan.`

- [ ] **Step 3: Dead registry field**

`runtimes.ts`: `projectSkills` is written but never read (verified: grep hits only runtimes.ts). Remove the `projectSkills` property from the `RuntimeDef` interface, from the `HUB` const, and from every entry in `KNOWN_RUNTIMES`. Then `npm run typecheck` — zero errors proves nothing consumed it.

- [ ] **Step 4: Cosmetics**

- `plain.ts`: `import { basename } from 'node:path';` and `const name = basename(f.path) || f.path;` (replaces the hand-rolled `split('/').pop()`).
- `FilterBar.tsx`: `import { theme } from './theme.js';` and change `color={selected ? 'cyan' : undefined}` to `color={selected ? theme.accent : undefined}`.
- `runtimeMark.ts`: add `export const MARK_COUNT = MARKS.length;`
- `ItemTable.tsx`: `import { marksFor, MARK_COUNT } from './runtimeMark.js';` and `const USES_W = MARK_COUNT; // one cell per detected-runtime badge` (same value, 6 — no visual change).

- [ ] **Step 5: Verify + commit**

Task 1 snapshots unchanged (basename change is output-identical on POSIX paths).

```bash
npm test && npm run typecheck
git add -A src/
git commit -m "chore: dead code removal, stale comments, theme/width derivations"
```

---

## Completion checklist (whole-branch, before merge)

1. `npm test` + `npm run typecheck` green (expect ~170+ tests).
2. Manual dashboard parity smoke (`npm run dev`): folder tree (nesting, compression, `.` toggle), filter bar (runtime + kind chips), badges, `s` sort cycling, drill navigation + detail from all three tabs, tab switching (keys + Tab/Shift-Tab), scroll windows, column alignment.
3. `npx tsx src/cli.ts --report | head -40` and `npx tsx src/cli.ts --json | head` sanity-read; `--report --provenance` shows the new MCP detail; dot-path folders absent.
4. Whole-branch code review → fix findings.
5. Update ROADMAP.md: note the consolidation pass; add "Beyond v0.2" items — project-level `.agents/skills` hub scanning; configurable personal-repo path.
6. Merge to main locally: `git checkout main` (own command), write merge message to a file, `git merge --no-ff code-review-cleanup -F <file>`. No push.
