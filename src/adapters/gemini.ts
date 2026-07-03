/**
 * Gemini CLI adapter (best-effort).
 *
 * `~/.gemini/settings.json` → `mcpServers` (+ `skills.disabled`). Native skills
 * at `~/.gemini/skills/*` (symlinks into the hub). Extensions at
 * `~/.gemini/extensions/<ext>/gemini-extension.json` each carry their own
 * `mcpServers`. Transport quirk: `httpUrl` = http, `url` = sse (see mcp.ts).
 */
import { join } from 'node:path';
import type { Bucket } from '../types.js';
import { emptyBucket } from '../types.js';
import { runtimeById, runtimeHome, type HomeCtx } from '../runtimes.js';
import { exists, readJson, readDirEntries } from '../fsread.js';
import { scanSkillsDir } from '../skillscan.js';
import { normalizeGeminiTransport, buildMcpRecords } from '../mcp.js';
import type { RuntimeAdapter } from './index.js';

const DEF = runtimeById('gemini-cli')!;

interface GeminiSettings {
  mcpServers?: Record<string, Record<string, unknown>>;
  skills?: { disabled?: string[] };
}

function geminiHome(ctx: HomeCtx): string {
  return runtimeHome(DEF, ctx);
}

function collectExtensionMcp(home: string): Bucket['mcp'] {
  const out: Bucket['mcp'] = [];
  const extRoot = join(home, 'extensions');
  for (const e of readDirEntries(extRoot)) {
    if (!e.isDir || e.name.startsWith('.')) continue;
    const manifestPath = join(extRoot, e.name, 'gemini-extension.json');
    const manifest = readJson<{ mcpServers?: Record<string, Record<string, unknown>> }>(manifestPath);
    out.push(
      ...buildMcpRecords(manifest?.mcpServers, normalizeGeminiTransport, 'global', {
        kind: 'plugin',
        pluginId: e.name,
        path: manifestPath,
      }),
    );
  }
  return out;
}

export const geminiAdapter: RuntimeAdapter = {
  id: 'gemini-cli',

  detect(ctx) {
    return exists(geminiHome(ctx));
  },

  collectGlobal(ctx, warnings) {
    const home = geminiHome(ctx);
    const bucket: Bucket = emptyBucket();
    const settingsPath = join(home, 'settings.json');
    const settings = readJson<GeminiSettings>(settingsPath, warnings);

    bucket.mcp.push(
      ...buildMcpRecords(settings?.mcpServers, normalizeGeminiTransport, 'global', { kind: 'user', path: settingsPath }),
    );
    bucket.mcp.push(...collectExtensionMcp(home));

    // Gemini's `/skills disable <name>` stores skill NAMES (frontmatter-derived),
    // so matching `s.name` is correct here — unlike Codex, which stores paths.
    const disabled = new Set(settings?.skills?.disabled ?? []);
    for (const s of scanSkillsDir(join(home, 'skills'), ctx, 'global')) {
      if (disabled.has(s.name)) s.enabled = false;
      bucket.skills.push(s);
    }
    return bucket;
  },

  collectForDirectory(dir, ctx, warnings) {
    const bucket: Bucket = emptyBucket();
    const settingsPath = join(dir, '.gemini', 'settings.json');
    const settings = readJson<GeminiSettings>(settingsPath, warnings);
    bucket.mcp.push(
      ...buildMcpRecords(settings?.mcpServers, normalizeGeminiTransport, 'project-scoped', { kind: 'project-local', path: settingsPath }),
    );
    bucket.skills.push(...scanSkillsDir(join(dir, '.gemini', 'skills'), ctx, 'project-scoped'));
    return bucket;
  },
};
