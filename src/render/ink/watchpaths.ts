/**
 * Pure helper: the set of config files whose changes should trigger a re-scan
 * in `skillsight watch`. Returns only paths that currently exist (chokidar
 * watches concrete files).
 *
 * hermes-agent has no single canonical config file to watch (skills are a
 * directory tree), so it is deliberately absent here.
 */
import { join } from 'node:path';
import type { Inventory } from '../../types.js';
import { runtimeById, runtimeHome, sharedLockPath, type HomeCtx } from '../../runtimes.js';
import { exists, readDirEntries } from '../../fsread.js';

/** `<root>/<bucket>/manifest.json` for every claude.ai sync bucket under `root`. */
function syncManifests(root: string): string[] {
  return readDirEntries(root)
    .filter((e) => !e.name.startsWith('.') && (e.isDir || e.isSymlink))
    .map((e) => join(root, e.name, 'manifest.json'));
}

function homeOf(id: string, ctx: HomeCtx): string | undefined {
  const def = runtimeById(id);
  return def ? runtimeHome(def, ctx) : undefined;
}

export function computeWatchPaths(
  homeRoot: string,
  inv: Inventory,
  env: Record<string, string | undefined>,
): string[] {
  const ctx: HomeCtx = { homeRoot, env };
  const paths = new Set<string>();

  const claude = homeOf('claude-code', ctx);
  if (claude) {
    paths.add(join(claude, 'settings.json'));
    paths.add(join(claude, 'settings.local.json'));
    paths.add(join(claude, 'plugins', 'installed_plugins.json'));
    // claude.ai sync writes a fresh manifest per round; plugins/skills come and go with it.
    for (const m of syncManifests(join(claude, 'plugins', 'synced'))) paths.add(m);
    for (const m of syncManifests(join(claude, 'skills', 'synced'))) paths.add(m);
  }
  paths.add(join(homeRoot, '.claude.json'));
  paths.add(sharedLockPath(ctx));
  const codex = homeOf('codex', ctx);
  if (codex) paths.add(join(codex, 'config.toml'));
  const gemini = homeOf('gemini-cli', ctx);
  if (gemini) paths.add(join(gemini, 'settings.json'));
  const cursor = homeOf('cursor', ctx);
  if (cursor) paths.add(join(cursor, 'mcp.json'));
  const opencode = homeOf('opencode', ctx);
  if (opencode) paths.add(join(opencode, 'opencode.json'));

  for (const f of inv.folders) {
    paths.add(join(f.path, '.claude', 'settings.json'));
    paths.add(join(f.path, '.claude', 'settings.local.json'));
    paths.add(join(f.path, '.mcp.json'));
    paths.add(join(f.path, '.cursor', 'mcp.json'));
    paths.add(join(f.path, '.gemini', 'settings.json'));
    paths.add(join(f.path, 'opencode.json'));
  }

  return [...paths].filter(exists);
}
