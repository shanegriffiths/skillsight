/**
 * Codex adapter (deep).
 *
 * Reads `~/.codex/config.toml` (env: `CODEX_HOME`): `[mcp_servers.*]`,
 * `[plugins."name@marketplace"]`, and `[[skills.config]]` enablement. Skills come
 * from `~/.codex/skills/*` (symlinks into the hub) plus the bundled
 * `~/.codex/skills/.system/*` (provider `runtime-builtin`). `[marketplaces.*]` is
 * runtime-managed state, not surfaced as config.
 */
import { join, basename } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type { Bucket, PluginRecord, SkillRecord, Warning } from '../types.js';
import { emptyBucket } from '../types.js';
import { runtimeById, runtimeHome, type HomeCtx } from '../runtimes.js';
import { exists, readText, readDirEntries } from '../fsread.js';
import { realpathSafe } from '../symlinks.js';
import { scanSkillsDir } from '../skillscan.js';
import { readFrontmatterFile } from '../frontmatter.js';
import { normalizeCodexTransport, buildMcpRecords } from '../mcp.js';
import type { RuntimeAdapter } from './index.js';

const DEF = runtimeById('codex')!;

interface CodexConfig {
  mcp_servers?: Record<string, Record<string, unknown>>;
  plugins?: Record<string, { enabled?: boolean; version?: string }>;
  skills?: { config?: Array<{ path?: string; enabled?: boolean }> };
}

function codexHome(ctx: HomeCtx): string {
  return runtimeHome(DEF, ctx);
}

function parseConfig(path: string, warnings: Warning[]): CodexConfig | undefined {
  const raw = readText(path);
  if (raw === undefined) return undefined;
  try {
    return parseToml(raw) as CodexConfig;
  } catch {
    warnings.push({ path, reason: 'unreadable: malformed TOML' });
    return undefined;
  }
}

/** Skill directory names explicitly disabled via `[[skills.config]]` (matched by path basename). */
function disabledSkillNames(config: CodexConfig | undefined): Set<string> {
  const out = new Set<string>();
  for (const entry of config?.skills?.config ?? []) {
    if (entry.enabled === false && entry.path) out.add(basename(entry.path));
  }
  return out;
}

function scanSystemSkills(
  systemDir: string,
  ctx: HomeCtx,
  enabledFor: (dirName: string) => boolean,
): SkillRecord[] {
  const out: SkillRecord[] = [];
  for (const e of readDirEntries(systemDir)) {
    if (e.name.startsWith('.') || (!e.isDir && !e.isSymlink)) continue;
    const real = realpathSafe(join(systemDir, e.name));
    const fm = readFrontmatterFile(join(systemDir, e.name, 'SKILL.md'));
    out.push({
      name: typeof fm.name === 'string' ? fm.name : e.name,
      description: typeof fm.description === 'string' ? fm.description : undefined,
      contentId: real,
      provider: { kind: 'runtime-builtin', path: real },
      usedBy: [],
      enabled: enabledFor(e.name),
      scope: 'global',
    });
  }
  return out;
}

export const codexAdapter: RuntimeAdapter = {
  id: 'codex',

  detect(ctx) {
    return exists(codexHome(ctx));
  },

  collectGlobal(ctx, warnings) {
    const home = codexHome(ctx);
    const bucket: Bucket = emptyBucket();
    const configPath = join(home, 'config.toml');
    const config = parseConfig(configPath, warnings);

    // MCP servers
    bucket.mcp.push(
      ...buildMcpRecords(config?.mcp_servers, normalizeCodexTransport, 'global', {
        kind: 'user',
        path: configPath,
      }),
    );

    // plugins
    for (const [key, val] of Object.entries(config?.plugins ?? {})) {
      const at = key.lastIndexOf('@');
      const plugin: PluginRecord = {
        id: key,
        name: at === -1 ? key : key.slice(0, at),
        marketplace: at === -1 ? '' : key.slice(at + 1),
        version: val.version ?? 'unknown',
        scope: 'user',
        enabled: val.enabled !== false,
        provides: { skills: [], commands: [], agents: [], mcpServers: [] },
        supportsRuntimes: ['codex'],
      };
      bucket.plugins.push(plugin);
    }

    // skills: user dir (symlinks -> hub) + bundled .system.
    // `[[skills.config]]` stores PATHS; disablement matches the directory name.
    const disabled = disabledSkillNames(config);
    const enabledFor = (dirName: string) => !disabled.has(dirName);
    bucket.skills.push(
      ...scanSkillsDir(join(home, 'skills'), ctx, 'global', enabledFor),
      ...scanSystemSkills(join(home, 'skills', '.system'), ctx, enabledFor),
    );

    return bucket;
  },

  collectForDirectory(dir, ctx) {
    const bucket: Bucket = emptyBucket();
    // project skills live in .codex/skills; the shared .agents/skills project hub is not scanned yet (ROADMAP "Beyond v0.2")
    bucket.skills.push(...scanSkillsDir(join(dir, '.codex', 'skills'), ctx, 'project-scoped'));
    return bucket;
  },
};
