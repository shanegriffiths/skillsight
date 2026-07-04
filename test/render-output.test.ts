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
      skill({
        name: 'parked-skill', description: undefined, contentId: '/home/u/.claude/skills/parked-skill',
        provider: { kind: 'user', path: '/home/u/.claude/skills/parked-skill' },
        usedBy: ['claude-code'], visibility: 'user-invocable-only', visibilitySource: 'user',
      }),
      // Explicit 'on' override: --provenance must NOT print a visibility line for it.
      skill({
        name: 'promoted-skill', description: undefined, contentId: '/home/u/.claude/skills/promoted-skill',
        provider: { kind: 'user', path: '/home/u/.claude/skills/promoted-skill' },
        usedBy: ['claude-code'], visibility: 'on', visibilitySource: 'user',
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
