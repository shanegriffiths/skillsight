import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup, ctxOf, writeFileEnsured, writeSkillDir } from './helpers.js';
import { claudeCodeAdapter } from '../src/adapters/claude-code.js';
import { scanSyncedPlugins, scanSyncedSkills } from '../src/adapters/claude-code-synced.js';
import { emptyBucket, type Warning } from '../src/types.js';
import { mergeBuckets } from '../src/resolve.js';

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

const BUCKET = 'org-uuid_user-uuid';
const UUID_DIR = '6ba53849-2ee0-4cf0-957e-31c122ea1dd1';

function pluginsRoot(h: string): string {
  return join(h, '.claude', 'plugins', 'synced', BUCKET);
}
function skillsRoot(h: string): string {
  return join(h, '.claude', 'skills', 'synced', BUCKET);
}

/** A home with three synced plugins (two UUID-named folders) and three synced skills. */
function buildHome(settings: Record<string, unknown> = {}): string {
  const h = makeTempHome();
  writeFileEnsured(join(h, '.claude', 'settings.json'), JSON.stringify(settings));
  // installed_plugins.json present but without synced entries (they have no install record)
  writeFileEnsured(join(h, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: {} }));

  const pr = pluginsRoot(h);
  writeFileEnsured(
    join(pr, 'manifest.json'),
    JSON.stringify({
      lastUpdated: 1,
      plugins: [
        { pluginId: 'plugin_A', name: UUID_DIR, description: 'Core skills library', version: '0002', updatedAt: '2026-10-01T22:44:45Z', marketplaceName: 'anthropic-plugin-directory', installationPreference: 'available' },
        { pluginId: 'plugin_B', name: 'figma', description: 'Figma', version: '0058', updatedAt: '2026-10-15T07:34:38Z', marketplaceName: 'knowledge-work-plugins', installationPreference: 'available' },
        { pluginId: 'plugin_C', name: 'pkg-only-uuid', description: 'Package-only plugin', version: '0001', updatedAt: '2026-10-18T23:11:18Z', marketplaceName: 'anthropic-plugin-directory', installationPreference: 'available' },
      ],
    }),
  );
  // superpowers: UUID folder, real name in plugin.json, one bundled skill
  writeFileEnsured(join(pr, UUID_DIR, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers', version: '6.4.2', description: 'Core skills' }));
  writeFileEnsured(join(pr, `${UUID_DIR}.meta.json`), JSON.stringify({ server_plugin_id: 'plugin_A', marketplace_name: 'anthropic-plugin-directory' }));
  writeSkillDir(join(pr, UUID_DIR, 'skills'), 'brainstorming');
  // figma: named folder
  writeFileEnsured(join(pr, 'figma', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'figma', version: '2.2.157' }));
  writeFileEnsured(join(pr, 'figma.meta.json'), JSON.stringify({ server_plugin_id: 'plugin_B', marketplace_name: 'knowledge-work-plugins' }));
  // pkg-only: UUID folder with only a package.json
  writeFileEnsured(join(pr, 'pkg-only-uuid', 'package.json'), JSON.stringify({ name: 'setup-audit', version: '0.10.0' }));
  // staging + dot entries must be ignored
  writeFileEnsured(join(pr, '.staging', 'tmp', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'staged' }));

  const sr = skillsRoot(h);
  writeFileEnsured(
    join(sr, 'manifest.json'),
    JSON.stringify({
      lastUpdated: 1,
      skills: [
        { skillId: 'pdf', name: 'pdf', description: 'PDF things', source: 'anthropic', updatedAt: '2026-07-10T19:23:15Z', creatorType: 'anthropic' },
        { skillId: 'docs', name: 'docs', description: 'Docs things', source: 'anthropic-example', updatedAt: '2026-09-30T00:33:27Z', creatorType: 'anthropic' },
        { skillId: 'skill_01X', name: 'my-voice', description: 'Voice', source: 'plugin', updatedAt: '2026-10-20T11:06:49Z' },
        // Anthropic example skills often ship without creatorType — `source` still says who made them
        { skillId: 'pptx', name: 'pptx', description: 'Slides', source: 'anthropic-example', updatedAt: '2026-10-02T22:00:34Z' },
      ],
    }),
  );
  writeSkillDir(sr, 'pdf');
  writeSkillDir(sr, 'docs');
  writeSkillDir(sr, 'my-voice');
  writeSkillDir(sr, 'pptx');
  writeFileEnsured(join(sr, 'not-a-skill', 'README.md'), '# nope');
  return h;
}

