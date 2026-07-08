import { describe, it, expect } from 'vitest';
import { detailFields, formatLastUsed } from '../src/render/ink/detail.js';
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
    expect(valueOf(f, 'used by')).toBe('Claude Code, Codex');
    expect(valueOf(f, 'source')).toBe('h/animejs');
    expect(valueOf(f, 'url')).toBe('https://github.com/h/animejs');
    expect(valueOf(f, 'scope')).toBe('project-scoped');
    expect(valueOf(f, 'about')).toBe('Anime.js adapter patterns');
  });

  it('shows the bundling plugin when present', () => {
    const f = detailFields(skillRow({ bundledInPlugin: 'gsap-skills' }));
    expect(valueOf(f, 'plugin')).toBe('gsap-skills');
  });

  it('shows Claude Code usage count (labelled) + a last-used field when present', () => {
    const f = detailFields(skillRow({ usageCount: 29, lastUsedAt: 1000 }));
    expect(valueOf(f, 'uses')).toBe('29 · Claude Code');
    expect(f.find((x) => x.label === 'last used')).toBeDefined();
  });

  it('omits usage fields when the skill has no usageCount', () => {
    const f = detailFields(skillRow({}));
    expect(valueOf(f, 'uses')).toBeUndefined();
    expect(f.find((x) => x.label === 'last used')).toBeUndefined();
  });

  it('marks the about field as wrapped so the full description shows', () => {
    const f = detailFields(skillRow({ description: 'A long multi-sentence front-matter description.' }));
    expect(f.find((x) => x.label === 'about')).toMatchObject({
      value: 'A long multi-sentence front-matter description.',
      wrap: true,
    });
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

  it('spells out used-by as full names, detected six first then others', () => {
    const f = detailFields(skillRow({ usedBy: ['amp', 'codex', 'claude-code'] as Runtime[] }));
    expect(valueOf(f, 'used by')).toBe('Claude Code, Codex, Amp');
  });

  it('flags the url field as a link', () => {
    const f = detailFields(skillRow({}));
    expect(f.find((x) => x.label === 'url')).toMatchObject({ value: 'https://github.com/h/animejs', link: true });
  });

  it('shows visibility with its deciding layer', () => {
    const f = detailFields(skillRow({ visibility: 'user-invocable-only', visibilitySource: 'user' }));
    expect(valueOf(f, 'visibility')).toBe('user-invocable-only (user)');
  });

  it('tags an explicit project/local on as promoted', () => {
    const f = detailFields(skillRow({ visibility: 'on', visibilitySource: 'project' }));
    expect(valueOf(f, 'visibility')).toBe('on (project — promoted)');
  });

  it('does not tag a user-layer on as promoted', () => {
    const f = detailFields(skillRow({ visibility: 'on', visibilitySource: 'user' }));
    expect(valueOf(f, 'visibility')).toBe('on (user)');
  });

  it('omits the visibility field when no override applies', () => {
    expect(valueOf(detailFields(skillRow({})), 'visibility')).toBeUndefined();
  });
});

describe('detailFields — plugin', () => {
  it('summarises what the plugin provides', () => {
    const f = detailFields(pluginRow({}));
    expect(valueOf(f, 'provides')).toBe('3 skills · 1 commands · 0 agents · 0 mcp');
    expect(valueOf(f, 'marketplace')).toBe('studio/gsap');
    expect(valueOf(f, 'version')).toBe('1.2.0');
  });

  it('shows the plugin manifest description as a wrapped about', () => {
    const f = detailFields(pluginRow({ description: 'AI-powered codebase understanding' }));
    expect(f.find((x) => x.label === 'about')).toMatchObject({
      value: 'AI-powered codebase understanding',
      wrap: true,
    });
  });

  it('omits about when the plugin manifest has no description', () => {
    expect(valueOf(detailFields(pluginRow({})), 'about')).toBeUndefined();
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

  it('has no about field — mcp configs carry no description', () => {
    const f = detailFields(mcpRow({ kind: 'stdio', command: 'npx' }));
    expect(valueOf(f, 'about')).toBeUndefined();
  });
});

describe('formatLastUsed', () => {
  const now = 10_000_000_000_000;
  it('renders compact relative buckets', () => {
    expect(formatLastUsed(now - 30_000, now)).toBe('just now');
    expect(formatLastUsed(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatLastUsed(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatLastUsed(now - 2 * 86_400_000, now)).toBe('2d ago');
    expect(formatLastUsed(now - 60 * 86_400_000, now)).toBe('2mo ago');
    expect(formatLastUsed(now - 400 * 86_400_000, now)).toBe('1y ago');
  });
});

describe('detailFields — defensive', () => {
  it('returns [] for a row with no record', () => {
    const row: ItemRow = { kind: 'plugin', name: 'group', used: 2, source: null, sourceDim: false, expandState: 'collapsed' };
    expect(detailFields(row)).toEqual([]);
  });
});
