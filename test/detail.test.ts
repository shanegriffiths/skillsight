import { describe, it, expect } from 'vitest';
import { detailFields } from '../src/render/ink/detail.js';
import type { ItemRow } from '../src/render/ink/rows.js';
import type { McpRecord, PluginRecord, SkillRecord, Runtime } from '../src/types.js';

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

  it('carries the raw usedBy on the used-by field for badge rendering', () => {
    const f = detailFields(skillRow({ usedBy: ['claude-code', 'codex', 'amp'] as Runtime[] }));
    expect(f.find((x) => x.label === 'used by')?.runtimes).toEqual(['claude-code', 'codex', 'amp']);
  });

  it('flags the url field as a link', () => {
    const f = detailFields(skillRow({}));
    expect(f.find((x) => x.label === 'url')).toMatchObject({ value: 'https://github.com/h/animejs', link: true });
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
