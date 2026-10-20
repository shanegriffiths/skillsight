/**
 * Claude Code "account" source: plugins and skills synced down from the
 * user's claude.ai account (Claude Code ≥ 2.1.273).
 *
 * On disk:
 *  - `~/.claude/plugins/synced/<org>_<user>/` — `manifest.json` + one folder per
 *    plugin (+ `<folder>.meta.json`). The folder and the manifest `name` can be
 *    a UUID; the real name lives in `<folder>/.claude-plugin/plugin.json`.
 *    Claude Code loads each as `<name>@synced` with no install record.
 *  - `~/.claude/skills/synced/<org>_<user>/` — `manifest.json` + one skill dir
 *    per entry. Claude Code names them `anthropic-skills:<name>`.
 *
 * Both roots may hold several `<org>_<user>` buckets; all are scanned.
 * `.staging` and other dot entries are sync scratch space and skipped.
 *
 * Docs: https://code.claude.com/docs/en/plugins/loading#synced-plugins
 *       https://code.claude.com/docs/en/skills#how-synced-skills-behave
 */
import { join } from 'node:path';
import type { Bucket, PluginRecord, SkillRecord, Warning } from '../types.js';
import type { HomeCtx } from '../runtimes.js';
import { readJson, readDirEntries, exists } from '../fsread.js';
import { realpathSafe } from '../symlinks.js';
import { readFrontmatterFile } from '../frontmatter.js';
import { pluginRecordAndSkills, type InstalledEntry } from './claude-code-plugin.js';

export const SYNCED_ORIGIN = 'synced';
/** Namespace Claude Code reserves for synced skills' full names. */
export const SYNCED_SKILL_NS = 'anthropic-skills';

interface PluginManifestEntry {
  pluginId?: string;
  name?: string;
  description?: string;
  version?: string;
  updatedAt?: string;
  marketplaceName?: string;
}
interface PluginSyncManifest {
  plugins?: PluginManifestEntry[];
}
interface PluginMeta {
  server_plugin_id?: string;
  marketplace_name?: string;
}
interface SkillManifestEntry {
  skillId?: string;
  name?: string;
  updatedAt?: string;
  /** `anthropic`, `anthropic-example`, or `plugin` (a skill made on the account). */
  source?: string;
  /** `anthropic` when present; Anthropic's example skills often omit it. */
  creatorType?: string;
}
interface SkillSyncManifest {
  skills?: SkillManifestEntry[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Visible child directories of a sync bucket (skips `.staging` & co). */
function bucketDirs(root: string): string[] {
  return readDirEntries(root)
    .filter((e) => !e.name.startsWith('.') && (e.isDir || e.isSymlink))
    .map((e) => join(root, e.name));
}

/**
 * Display name of a synced plugin folder: manifest `name` in
 * `.claude-plugin/plugin.json`, else `package.json` `name`, else the sync
 * manifest's `name` unless it is a UUID, else its description, else the folder.
 */
function resolvePluginName(dir: string, folder: string, entry: PluginManifestEntry | undefined): string {
  const manifest = readJson<{ name?: unknown }>(join(dir, '.claude-plugin', 'plugin.json'));
  if (typeof manifest?.name === 'string' && manifest.name) return manifest.name;
  const pkg = readJson<{ name?: unknown }>(join(dir, 'package.json'));
  if (typeof pkg?.name === 'string' && pkg.name) return pkg.name;
  if (entry?.name && !UUID_RE.test(entry.name)) return entry.name;
  if (entry?.description) return entry.description;
  return folder;
}

/** Version Claude Code reports: the plugin's own manifest, else `package.json`, else the sync manifest. */
function resolvePluginVersion(dir: string, entry: PluginManifestEntry | undefined): string | undefined {
  const manifest = readJson<{ version?: unknown }>(join(dir, '.claude-plugin', 'plugin.json'));
  if (typeof manifest?.version === 'string') return manifest.version;
  const pkg = readJson<{ version?: unknown }>(join(dir, 'package.json'));
  if (typeof pkg?.version === 'string') return pkg.version;
  return entry?.version;
}

/**
 * Scan every synced-plugin bucket under `<claudeHome>/plugins/synced`.
 * `enabledMap` is the merged `enabledPlugins` (keys `<name>@synced`).
 */
export interface SyncedPlugin {
  plugin: PluginRecord;
  skills: SkillRecord[];
  /** The synced folder (`<bucket>/<folder>`), so callers can rebuild the record against other settings. */
  installPath: string;
}

export function scanSyncedPlugins(
  claudeHome: string,
  ctx: HomeCtx,
  enabledMap: Record<string, boolean>,
  warnings?: Warning[],
): SyncedPlugin[] {
  const out: SyncedPlugin[] = [];
  for (const bucket of bucketDirs(join(claudeHome, 'plugins', 'synced'))) {
    const manifestPath = join(bucket, 'manifest.json');
    const manifest = readJson<PluginSyncManifest>(manifestPath, warnings);
    const byName = new Map<string, PluginManifestEntry>();
    const byId = new Map<string, PluginManifestEntry>();
    for (const e of manifest?.plugins ?? []) {
      if (e.name) byName.set(e.name, e);
      if (e.pluginId) byId.set(e.pluginId, e);
    }
    for (const dir of bucketDirs(bucket)) {
      const folder = dir.slice(bucket.length + 1);
      const meta = readJson<PluginMeta>(`${dir}.meta.json`);
      const entry = byName.get(folder) ?? (meta?.server_plugin_id ? byId.get(meta.server_plugin_id) : undefined);
      const name = resolvePluginName(dir, folder, entry);
      const key = `${name}@${SYNCED_ORIGIN}`;
      const installed: InstalledEntry = { scope: 'user', installPath: dir, version: resolvePluginVersion(dir, entry) };
      const rec = pluginRecordAndSkills(key, installed, enabledMap, undefined, ctx);
      const marketplaceName = entry?.marketplaceName ?? meta?.marketplace_name;
      rec.plugin.account = {
        ...(marketplaceName ? { marketplaceName } : {}),
        ...(entry?.updatedAt ? { updatedAt: entry.updatedAt } : {}),
      };
      out.push({ ...rec, installPath: dir });
    }
  }
  return out;
}

/** Anthropic-made when the manifest says so by `creatorType` or by `source` (`anthropic`, `anthropic-example`). */
function isAnthropicMade(entry: SkillManifestEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.creatorType === 'anthropic') return true;
  return entry.source === 'anthropic' || entry.source === 'anthropic-example';
}

/** Scan every synced-skill bucket under `<claudeHome>/skills/synced`. */
export function scanSyncedSkills(claudeHome: string, _ctx: HomeCtx, warnings?: Warning[]): SkillRecord[] {
  const out: SkillRecord[] = [];
  for (const bucket of bucketDirs(join(claudeHome, 'skills', 'synced'))) {
    const manifest = readJson<SkillSyncManifest>(join(bucket, 'manifest.json'), warnings);
    const byName = new Map<string, SkillManifestEntry>();
    for (const e of manifest?.skills ?? []) if (e.name) byName.set(e.name, e);
    for (const dir of bucketDirs(bucket)) {
      const folder = dir.slice(bucket.length + 1);
      if (!exists(join(dir, 'SKILL.md'))) continue;
      const real = realpathSafe(dir);
      const fm = readFrontmatterFile(join(dir, 'SKILL.md'));
      const name = typeof fm.name === 'string' ? fm.name : folder;
      const entry = byName.get(folder) ?? byName.get(name);
      out.push({
        name,
        description: typeof fm.description === 'string' ? fm.description : undefined,
        contentId: real,
        provider: { kind: 'account', path: real },
        usedBy: [],
        enabled: true,
        scope: 'global',
        account: {
          id: `${SYNCED_SKILL_NS}:${name}`,
          creator: isAnthropicMade(entry) ? 'anthropic' : 'user',
          ...(entry?.updatedAt ? { updatedAt: entry.updatedAt } : {}),
        },
      });
    }
  }
  return out;
}

/**
 * Claude Code compares names ignoring case, spacing and invisible characters
 * (compatibility-folded). Close enough here: NFKC + lowercase + strip whitespace
 * and zero-width characters.
 */
export function foldName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s​-‍﻿]/g, '');
}

