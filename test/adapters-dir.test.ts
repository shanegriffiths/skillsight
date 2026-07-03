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
