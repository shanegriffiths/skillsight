import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup, writeFileEnsured, writeSkillDir, symlinkInto } from './helpers.js';
import { scan } from '../src/index.js';

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

describe('scan() engine integration', () => {
  it('dedupes a shared skill and unions reach across symlinks (lock agents excluded)', () => {
    home = makeTempHome();
    const proj = join(home, 'proj');

    // hub + lock
    const shared = writeSkillDir(join(home, '.agents', 'skills'), 'shared1', { description: 'Shared one' });
    writeFileEnsured(
      join(home, '.agents', '.skill-lock.json'),
      JSON.stringify({
        version: 3,
        skills: { shared1: { source: 'owner/repo', sourceUrl: 'https://github.com/owner/repo', skillFolderHash: 'h1' } },
        lastSelectedAgents: ['warp', 'claude-code', 'codex'],
      }),
    );

    // claude-code references it via symlink + has a local skill
    writeFileEnsured(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: {} }));
    symlinkInto(join(home, '.claude', 'skills', 'shared1'), shared);
    writeSkillDir(join(home, '.claude', 'skills'), 'local1');

    // codex also symlinks it in (no codex adapter yet, but reverse-scan still credits it)
    symlinkInto(join(home, '.codex', 'skills', 'shared1'), shared);

    // a project with an approved .mcp.json server
    writeFileEnsured(join(home, '.claude.json'), JSON.stringify({
      projects: { [proj]: { enabledMcpjsonServers: ['p1'] } },
    }));
    writeFileEnsured(join(proj, '.mcp.json'), JSON.stringify({ mcpServers: { p1: { type: 'stdio', command: 'x' } } }));

    const inv = scan(home, { walk: false, dir: proj, env: {} });

    expect(inv.runtimesDetected).toContain('claude-code');

    const shared1 = inv.global.skills.filter((s) => s.name === 'shared1');
    expect(shared1).toHaveLength(1); // deduped
    const s = shared1[0]!;
    expect(s.contentId).toBe('h1'); // canonicalized to skillFolderHash
    expect(s.provider.kind).toBe('shared-store');
    expect(s.provider.source).toBe('owner/repo');
    // reach = only the runtimes that symlink it (claude-code + codex); the lock's
    // universal agent `warp` is NOT folded in.
    expect(s.usedBy).toEqual(['claude-code', 'codex']);

    // folder delta carries the approved project MCP
    const folder = inv.folders.find((f) => f.path === proj)!;
    const p1 = folder.projectScoped.mcp.find((m) => m.name === 'p1')!;
    expect(p1.enabled).toBe(true);
    expect(p1.transport.kind).toBe('stdio');
  });

  it('returns an empty, valid inventory for a bare home (no crash)', () => {
    home = makeTempHome();
    const inv = scan(home, { walk: true, env: {} });
    expect(inv.runtimesDetected).toEqual([]);
    expect(inv.global.skills).toEqual([]);
    expect(inv.folders).toEqual([]);
    expect(inv.warnings).toEqual([]);
    expect(typeof inv.generatedAt).toBe('string');
  });

  it('applies a per-project plugin enablement override to the effective set, folder delta, and bundled skills', () => {
    home = makeTempHome();
    const proj = join(home, 'proj');
    const betaCache = join(home, '.claude', 'plugins', 'cache', 'official', 'beta', '1.0.0');

    // user layer: beta installed at user scope and DISABLED
    writeFileEnsured(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'beta@official': false } }));
    writeFileEnsured(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: { 'beta@official': [{ scope: 'user', installPath: betaCache, version: '1.0.0' }] } }),
    );
    writeFileEnsured(
      join(home, '.claude', 'plugins', 'known_marketplaces.json'),
      JSON.stringify({ official: { source: { source: 'github', repo: 'org/official' } } }),
    );
    writeFileEnsured(join(betaCache, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'beta' }));
    writeSkillDir(join(betaCache, 'skills'), 'betaskill');

    // project layer: turn beta ON
    writeFileEnsured(join(proj, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'beta@official': true } }));

    const inv = scan(home, { walk: false, dir: proj, env: {} });
    const folder = inv.folders.find((f) => f.path === proj)!;

    // global (the inherited default) is untouched — beta stays disabled
    expect(inv.global.plugins.find((p) => p.id === 'beta@official')!.enabled).toBe(false);
    expect(inv.global.skills.find((s) => s.name === 'betaskill')!.enabled).toBe(false);

    // effective: enabled by the project override
    expect(folder.effective.plugins.find((p) => p.id === 'beta@official')!.enabled).toBe(true);
    // surfaced in the folder delta as an override row
    const delta = folder.projectScoped.plugins.find((p) => p.id === 'beta@official')!;
    expect(delta.enabled).toBe(true);
    expect(delta.override).toBe('project');
    // cascade: the plugin's bundled skill follows the effective enablement
    expect(folder.effective.skills.find((s) => s.name === 'betaskill')!.enabled).toBe(true);
  });

  it('surfaces hub-direct-only skills (no symlinks) with empty reach — lock agents excluded', () => {
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
    // no symlinks → empty reach, even though the lock lists universal agents.
    expect(s!.usedBy).toEqual([]);
  });

  it('hub skill with no symlinks and no universal agents reports usedBy [] (no owner fallback)', () => {
    home = makeTempHome();
    writeSkillDir(join(home, '.agents', 'skills'), 'idle');
    const inv = scan(home, { walk: false, env: {} });
    const s = inv.global.skills.find((x) => x.name === 'idle');
    expect(s).toBeDefined();
    expect(s!.usedBy).toEqual([]);
  });
});

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

  it('reports a malformed folder settings.json exactly once per scan (refineEffective stays silent)', () => {
    const { home: h, proj } = visibilityHome();
    home = h;
    writeFileEnsured(join(proj, '.claude', 'settings.json'), '{nope');
    const inv = scan(h, { walk: false, dir: proj, env: {} });
    const projSettings = join(proj, '.claude', 'settings.json');
    expect(inv.warnings.filter((w) => w.path === projSettings)).toHaveLength(1);
  });
});
