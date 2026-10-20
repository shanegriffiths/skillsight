/**
 * Building a Claude Code {@link PluginRecord} (+ its bundled skills) from an
 * install location. Shared by the marketplace-install path (`installed_plugins.json`)
 * and the claude.ai-synced path (`plugins/synced/`), which has no install record.
 *
 * Sibling `.codex-plugin/` / `.cursor-plugin/` dirs are NOT parsed as Claude
 * config — they only inform a plugin's `supportsRuntimes`.
 */
import { join, basename } from 'node:path';
import type { PluginRecord, Runtime, SkillRecord } from '../types.js';
import type { HomeCtx } from '../runtimes.js';
import { readJson, readDirEntries, exists } from '../fsread.js';
import { realpathSafe } from '../symlinks.js';
import { readFrontmatterFile } from '../frontmatter.js';

export interface InstalledEntry {
  scope?: 'user' | 'project';
  installPath?: string;
  version?: string;
  projectPath?: string;
}
export interface MarketplaceEntry {
  source?: { source?: string; repo?: string; path?: string };
}
interface PluginManifest {
  description?: string;
  defaultEnabled?: boolean;
  mcpServers?: unknown;
}

const RUNTIME_PLUGIN_SIBLINGS: Record<string, Runtime> = {
  '.codex-plugin': 'codex',
  '.cursor-plugin': 'cursor',
  '.kimi-plugin': 'kimi-code-cli',
  '.opencode': 'opencode',
  '.pi': 'pi',
};

export function splitKey(key: string): { name: string; marketplace: string } {
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

export function pluginRecordAndSkills(
  key: string,
  entry: InstalledEntry,
  enabledMap: Record<string, boolean>,
  marketplaces: Record<string, MarketplaceEntry> | undefined,
  _ctx: HomeCtx,
): { plugin: PluginRecord; skills: SkillRecord[] } {
  const { name, marketplace } = splitKey(key);
  const installPath = entry.installPath ?? '';
  const manifest = readJson<PluginManifest>(join(installPath, '.claude-plugin', 'plugin.json'));
  const mpSource = marketplaces?.[marketplace]?.source;
  const marketplaceRepo = mpSource?.repo ?? mpSource?.path;

  const explicit = enabledMap[key];
  const enabled = explicit ?? manifest?.defaultEnabled ?? true;

  const skillsRoot = join(installPath, 'skills');
  // Only dirs with a SKILL.md are skills; skip support dirs (references/, assets/, …).
  const skillDirs = dirChildren(skillsRoot).filter((name) => exists(join(skillsRoot, name, 'SKILL.md')));
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
