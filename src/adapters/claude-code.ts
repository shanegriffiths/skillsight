/**
 * Claude Code adapter (full).
 *
 * Reads settings (`enabledPlugins` across user/local scopes), the plugin
 * registry (`installed_plugins.json` v2), marketplace sources, `~/.claude.json`
 * (project registry + MCP servers), user skills, and per-plugin contributions.
 * Sibling `.codex-plugin/` / `.cursor-plugin/` dirs are NOT parsed as Claude
 * config — they only inform a plugin's `supportsRuntimes`.
 */
import { join, basename } from 'node:path';
import type { Bucket, PluginRecord, Runtime, SkillRecord, Warning } from '../types.js';
import { emptyBucket } from '../types.js';
import { runtimeById, runtimeHome, type HomeCtx } from '../runtimes.js';
import { readJson, readDirEntries, exists } from '../fsread.js';
import { realpathSafe } from '../symlinks.js';
import { scanSkillsDir } from '../skillscan.js';
import { readFrontmatterFile } from '../frontmatter.js';
import { normalizeClaudeTransport, buildMcpRecords } from '../mcp.js';
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
}
interface InstalledEntry {
  scope?: 'user' | 'project';
  installPath?: string;
  version?: string;
  projectPath?: string;
}
interface InstalledPlugins {
  version?: number;
  plugins?: Record<string, InstalledEntry[]>;
}
interface MarketplaceEntry {
  source?: { source?: string; repo?: string; path?: string };
}
interface PluginManifest {
  description?: string;
  defaultEnabled?: boolean;
  mcpServers?: unknown;
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
    cfg = {
      installed: readJson<InstalledPlugins>(join(home, 'plugins', 'installed_plugins.json'), pending),
      marketplaces: readJson<Record<string, MarketplaceEntry>>(join(home, 'plugins', 'known_marketplaces.json'), pending),
      claudeJson: readJson<ClaudeJson>(claudeJsonPath(ctx), pending),
      userSettings,
      userSkillOverrides: parseSkillOverrides(userSettings?.skillOverrides, settingsPath, pending),
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

const RUNTIME_PLUGIN_SIBLINGS: Record<string, Runtime> = {
  '.codex-plugin': 'codex',
  '.cursor-plugin': 'cursor',
  '.kimi-plugin': 'kimi-code-cli',
  '.opencode': 'opencode',
  '.pi': 'pi',
};

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

function splitKey(key: string): { name: string; marketplace: string } {
  const at = key.lastIndexOf('@');
  return at === -1
    ? { name: key, marketplace: '' }
    : { name: key.slice(0, at), marketplace: key.slice(at + 1) };
}

function dirChildren(dir: string): string[] {
  return readDirEntries(dir)
    .filter((e) => !e.name.startsWith('.') && (e.isDir || e.isSymlink))
    .map((e) => e.name);
}
function mdBasenames(dir: string): string[] {
  return readDirEntries(dir)
    .filter((e) => !e.isDir && e.name.endsWith('.md'))
    .map((e) => basename(e.name, '.md'));
}

function pluginMcpNames(installPath: string, manifest: PluginManifest | undefined): string[] {
  const names = new Set<string>();
  const m = manifest?.mcpServers;
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    for (const k of Object.keys(m as Record<string, unknown>)) names.add(k);
  }
  const sidecar = readJson<{ mcpServers?: Record<string, unknown> }>(join(installPath, '.mcp.json'));
  if (sidecar?.mcpServers) for (const k of Object.keys(sidecar.mcpServers)) names.add(k);
  return [...names];
}

function detectSupportsRuntimes(installPath: string): Runtime[] {
  const out: Runtime[] = ['claude-code'];
  for (const [dir, runtime] of Object.entries(RUNTIME_PLUGIN_SIBLINGS)) {
    if (exists(join(installPath, dir))) out.push(runtime);
  }
  if (exists(join(installPath, 'gemini-extension.json'))) out.push('gemini-cli');
  return [...new Set(out)].sort();
}

function pluginRecordAndSkills(
  key: string,
  entry: InstalledEntry,
  enabledMap: Record<string, boolean>,
  marketplaces: Record<string, MarketplaceEntry> | undefined,
  ctx: HomeCtx,
): { plugin: PluginRecord; skills: SkillRecord[] } {
  const { name, marketplace } = splitKey(key);
  const installPath = entry.installPath ?? '';
  const manifest = readJson<PluginManifest>(join(installPath, '.claude-plugin', 'plugin.json'));
  const mpSource = marketplaces?.[marketplace]?.source;
  const marketplaceRepo = mpSource?.repo ?? mpSource?.path;

  const explicit = enabledMap[key];
  const enabled = explicit ?? manifest?.defaultEnabled ?? true;

  const skillDirs = dirChildren(join(installPath, 'skills'));
  const supportsRuntimes = detectSupportsRuntimes(installPath);

  const plugin: PluginRecord = {
    id: key,
    name,
    ...(typeof manifest?.description === 'string' ? { description: manifest.description } : {}),
    marketplace,
    marketplaceRepo,
    version: entry.version ?? 'unknown',
    scope: entry.scope === 'project' ? 'project' : 'user',
    ...(entry.scope === 'project' && entry.projectPath ? { projectPath: entry.projectPath } : {}),
    enabled,
    provides: {
      skills: skillDirs,
      commands: mdBasenames(join(installPath, 'commands')),
      agents: mdBasenames(join(installPath, 'agents')),
      mcpServers: pluginMcpNames(installPath, manifest),
      hooks: exists(join(installPath, 'hooks', 'hooks.json')) ? ['hooks.json'] : undefined,
    },
    supportsRuntimes,
  };

  const skills: SkillRecord[] = skillDirs.map((sName) => {
    const real = realpathSafe(join(installPath, 'skills', sName));
    const fm = readFrontmatterFile(join(installPath, 'skills', sName, 'SKILL.md'));
    return {
      name: typeof fm.name === 'string' ? fm.name : sName,
      description: typeof fm.description === 'string' ? fm.description : undefined,
      contentId: real,
      provider: { kind: 'plugin', pluginId: key, marketplace, marketplaceRepo, path: real },
      usedBy: [],
      bundledInPlugin: key,
      supportsRuntimes,
      enabled,
      scope: plugin.scope === 'project' ? 'project-scoped' : 'global',
    };
  });

  return { plugin, skills };
}

export const claudeCodeAdapter: RuntimeAdapter = {
  id: 'claude-code',

  detect(ctx) {
    return exists(claudeHome(ctx)) || exists(claudeJsonPath(ctx));
  },

  collectGlobal(ctx, warnings) {
    const home = claudeHome(ctx);
    const bucket: Bucket = emptyBucket();

    const { installed, marketplaces, claudeJson, userSettings, userSkillOverrides } = globalConfig(ctx, warnings);
    const enabledMap = mergeEnabled(
      userSettings,
      readJson<SettingsFile>(join(home, 'settings.local.json'), warnings),
    );

    for (const [key, entries] of Object.entries(installed?.plugins ?? {})) {
      for (const entry of entries) {
        if (entry.scope !== 'user') continue;
        const { plugin, skills } = pluginRecordAndSkills(key, entry, enabledMap, marketplaces, ctx);
        bucket.plugins.push(plugin);
        bucket.skills.push(...skills);
      }
    }

    // user skills (~/.claude/skills/*), user-layer visibility resolved by DIR name
    bucket.skills.push(
      ...scanSkillsDir(join(home, 'skills'), ctx, 'global', undefined, (dirName) =>
        visibilityOverlay(resolveVisibility(dirName, { user: userSkillOverrides })),
      ),
    );

    // user-scope MCP servers (~/.claude.json top-level mcpServers)
    bucket.mcp.push(
      ...buildMcpRecords(claudeJson?.mcpServers, normalizeClaudeTransport, 'global', {
        kind: 'user',
        path: claudeJsonPath(ctx),
      }, () => true),
    );

    return bucket;
  },

  collectForDirectory(dir, ctx, warnings) {
    const bucket: Bucket = emptyBucket();

    const settings = folderSettings(dir, warnings);
    const projEnabled = mergeEnabled(settings.project, settings.local);

    // project-scoped plugins installed for this directory
    const { installed, marketplaces, claudeJson } = globalConfig(ctx);
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
    for (const key of Object.keys(projEnabled)) {
      if (projectHere.has(key)) continue; // already surfaced as a project install
      const entries = installed?.plugins?.[key];
      const base = entries?.find((e) => e.scope === 'user') ?? entries?.[0];
      if (!base) continue; // dangling enabledPlugins key — nothing installed to override
      const { plugin } = pluginRecordAndSkills(key, base, projEnabled, marketplaces, ctx);
      plugin.override = localKeys.has(key) ? 'local' : 'project';
      bucket.plugins.push(plugin);
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
