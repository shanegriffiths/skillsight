/**
 * Claude Code adapter (full).
 *
 * Reads settings (`enabledPlugins` across user/local scopes), the plugin
 * registry (`installed_plugins.json` v2), marketplace sources, `~/.claude.json`
 * (project registry + MCP servers), user skills, and per-plugin contributions.
 * Sibling `.codex-plugin/` / `.cursor-plugin/` dirs are NOT parsed as Claude
 * config — they only inform a plugin's `supportsRuntimes`.
 */
import { join } from 'node:path';
import type { Bucket, PluginRecord, SkillRecord, Warning } from '../types.js';
import { emptyBucket } from '../types.js';
import { runtimeById, runtimeHome, type HomeCtx } from '../runtimes.js';
import { readJson, readDirEntries, exists } from '../fsread.js';
import { realpathSafe } from '../symlinks.js';
import { scanSkillsDir } from '../skillscan.js';
import { normalizeClaudeTransport, buildMcpRecords } from '../mcp.js';
import { pluginRecordAndSkills, type InstalledEntry, type MarketplaceEntry } from './claude-code-plugin.js';
import type { SyncedPlugin } from './claude-code-synced.js';
import {
  flagAccountDuplicates,
  flagShortNameTaken,
  foldName,
  scanSyncedPlugins,
  scanSyncedSkills,
} from './claude-code-synced.js';
import {
  parseSkillOverrides,
  resolveVisibility,
  visibilityOverlay,
  type SkillOverrides,
  type VisibilityLayers,
} from './claude-code-visibility.js';
import type { RuntimeAdapter } from './index.js';

const DEF = runtimeById('claude-code')!;

interface SettingsFile {
  enabledPlugins?: Record<string, boolean>;
  enableAllProjectMcpServers?: boolean;
  skillOverrides?: unknown;
  /** `false` stops syncing claude.ai plugins on this machine (already-synced ones are trashed). */
  syncClaudeAiPlugins?: boolean;
  /** `false` stops syncing claude.ai skills on this machine. */
  syncClaudeAiSkills?: boolean;
}
interface InstalledPlugins {
  version?: number;
  plugins?: Record<string, InstalledEntry[]>;
}
interface ClaudeJson {
  mcpServers?: Record<string, Record<string, unknown>>;
  projects?: Record<string, ProjectState>;
}
interface ProjectState {
  mcpServers?: Record<string, Record<string, unknown>>;
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
}

interface GlobalConfig {
  installed: InstalledPlugins | undefined;
  marketplaces: Record<string, MarketplaceEntry> | undefined;
  claudeJson: ClaudeJson | undefined;
  /** Parsed `<home>/settings.json` — the single read per scan. */
  userSettings: SettingsFile | undefined;
  /** User-layer `skillOverrides` from `userSettings`, validated. */
  userSkillOverrides: SkillOverrides;
  /** Merged user + user-local `enabledPlugins` (the user-scope enablement layer). */
  userEnabled: Record<string, boolean>;
  /**
   * claude.ai-synced plugins (`<name>@synced`), built against `userEnabled`.
   * Empty when `syncClaudeAiPlugins` is `false`. Per-folder passes rebuild a
   * record from `installPath` when the folder's settings override it.
   */
  synced: SyncedPlugin[];
  /** Warnings captured at read time, delivered to the first caller that provides a sink. */
  pendingWarnings: Warning[];
}

// The four global files are needed for every directory pass; read once per scan
// (scan() shares one HomeCtx). Whichever call reads the files first captures any
// warnings; they're held in `pendingWarnings` and flushed to the first caller
// that passes a `warnings` sink, so call order (collectGlobal vs.
// collectForDirectory) can't silently swallow a malformed-file warning.
const globalConfigCache = new WeakMap<HomeCtx, GlobalConfig>();

// refineEffective must recover each record's DIRECTORY entry name (the
// skillOverrides key) from its realpath. The user-skills index is stable per
// scan — memoize per HomeCtx (same pattern as globalConfigCache).
const userSkillDirIndexCache = new WeakMap<HomeCtx, Map<string, string>>();

