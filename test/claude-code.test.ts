import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup, ctxOf, writeFileEnsured, writeSkillDir, symlinkInto } from './helpers.js';
import { claudeCodeAdapter } from '../src/adapters/claude-code.js';
import type { Warning } from '../src/types.js';

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

function cacheDir(home: string, name: string, version = '1.0.0'): string {
  return join(home, '.claude', 'plugins', 'cache', 'official', name, version);
}

function buildHome(): { home: string; proj: string } {
  const h = makeTempHome();
  const proj = join(h, 'proj');

  // settings: alpha on, beta off, (gamma absent -> defaultEnabled)
  writeFileEnsured(
    join(h, '.claude', 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'alpha@official': true, 'beta@official': false } }),
  );

  // plugin registry
  writeFileEnsured(
    join(h, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'alpha@official': [{ scope: 'user', installPath: cacheDir(h, 'alpha'), version: '1.0.0' }],
        'beta@official': [{ scope: 'user', installPath: cacheDir(h, 'beta'), version: '1.0.0' }],
        'gamma@official': [{ scope: 'user', installPath: cacheDir(h, 'gamma'), version: '1.0.0' }],
        'proj@official': [{ scope: 'project', projectPath: proj, installPath: cacheDir(h, 'proj'), version: '2.0.0' }],
      },
    }),
  );
  writeFileEnsured(
    join(h, '.claude', 'plugins', 'known_marketplaces.json'),
    JSON.stringify({ official: { source: { source: 'github', repo: 'org/official' } } }),
  );

  // alpha plugin: manifest + skill + command + sidecar mcp + a codex sibling
  writeFileEnsured(join(cacheDir(h, 'alpha'), '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'alpha' }));
  writeSkillDir(join(cacheDir(h, 'alpha'), 'skills'), 'foo');
  writeFileEnsured(join(cacheDir(h, 'alpha'), 'commands', 'do.md'), '# do');
  writeFileEnsured(join(cacheDir(h, 'alpha'), '.mcp.json'), JSON.stringify({ mcpServers: { srv: { type: 'stdio', command: 'x' } } }));
  writeFileEnsured(join(cacheDir(h, 'alpha'), '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'alpha' }));

  // gamma plugin: no settings entry, defaultEnabled false -> disabled
  writeFileEnsured(join(cacheDir(h, 'gamma'), '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'gamma', defaultEnabled: false }));
  // beta plugin: minimal manifest
  writeFileEnsured(join(cacheDir(h, 'beta'), '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'beta' }));
  // proj plugin: minimal
  writeFileEnsured(join(cacheDir(h, 'proj'), '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'proj' }));

  // user skills: a local real one + a symlink into the hub
  const hubSkill = writeSkillDir(join(h, '.agents', 'skills'), 'hubskill');
  writeSkillDir(join(h, '.claude', 'skills'), 'localskill');
  symlinkInto(join(h, '.claude', 'skills', 'hubskill'), hubSkill);

  // ~/.claude.json: user mcp + project local mcp + approval state
  writeFileEnsured(
    join(h, '.claude.json'),
    JSON.stringify({
      mcpServers: { userSrv: { type: 'http', url: 'https://x/mcp' } },
      projects: {
        [proj]: {
          mcpServers: { localSrv: { type: 'stdio', command: 'y' } },
          enabledMcpjsonServers: ['projSrv'],
        },
      },
    }),
  );

  // project files
  writeSkillDir(join(proj, '.claude', 'skills'), 'ps');
  writeFileEnsured(
    join(proj, '.mcp.json'),
    JSON.stringify({ mcpServers: { projSrv: { type: 'stdio', command: 'z' }, pendingSrv: { type: 'stdio', command: 'w' } } }),
  );

  return { home: h, proj };
}

describe('claude-code adapter: collectGlobal', () => {
  it('resolves plugin enablement (explicit true/false + defaultEnabled fallback)', () => {
    const { home: h } = buildHome();
    home = h;
    const warnings: Warning[] = [];
    const g = claudeCodeAdapter.collectGlobal(ctxOf(h), warnings);
    const byId = Object.fromEntries(g.plugins.map((p) => [p.id, p]));
    expect(byId['alpha@official']!.enabled).toBe(true);
    expect(byId['beta@official']!.enabled).toBe(false);
    expect(byId['gamma@official']!.enabled).toBe(false); // defaultEnabled:false
    expect(byId['alpha@official']!.marketplaceRepo).toBe('org/official');
    expect(byId['alpha@official']!.provides.skills).toContain('foo');
    expect(byId['alpha@official']!.provides.commands).toContain('do');
    expect(byId['alpha@official']!.provides.mcpServers).toContain('srv');
    expect(byId['alpha@official']!.supportsRuntimes).toContain('codex');
    // project plugin not in the global bucket
    expect(byId['proj@official']).toBeUndefined();
  });

  it('classifies skill providers (plugin / shared-store / user)', () => {
    const { home: h } = buildHome();
    home = h;
    const g = claudeCodeAdapter.collectGlobal(ctxOf(h), []);
    const byName = Object.fromEntries(g.skills.map((s) => [s.name, s]));
    expect(byName.foo!.provider.kind).toBe('plugin');
    expect(byName.foo!.bundledInPlugin).toBe('alpha@official');
    expect(byName.hubskill!.provider.kind).toBe('shared-store');
    expect(byName.localskill!.provider.kind).toBe('user');
  });

  it('reads user-scope MCP servers (normalized)', () => {
    const { home: h } = buildHome();
    home = h;
    const g = claudeCodeAdapter.collectGlobal(ctxOf(h), []);
    const userSrv = g.mcp.find((m) => m.name === 'userSrv');
    expect(userSrv!.scope).toBe('global');
    expect(userSrv!.transport.kind).toBe('http');
    expect(userSrv!.enabled).toBe(true);
  });
});

describe('claude-code adapter: collectForDirectory', () => {
  it('collects project plugin, project skills, and gated MCP', () => {
    const { home: h, proj } = buildHome();
    home = h;
    const d = claudeCodeAdapter.collectForDirectory(proj, ctxOf(h), []);
    expect(d.plugins.map((p) => p.id)).toEqual(['proj@official']);
    expect(d.plugins[0]!.scope).toBe('project');
    expect(d.plugins[0]!.projectPath).toBe(proj);
    expect(d.skills.map((s) => s.name)).toContain('ps');

    const mcp = Object.fromEntries(d.mcp.map((m) => [m.name, m]));
    expect(mcp.projSrv!.enabled).toBe(true); // approved
    expect(mcp.projSrv!.scope).toBe('project-scoped');
    expect(mcp.pendingSrv!.enabled).toBe(false); // not approved
    expect(mcp.localSrv!.scope).toBe('local');
    expect(mcp.localSrv!.enabled).toBe(true);
  });

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
});

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
