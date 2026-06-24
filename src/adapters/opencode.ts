/**
 * OpenCode adapter (best-effort).
 *
 * `(XDG_CONFIG_HOME ?? ~/.config)/opencode/opencode.json[c]`. MCP servers live
 * under the **`mcp`** key (NOT `mcpServers`) — using the wrong key silently finds
 * zero servers. Native skills at `<home>/skills/*` (symlinks into the hub).
 */
import { join } from 'node:path';
import type { Bucket, Warning } from '../types.js';
import { emptyBucket } from '../types.js';
import { runtimeById, runtimeHome, type HomeCtx } from '../runtimes.js';
import { exists, readText, readJson } from '../fsread.js';
import { scanSkillsDir } from '../skillscan.js';
import { normalizeOpencodeTransport, buildMcpRecords } from '../mcp.js';
import type { RuntimeAdapter } from './index.js';

const DEF = runtimeById('opencode')!;

interface OpencodeConfig {
  mcp?: Record<string, Record<string, unknown>>;
}

function opencodeHome(ctx: HomeCtx): string {
  return runtimeHome(DEF, ctx);
}

/** Tolerant JSONC: strip comments + trailing commas, then JSON.parse. */
function parseJsonc(raw: string): unknown {
  const noComments = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const noTrailingCommas = noComments.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(noTrailingCommas);
}

/** Read `opencode.json`, falling back to `opencode.jsonc`. */
function readConfig(dir: string, warnings: Warning[]): { config: OpencodeConfig | undefined; path: string } {
  const jsonPath = join(dir, 'opencode.json');
  const json = readJson<OpencodeConfig>(jsonPath, warnings);
  if (json) return { config: json, path: jsonPath };

  const jsoncPath = join(dir, 'opencode.jsonc');
  const raw = readText(jsoncPath);
  if (raw !== undefined) {
    try {
      return { config: parseJsonc(raw) as OpencodeConfig, path: jsoncPath };
    } catch {
      warnings.push({ path: jsoncPath, reason: 'unreadable: malformed JSONC' });
    }
  }
  return { config: undefined, path: jsonPath };
}

export const opencodeAdapter: RuntimeAdapter = {
  id: 'opencode',

  detect(ctx) {
    return exists(opencodeHome(ctx));
  },

  collectGlobal(ctx, warnings) {
    const home = opencodeHome(ctx);
    const bucket: Bucket = emptyBucket();
    const { config, path } = readConfig(home, warnings);
    bucket.mcp.push(
      ...buildMcpRecords(config?.mcp, normalizeOpencodeTransport, 'global', { kind: 'user', path }),
    );
    bucket.skills.push(...scanSkillsDir(join(home, 'skills'), ctx, 'global'));
    return bucket;
  },

  collectForDirectory(dir, ctx, warnings) {
    const bucket: Bucket = emptyBucket();
    const { config, path } = readConfig(dir, warnings);
    bucket.mcp.push(
      ...buildMcpRecords(config?.mcp, normalizeOpencodeTransport, 'project-scoped', { kind: 'project-local', path }),
    );
    bucket.skills.push(...scanSkillsDir(join(dir, '.opencode', 'skills'), ctx, 'project-scoped'));
    return bucket;
  },
};