/**
 * Mark each account skill whose short name another (non-account) skill in
 * `skills` already owns. Reassigns `account` on the account records — callers
 * pass records they own (adapter output, or `effective` copies).
 */
export function flagShortNameTaken(skills: SkillRecord[]): void {
  const owners = new Map<string, string>();
  for (const s of skills) {
    if (s.account) continue;
    const key = foldName(s.name);
    if (!owners.has(key)) owners.set(key, s.bundledInPlugin ?? s.provider.kind);
  }
  for (const s of skills) {
    if (!s.account) continue;
    const owner = owners.get(foldName(s.name));
    // Replace (don't mutate) `account`: effective records are shallow clones
    // that share it with the global record.
    const { shortNameTakenBy: _old, ...rest } = s.account;
    s.account = owner ? { ...rest, shortNameTakenBy: owner } : rest;
  }
}

/**
 * Mark each synced plugin that an enabled plugin from another origin shadows
 * (same manifest name). Mutates the synced records in place.
 */
export function flagShadowedPlugins(plugins: PluginRecord[]): void {
  const owners = new Map<string, string>();
  for (const p of plugins) {
    if (p.account || !p.enabled) continue;
    const key = foldName(p.name);
    if (!owners.has(key)) owners.set(key, p.id);
  }
  for (const p of plugins) {
    if (!p.account) continue;
    const owner = owners.get(foldName(p.name));
    const { shadowedBy: _old, ...rest } = p.account;
    p.account = owner ? { ...rest, shadowedBy: owner } : rest;
  }
}

/** Convenience: run both duplicate checks over one bucket. */
export function flagAccountDuplicates(bucket: Bucket): void {
  flagShortNameTaken(bucket.skills);
  flagShadowedPlugins(bucket.plugins);
}
