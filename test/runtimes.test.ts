import { describe, it, expect } from 'vitest';
import {
  KNOWN_RUNTIMES,
  DEEP_RUNTIMES,
  globalSkillsDir,
  runtimeById,
  sharedHubDir,
  type HomeCtx,
} from '../src/runtimes.js';

describe('KNOWN_RUNTIMES registry', () => {
  it('exposes the six deep adapters', () => {
    expect(DEEP_RUNTIMES.map((r) => r.id).sort()).toEqual(
      ['claude-code', 'codex', 'cursor', 'gemini-cli', 'hermes-agent', 'opencode'].sort(),
    );
  });

  it('has unique ids', () => {
    const ids = KNOWN_RUNTIMES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves env-aware homes (CODEX_HOME overrides, claude-code default)', () => {
    const ctx: HomeCtx = { homeRoot: '/home/u', env: { CODEX_HOME: '/custom/codex' } };
    expect(globalSkillsDir(runtimeById('codex')!, ctx)).toBe('/custom/codex/skills');
    expect(globalSkillsDir(runtimeById('claude-code')!, ctx)).toBe('/home/u/.claude/skills');
  });

  it('honors XDG_CONFIG_HOME for config-based runtimes', () => {
    const ctx: HomeCtx = { homeRoot: '/home/u', env: { XDG_CONFIG_HOME: '/xdg' } };
    expect(globalSkillsDir(runtimeById('opencode')!, ctx)).toBe('/xdg/opencode/skills');
    const def = runtimeById('opencode')!;
    const noXdg: HomeCtx = { homeRoot: '/home/u', env: {} };
    expect(globalSkillsDir(def, noXdg)).toBe('/home/u/.config/opencode/skills');
  });

  it('points hub-direct universal agents at ~/.agents/skills', () => {
    const ctx: HomeCtx = { homeRoot: '/home/u', env: {} };
    expect(globalSkillsDir(runtimeById('warp')!, ctx)).toBe(sharedHubDir(ctx));
    expect(globalSkillsDir(runtimeById('cline')!, ctx)).toBe('/home/u/.agents/skills');
  });

  it('resolves nested skills subpaths', () => {
    const ctx: HomeCtx = { homeRoot: '/home/u', env: {} };
    expect(globalSkillsDir(runtimeById('windsurf')!, ctx)).toBe('/home/u/.codeium/windsurf/skills');
    expect(globalSkillsDir(runtimeById('pi')!, ctx)).toBe('/home/u/.pi/agent/skills');
  });
});
