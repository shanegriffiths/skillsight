import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup, ctxOf, writeFileEnsured, writeSkillDir } from './helpers.js';
import { codexAdapter } from '../src/adapters/codex.js';
import { hermesAdapter } from '../src/adapters/hermes.js';
import { geminiAdapter } from '../src/adapters/gemini.js';
import { cursorAdapter } from '../src/adapters/cursor.js';
import { opencodeAdapter } from '../src/adapters/opencode.js';

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

describe('codex adapter', () => {
  it('parses config.toml mcp/plugins, .system builtins, and skills.config disabling', () => {
    home = makeTempHome();
    writeFileEnsured(
      join(home, '.codex', 'config.toml'),
      [
        '[mcp_servers.exa]',
        'command = "npx"',
        'args = ["-y", "exa"]',
        '',
        '[mcp_servers.Neon]',
        'type = "http"',
        'url = "https://n/mcp"',
        '[mcp_servers.Neon.http_headers]',
        'Authorization = "Bearer x"',
        '',
        '[plugins."figma@openai-curated"]',
        'enabled = true',
        '',
        '[[skills.config]]',
        'path = "/somewhere/migrate-to-codex"',
        'enabled = false',
        '',
      ].join('\n'),
    );
    writeSkillDir(join(home, '.codex', 'skills'), 'migrate-to-codex');
    writeSkillDir(join(home, '.codex', 'skills', '.system'), 'imagegen');

    const g = codexAdapter.collectGlobal(ctxOf(home), []);

    const mcp = Object.fromEntries(g.mcp.map((m) => [m.name, m]));
    expect(mcp.exa!.transport.kind).toBe('stdio');
    expect(mcp.Neon!.transport.kind).toBe('http');
    expect(mcp.Neon!.transport.headerKeys).toEqual(['Authorization']);

    const fig = g.plugins.find((p) => p.id === 'figma@openai-curated')!;
    expect(fig.enabled).toBe(true);
    expect(fig.marketplace).toBe('openai-curated');

    const skills = Object.fromEntries(g.skills.map((s) => [s.name, s]));
    expect(skills.imagegen!.provider.kind).toBe('runtime-builtin');
    expect(skills['migrate-to-codex']!.enabled).toBe(false); // disabled via skills.config
  });
});

describe('hermes adapter', () => {
  it('walks domain/skill SKILL.md (depth 2), skips description-only domains', () => {
    home = makeTempHome();
    const skills = join(home, '.hermes', 'skills');
    writeSkillDir(join(skills, 'research'), 'deep-dive');
    writeSkillDir(skills, 'computer-use'); // domain-level skill
    writeFileEnsured(join(skills, 'empty-domain', 'DESCRIPTION.md'), '# just a description');

    const g = hermesAdapter.collectGlobal(ctxOf(home), []);
    const names = g.skills.map((s) => s.name).sort();
    expect(names).toContain('deep-dive');
    expect(names).toContain('computer-use');
    expect(names).not.toContain('empty-domain');
  });
});

describe('gemini adapter', () => {
  it('reads settings mcp (httpUrl=>http, url=>sse), extension mcp, and skills.disabled', () => {
    home = makeTempHome();
    writeFileEnsured(
      join(home, '.gemini', 'settings.json'),
      JSON.stringify({
        mcpServers: { httpSrv: { httpUrl: 'https://g/mcp' }, sseSrv: { url: 'https://g/sse' } },
        skills: { disabled: ['gone'] },
      }),
    );
    writeSkillDir(join(home, '.gemini', 'skills'), 'keep');
    writeSkillDir(join(home, '.gemini', 'skills'), 'gone');
    writeFileEnsured(
      join(home, '.gemini', 'extensions', 'extA', 'gemini-extension.json'),
      JSON.stringify({ mcpServers: { extSrv: { httpUrl: 'https://e/mcp' } } }),
    );

    const g = geminiAdapter.collectGlobal(ctxOf(home), []);
    const mcp = Object.fromEntries(g.mcp.map((m) => [m.name, m]));
    expect(mcp.httpSrv!.transport.kind).toBe('http');
    expect(mcp.sseSrv!.transport.kind).toBe('sse');
    expect(mcp.extSrv!.transport.kind).toBe('http');

    const skills = Object.fromEntries(g.skills.map((s) => [s.name, s]));
    expect(skills.keep!.enabled).toBe(true);
    expect(skills.gone!.enabled).toBe(false);
  });
});

describe('cursor adapter', () => {
  it('surfaces MCP only (no skills)', () => {
    home = makeTempHome();
    writeFileEnsured(
      join(home, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { c1: { type: 'stdio', command: 'x' }, c2: { url: 'https://c/mcp' } } }),
    );
    // a harness-installed skills dir must NOT be attributed to cursor
    writeSkillDir(join(home, '.cursor', 'skills'), 'ghost');

    const g = cursorAdapter.collectGlobal(ctxOf(home), []);
    expect(g.skills).toHaveLength(0);
    const mcp = Object.fromEntries(g.mcp.map((m) => [m.name, m]));
    expect(mcp.c1!.transport.kind).toBe('stdio');
    expect(mcp.c2!.transport.kind).toBe('http'); // typeless remote assumed http
    expect(mcp.c2!.transport.note).toMatch(/assumed http/);
  });
});

describe('opencode adapter', () => {
  it('reads the `mcp` key (not mcpServers) + native skills', () => {
    home = makeTempHome();
    writeFileEnsured(
      join(home, '.config', 'opencode', 'opencode.json'),
      JSON.stringify({ mcp: { o1: { type: 'remote', url: 'https://o/mcp' }, o2: { type: 'local', command: ['bun', 'srv'] } } }),
    );
    writeSkillDir(join(home, '.config', 'opencode', 'skills'), 'os1');

    const g = opencodeAdapter.collectGlobal(ctxOf(home), []);
    const mcp = Object.fromEntries(g.mcp.map((m) => [m.name, m]));
    expect(mcp.o1!.transport.kind).toBe('http');
    expect(mcp.o2!.transport.kind).toBe('stdio');
    expect(mcp.o2!.transport.command).toBe('bun');
    expect(g.skills.map((s) => s.name)).toContain('os1');
  });

  it('falls back to opencode.jsonc with comments', () => {
    home = makeTempHome();
    writeFileEnsured(
      join(home, '.config', 'opencode', 'opencode.jsonc'),
      '{\n  // my config\n  "mcp": { "j1": { "type": "remote", "url": "https://j/mcp" } },\n}',
    );
    const g = opencodeAdapter.collectGlobal(ctxOf(home), []);
    expect(g.mcp.map((m) => m.name)).toContain('j1');
  });
});
