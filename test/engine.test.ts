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
  it('dedupes a shared skill and unions usedBy across symlinks + universal lock agents', () => {
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
    // symlinks credit claude-code + codex; universal lock agent credits warp
    expect(s.usedBy).toEqual(expect.arrayContaining(['claude-code', 'codex', 'warp']));

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
});