/** realpath -> directory entry name, for one skills dir. */
function skillDirIndex(dir: string): Map<string, string> {
  const idx = new Map<string, string>();
  for (const e of readDirEntries(dir)) {
    if (e.name.startsWith('.')) continue;
    if (!e.isDir && !e.isSymlink) continue;
    idx.set(realpathSafe(join(dir, e.name)), e.name);
  }
  return idx;
}

function userSkillDirIndex(ctx: HomeCtx): Map<string, string> {
  let idx = userSkillDirIndexCache.get(ctx);
  if (!idx) {
    idx = skillDirIndex(join(claudeHome(ctx), 'skills'));
    userSkillDirIndexCache.set(ctx, idx);
  }
  return idx;
}

function globalConfig(ctx: HomeCtx, warnings?: Warning[]): GlobalConfig {
  let cfg = globalConfigCache.get(ctx);
  if (!cfg) {
    const pending: Warning[] = [];
    const home = claudeHome(ctx);
    const settingsPath = join(home, 'settings.json');
    const userSettings = readJson<SettingsFile>(settingsPath, pending);
    const userEnabled = mergeEnabled(userSettings, readJson<SettingsFile>(join(home, 'settings.local.json'), pending));
    cfg = {
      installed: readJson<InstalledPlugins>(join(home, 'plugins', 'installed_plugins.json'), pending),
      marketplaces: readJson<Record<string, MarketplaceEntry>>(join(home, 'plugins', 'known_marketplaces.json'), pending),
      claudeJson: readJson<ClaudeJson>(claudeJsonPath(ctx), pending),
      userSettings,
      userSkillOverrides: parseSkillOverrides(userSettings?.skillOverrides, settingsPath, pending),
      userEnabled,
      synced: userSettings?.syncClaudeAiPlugins === false ? [] : scanSyncedPlugins(home, ctx, userEnabled, pending),
      pendingWarnings: pending,
    };
    globalConfigCache.set(ctx, cfg);
  }
  if (warnings && cfg.pendingWarnings.length) {
    warnings.push(...cfg.pendingWarnings);
    cfg.pendingWarnings = [];
  }
  return cfg;
}

function claudeHome(ctx: HomeCtx): string {
  return runtimeHome(DEF, ctx);
}
function claudeJsonPath(ctx: HomeCtx): string {
  return join(ctx.homeRoot, '.claude.json');
}

function mergeEnabled(...files: (SettingsFile | undefined)[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of files) if (f?.enabledPlugins) Object.assign(out, f.enabledPlugins);
  return out;
}

/** A folder's two settings files, parsed. Pass a sink to report malformed JSON. */
function folderSettings(dir: string, warnings?: Warning[]): { project?: SettingsFile; local?: SettingsFile } {
  return {
    project: readJson<SettingsFile>(join(dir, '.claude', 'settings.json'), warnings),
    local: readJson<SettingsFile>(join(dir, '.claude', 'settings.local.json'), warnings),
  };
}

/**
 * Folder-resolved visibility layers (`local > project > user`). Pass a sink
 * to report invalid override values — `collectForDirectory` does;
 * `refineEffective` re-parses silently because the folder pass already
 * reported them for this dir in the same scan.
 */
function buildVisibilityLayers(
  dir: string,
  ctx: HomeCtx,
  settings: { project?: SettingsFile; local?: SettingsFile },
  warnings?: Warning[],
): VisibilityLayers {
  return {
    user: globalConfig(ctx).userSkillOverrides,
    project: parseSkillOverrides(settings.project?.skillOverrides, join(dir, '.claude', 'settings.json'), warnings),
    local: parseSkillOverrides(settings.local?.skillOverrides, join(dir, '.claude', 'settings.local.json'), warnings),
  };
}