describe('scanSyncedPlugins', () => {
  it('resolves the real name from plugin.json when the folder is a UUID', () => {
    home = buildHome();
    const out = scanSyncedPlugins(join(home, '.claude'), ctxOf(home), {});
    const sp = out.find((r) => r.plugin.id === 'superpowers@synced');
    expect(sp).toBeDefined();
    expect(sp!.plugin.name).toBe('superpowers');
    expect(sp!.plugin.version).toBe('6.4.2'); // plugin.json, not the manifest's "0002"
    expect(sp!.plugin.marketplace).toBe('synced');
    expect(sp!.plugin.scope).toBe('user');
    expect(sp!.plugin.account).toEqual({ marketplaceName: 'anthropic-plugin-directory', updatedAt: '2026-10-01T22:44:45Z' });
    expect(sp!.plugin.provides.skills).toEqual(['brainstorming']);
    expect(sp!.skills[0]!.bundledInPlugin).toBe('superpowers@synced');
    expect(sp!.skills[0]!.provider.kind).toBe('plugin');
  });

  it('falls back to package.json name, then skips .staging and dot entries', () => {
    home = buildHome();
    const out = scanSyncedPlugins(join(home, '.claude'), ctxOf(home), {});
    const ids = out.map((r) => r.plugin.id).sort();
    expect(ids).toEqual(['figma@synced', 'setup-audit@synced', 'superpowers@synced']);
    expect(out.find((r) => r.plugin.id === 'setup-audit@synced')!.plugin.version).toBe('0.10.0');
  });

  it('honors a local "<name>@synced": false and manifest defaultEnabled', () => {
    home = buildHome();
    writeFileEnsured(join(pluginsRoot(home), 'figma', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'figma', version: '1', defaultEnabled: false }));
    const out = scanSyncedPlugins(join(home, '.claude'), ctxOf(home), { 'superpowers@synced': false });
    const by = Object.fromEntries(out.map((r) => [r.plugin.id, r.plugin.enabled]));
    expect(by['superpowers@synced']).toBe(false);
    expect(by['figma@synced']).toBe(false);
    expect(by['setup-audit@synced']).toBe(true);
  });

  it('warns on a malformed manifest but still lists the folders', () => {
    home = buildHome();
    writeFileEnsured(join(pluginsRoot(home), 'manifest.json'), '{nope');
    const warnings: Warning[] = [];
    const out = scanSyncedPlugins(join(home, '.claude'), ctxOf(home), {}, warnings);
    expect(warnings.some((w) => w.path.endsWith('manifest.json'))).toBe(true);
    expect(out.map((r) => r.plugin.id)).toContain('figma@synced');
    expect(out.find((r) => r.plugin.id === 'figma@synced')!.plugin.account?.marketplaceName).toBe('knowledge-work-plugins'); // from .meta.json
  });
});

describe('scanSyncedSkills', () => {
  it('lists each synced skill as an account skill with its full name and creator', () => {
    home = buildHome();
    const out = scanSyncedSkills(join(home, '.claude'), ctxOf(home));
    const by = Object.fromEntries(out.map((s) => [s.name, s]));
    expect(Object.keys(by).sort()).toEqual(['docs', 'my-voice', 'pdf', 'pptx']);
    expect(by.pdf!.provider.kind).toBe('account');
    expect(by.pdf!.scope).toBe('global');
    expect(by.pdf!.enabled).toBe(true);
    expect(by.pdf!.account).toEqual({ id: 'anthropic-skills:pdf', creator: 'anthropic', updatedAt: '2026-07-10T19:23:15Z' });
    expect(by['my-voice']!.account).toEqual({ id: 'anthropic-skills:my-voice', creator: 'user', updatedAt: '2026-10-20T11:06:49Z' });
    expect(by.pptx!.account?.creator).toBe('anthropic'); // no creatorType, but source "anthropic-example"
  });
});