export const claudeCodeAdapter: RuntimeAdapter = {
  id: 'claude-code',

  detect(ctx) {
    return exists(claudeHome(ctx)) || exists(claudeJsonPath(ctx));
  },

  collectGlobal(ctx, warnings) {
    const home = claudeHome(ctx);
    const bucket: Bucket = emptyBucket();

    const { installed, marketplaces, claudeJson, userSettings, userSkillOverrides, userEnabled, synced } =
      globalConfig(ctx, warnings);

    for (const [key, entries] of Object.entries(installed?.plugins ?? {})) {
      for (const entry of entries) {
        if (entry.scope !== 'user') continue;
        const { plugin, skills } = pluginRecordAndSkills(key, entry, userEnabled, marketplaces, ctx);
        bucket.plugins.push(plugin);
        bucket.skills.push(...skills);
      }
    }

    // claude.ai-synced plugins (`<name>@synced`): no install record, user scope.
    for (const { plugin, skills } of synced) {
      bucket.plugins.push(plugin);
      bucket.skills.push(...skills);
    }

    // user skills (~/.claude/skills/*), user-layer visibility resolved by DIR name
    bucket.skills.push(
      ...scanSkillsDir(join(home, 'skills'), ctx, 'global', undefined, (dirName) =>
        visibilityOverlay(resolveVisibility(dirName, { user: userSkillOverrides })),
      ),
    );

    // claude.ai-synced skills (`anthropic-skills:<name>`), user scope.
    if (userSettings?.syncClaudeAiSkills !== false) {
      bucket.skills.push(...scanSyncedSkills(home, ctx, warnings));
    }

    // user-scope MCP servers (~/.claude.json top-level mcpServers)
    bucket.mcp.push(
      ...buildMcpRecords(claudeJson?.mcpServers, normalizeClaudeTransport, 'global', {
        kind: 'user',
        path: claudeJsonPath(ctx),
      }, () => true),
    );

    // Same-name checks: a synced skill whose short name a local/plugin skill
    // owns; a synced plugin an enabled plugin from another origin shadows.
    flagAccountDuplicates(bucket);

    return bucket;
  },

  collectForDirectory(dir, ctx, warnings) {
    const bucket: Bucket = emptyBucket();

    const settings = folderSettings(dir, warnings);
    const projEnabled = mergeEnabled(settings.project, settings.local);

    // project-scoped plugins installed for this directory
    const { installed, marketplaces, claudeJson, synced } = globalConfig(ctx);
    const visLayers = buildVisibilityLayers(dir, ctx, settings, warnings);
    for (const [key, entries] of Object.entries(installed?.plugins ?? {})) {
      for (const entry of entries) {
        if (entry.scope !== 'project') continue;
        if (realpathSafe(entry.projectPath ?? '') !== realpathSafe(dir)) continue;
        const { plugin, skills } = pluginRecordAndSkills(key, entry, projEnabled, marketplaces, ctx);
        bucket.plugins.push(plugin);
        bucket.skills.push(...skills);
      }
    }

    // Per-folder enablement OVERRIDES of inherited (user-scope) plugins. Claude
    // Code layers `enabledPlugins` user→project→local per project, so a plugin
    // installed at user scope can be flipped on/off by this folder's settings.
    // Surface each as one plugin row carrying the effective state (no bundled-skill
    // flood — the skills stay in the global layer). `mergeBuckets(global, folder)`
    // then lets this record win in the effective set by id.
    const projectHere = new Set<string>();
    for (const [key, entries] of Object.entries(installed?.plugins ?? {})) {
      for (const e of entries) {
        if (e.scope === 'project' && realpathSafe(e.projectPath ?? '') === realpathSafe(dir)) projectHere.add(key);
      }
    }
    const localKeys = new Set(Object.keys(settings.local?.enabledPlugins ?? {}));
    const syncedById = new Map(synced.map((s) => [s.plugin.id, s]));
    for (const key of Object.keys(projEnabled)) {
      if (projectHere.has(key)) continue; // already surfaced as a project install
      if (syncedById.has(key)) continue; // handled below with the shadow check
      const entries = installed?.plugins?.[key];
      const base = entries?.find((e) => e.scope === 'user') ?? entries?.[0];
      if (!base) continue; // dangling enabledPlugins key — nothing installed to override
      const { plugin } = pluginRecordAndSkills(key, base, projEnabled, marketplaces, ctx);
      plugin.override = localKeys.has(key) ? 'local' : 'project';
      bucket.plugins.push(plugin);
    }

    // Synced plugins re-scoped by this folder: an `enabledPlugins` override of
    // `<name>@synced`, and/or a same-name project install here that shadows the
    // synced copy (Claude Code loads the other origin and skips the synced one).
    // Either way a fresh record is emitted so the cached global one is untouched.
    const projectNames = new Map<string, string>();
    for (const p of bucket.plugins) if (p.enabled && !p.account) projectNames.set(foldName(p.name), p.id);
    for (const { plugin, installPath } of synced) {
      const overridden = Object.prototype.hasOwnProperty.call(projEnabled, plugin.id);
      const shadowedBy = projectNames.get(foldName(plugin.name));
      if (!overridden && !shadowedBy) continue;
      const entry: InstalledEntry = { scope: 'user', installPath, version: plugin.version };
      const fresh = pluginRecordAndSkills(plugin.id, entry, overridden ? projEnabled : {}, undefined, ctx).plugin;
      if (!overridden) fresh.enabled = plugin.enabled;
      if (overridden) fresh.override = localKeys.has(plugin.id) ? 'local' : 'project';
      const { shadowedBy: _global, ...account } = plugin.account ?? {};
      fresh.account = shadowedBy ? { ...account, shadowedBy } : account;
      bucket.plugins.push(fresh);
    }

    // project skills, folder-resolved visibility (local > project > user) by DIR name
    bucket.skills.push(
      ...scanSkillsDir(join(dir, '.claude', 'skills'), ctx, 'project-scoped', undefined, (dirName) =>
        visibilityOverlay(resolveVisibility(dirName, visLayers)),
      ),
    );

    // project-scope MCP (.mcp.json) gated by approval state in ~/.claude.json
    const projState = claudeJson?.projects?.[dir] ?? claudeJson?.projects?.[realpathSafe(dir)];
    const enabledSet = new Set(projState?.enabledMcpjsonServers ?? []);
    const disabledSet = new Set(projState?.disabledMcpjsonServers ?? []);
    const enableAll = [settings.project, settings.local].some((f) => f?.enableAllProjectMcpServers === true);

    const mcpJson = readJson<{ mcpServers?: Record<string, Record<string, unknown>> }>(
      join(dir, '.mcp.json'),
      warnings,
    );
    bucket.mcp.push(
      ...buildMcpRecords(mcpJson?.mcpServers, normalizeClaudeTransport, 'project-scoped', {
        kind: 'project-local',
        path: join(dir, '.mcp.json'),
      }, (name) => enableAll || (enabledSet.has(name) && !disabledSet.has(name))),
    );

    // local-scope MCP (~/.claude.json projects[dir].mcpServers)
    bucket.mcp.push(
      ...buildMcpRecords(projState?.mcpServers, normalizeClaudeTransport, 'local', {
        kind: 'project-local',
        path: claudeJsonPath(ctx),
      }, () => true),
    );

    return bucket;
  },

  refineEffective(dir, effective, ctx) {
    // No warnings sinks here: collectForDirectory already reported these
    // files for this folder in the same scan.

    // Cascade each plugin's effective enablement onto its bundled skills. The
    // merged-in folder override may have flipped a plugin (e.g. user-off,
    // project-on), and bundled skills follow plugin enablement. `effective`
    // skills are clones from mergeBuckets, so this can't leak into `global`.
    const enabledByPlugin = new Map(effective.plugins.map((p) => [p.id, p.enabled]));
    for (const s of effective.skills) {
      if (!s.bundledInPlugin) continue;
      const pe = enabledByPlugin.get(s.bundledInPlugin);
      if (pe !== undefined && pe !== s.enabled) s.enabled = pe;
    }

    // A project skill can take a synced skill's short name in this folder.
    // Skills here are copies, and the flagger reassigns `account` rather than
    // mutating the shared object, so the global record is untouched.
    flagShortNameTaken(effective.skills);

    const layers = buildVisibilityLayers(dir, ctx, folderSettings(dir));
    if (
      !Object.keys(layers.user ?? {}).length &&
      !Object.keys(layers.project ?? {}).length &&
      !Object.keys(layers.local ?? {}).length
    ) {
      return;
    }
    const folderIdx = skillDirIndex(join(dir, '.claude', 'skills'));
    const userIdx = userSkillDirIndex(ctx);
    for (const s of effective.skills) {
      if (s.bundledInPlugin) continue; // plugin skills follow plugin enablement
      const dirName = folderIdx.get(s.provider.path) ?? userIdx.get(s.provider.path);
      if (dirName === undefined) continue;
      const overlay = visibilityOverlay(resolveVisibility(dirName, layers));
      if (overlay) Object.assign(s, overlay);
    }
  },
};