describe('claude-code adapter: account source', () => {
  it('collectGlobal includes synced plugins and skills', () => {
    home = buildHome();
    const g = claudeCodeAdapter.collectGlobal(ctxOf(home), []);
    expect(g.plugins.map((p) => p.id).sort()).toEqual(['figma@synced', 'setup-audit@synced', 'superpowers@synced']);
    expect(g.skills.filter((s) => s.provider.kind === 'account').map((s) => s.name).sort()).toEqual(['docs', 'my-voice', 'pdf', 'pptx']);
  });

  it('syncClaudeAiPlugins:false hides synced plugins; syncClaudeAiSkills:false hides synced skills', () => {
    home = buildHome({ syncClaudeAiPlugins: false, syncClaudeAiSkills: false });
    const g = claudeCodeAdapter.collectGlobal(ctxOf(home), []);
    expect(g.plugins).toEqual([]);
    expect(g.skills.filter((s) => s.provider.kind === 'account')).toEqual([]);
  });

  it('flags a synced skill whose short name a user skill already uses', () => {
    home = buildHome();
    writeSkillDir(join(home, '.claude', 'skills'), 'pdf');
    const g = claudeCodeAdapter.collectGlobal(ctxOf(home), []);
    const synced = g.skills.find((s) => s.provider.kind === 'account' && s.name === 'pdf')!;
    expect(synced.account?.shortNameTakenBy).toBe('user');
    const docs = g.skills.find((s) => s.provider.kind === 'account' && s.name === 'docs')!;
    expect(docs.account?.shortNameTakenBy).toBeUndefined();
  });

  it('flags a synced plugin shadowed by an enabled same-name plugin from another origin', () => {
    home = buildHome({ enabledPlugins: { 'superpowers@official': true } });
    const cache = join(home, '.claude', 'plugins', 'cache', 'official', 'superpowers', '6.4.1');
    writeFileEnsured(join(cache, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }));
    writeFileEnsured(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: { 'superpowers@official': [{ scope: 'user', installPath: cache, version: '6.4.1' }] } }),
    );
    const g = claudeCodeAdapter.collectGlobal(ctxOf(home), []);
    expect(g.plugins.find((p) => p.id === 'superpowers@synced')!.account?.shadowedBy).toBe('superpowers@official');
    expect(g.plugins.find((p) => p.id === 'figma@synced')!.account?.shadowedBy).toBeUndefined();
  });

  it('a folder settings "<name>@synced": false surfaces as a project override row', () => {
    home = buildHome();
    const proj = join(home, 'proj');
    writeFileEnsured(join(proj, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'figma@synced': false } }));
    const f = claudeCodeAdapter.collectForDirectory(proj, ctxOf(home), []);
    const row = f.plugins.find((p) => p.id === 'figma@synced')!;
    expect(row.override).toBe('project');
    expect(row.enabled).toBe(false);
  });

  it('a project-scoped same-name plugin shadows the synced copy in that folder only', () => {
    home = buildHome();
    const proj = join(home, 'proj');
    const cache = join(home, '.claude', 'plugins', 'cache', 'official', 'superpowers', '6.4.1');
    writeFileEnsured(join(cache, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }));
    writeFileEnsured(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: { 'superpowers@official': [{ scope: 'project', projectPath: proj, installPath: cache, version: '6.4.1' }] } }),
    );
    writeFileEnsured(join(proj, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'superpowers@official': true } }));
    const g = claudeCodeAdapter.collectGlobal(ctxOf(home), []);
    expect(g.plugins.find((p) => p.id === 'superpowers@synced')!.account?.shadowedBy).toBeUndefined();
    const f = claudeCodeAdapter.collectForDirectory(proj, ctxOf(home), []);
    const row = f.plugins.find((p) => p.id === 'superpowers@synced')!;
    expect(row.account?.shadowedBy).toBe('superpowers@official');
  });

  it('refineEffective flags a synced skill whose short name a project skill takes', () => {
    home = buildHome();
    const proj = join(home, 'proj');
    writeSkillDir(join(proj, '.claude', 'skills'), 'docs');
    const ctx = ctxOf(home);
    const g = claudeCodeAdapter.collectGlobal(ctx, []);
    const f = claudeCodeAdapter.collectForDirectory(proj, ctx, []);
    const effective = emptyBucket();
    effective.skills = [...g.skills.map((s) => ({ ...s, account: s.account ? { ...s.account } : undefined })), ...f.skills];
    effective.plugins = [...g.plugins];
    claudeCodeAdapter.refineEffective!(proj, effective, ctx);
    const synced = effective.skills.find((s) => s.provider.kind === 'account' && s.name === 'docs')!;
    expect(synced.account?.shortNameTakenBy).toBe('project-local');
    // the global record is untouched
    expect(g.skills.find((s) => s.provider.kind === 'account' && s.name === 'docs')!.account?.shortNameTakenBy).toBeUndefined();
  });

  // --- Codex review on PR #4 ---

  function installUserOfficialSuperpowers(h: string): void {
    const cache = join(h, '.claude', 'plugins', 'cache', 'official', 'superpowers', '6.4.1');
    writeFileEnsured(join(cache, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }));
    writeFileEnsured(
      join(h, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: { 'superpowers@official': [{ scope: 'user', installPath: cache, version: '6.4.1' }] } }),
    );
  }

  it('a shadowed synced plugin contributes nothing: its bundled skills are disabled', () => {
    home = buildHome({ enabledPlugins: { 'superpowers@official': true } });
    installUserOfficialSuperpowers(home);
    const g = claudeCodeAdapter.collectGlobal(ctxOf(home), []);
    const plugin = g.plugins.find((p) => p.id === 'superpowers@synced')!;
    expect(plugin.account?.shadowedBy).toBe('superpowers@official');
    expect(plugin.enabled).toBe(true); // still enabled in config, like `claude plugin list` says
    const bundled = g.skills.find((s) => s.bundledInPlugin === 'superpowers@synced')!;
    expect(bundled.enabled).toBe(false);
  });

  it('refineEffective keeps the inherited user-scope shadow when a folder explicitly enables the synced copy', () => {
    home = buildHome({ enabledPlugins: { 'superpowers@official': true } });
    installUserOfficialSuperpowers(home);
    const proj = join(home, 'proj');
    writeFileEnsured(join(proj, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'superpowers@synced': true } }));
    const ctx = ctxOf(home);
    const g = claudeCodeAdapter.collectGlobal(ctx, []);
    const f = claudeCodeAdapter.collectForDirectory(proj, ctx, []);
    const effective = mergeBuckets(g, f);
    claudeCodeAdapter.refineEffective!(proj, effective, ctx);
    const row = effective.plugins.find((p) => p.id === 'superpowers@synced')!;
    expect(row.override).toBe('project');
    expect(row.account?.shadowedBy).toBe('superpowers@official');
    expect(effective.skills.find((s) => s.bundledInPlugin === 'superpowers@synced')!.enabled).toBe(false);
  });

  it('refineEffective clears the shadow when the folder disables the shadowing owner, without touching the global record', () => {
    home = buildHome({ enabledPlugins: { 'superpowers@official': true } });
    installUserOfficialSuperpowers(home);
    const proj = join(home, 'proj');
    writeFileEnsured(join(proj, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'superpowers@official': false } }));
    const ctx = ctxOf(home);
    const g = claudeCodeAdapter.collectGlobal(ctx, []);
    const f = claudeCodeAdapter.collectForDirectory(proj, ctx, []);
    const effective = mergeBuckets(g, f);
    claudeCodeAdapter.refineEffective!(proj, effective, ctx);
    expect(effective.plugins.find((p) => p.id === 'superpowers@synced')!.account?.shadowedBy).toBeUndefined();
    expect(effective.skills.find((s) => s.bundledInPlugin === 'superpowers@synced')!.enabled).toBe(true);
    expect(g.plugins.find((p) => p.id === 'superpowers@synced')!.account?.shadowedBy).toBe('superpowers@official');
  });

  it('a disabled skill cannot take a synced skill\'s short name', () => {
    home = buildHome({ skillOverrides: { pdf: 'off' } });
    writeSkillDir(join(home, '.claude', 'skills'), 'pdf');
    const g = claudeCodeAdapter.collectGlobal(ctxOf(home), []);
    expect(g.skills.find((s) => s.provider.kind === 'user' && s.name === 'pdf')!.enabled).toBe(false);
    const synced = g.skills.find((s) => s.provider.kind === 'account' && s.name === 'pdf')!;
    expect(synced.account?.shortNameTakenBy).toBeUndefined();
  });

  it('a skill bundled in a disabled plugin cannot take a synced skill\'s short name', () => {
    home = buildHome({ enabledPlugins: { 'figma@synced': false } });
    writeSkillDir(join(pluginsRoot(home), 'figma', 'skills'), 'pdf');
    const g = claudeCodeAdapter.collectGlobal(ctxOf(home), []);
    expect(g.skills.find((s) => s.bundledInPlugin === 'figma@synced')!.enabled).toBe(false);
    const synced = g.skills.find((s) => s.provider.kind === 'account' && s.name === 'pdf')!;
    expect(synced.account?.shortNameTakenBy).toBeUndefined();
  });
});
