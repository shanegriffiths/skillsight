/**
 * Cursor adapter (best-effort, MCP only in v1).
 *
 * Cursor has no "skills" concept — any `.cursor/skills/` on disk is a harness
 * artifact symlinked into the hub and is credited to the shared store via the
 * reverse-symlink scan, not to Cursor. So this adapter surfaces only MCP servers
 * (`~/.cursor/mcp.json` + project `.cursor/mcp.json`). Rules (`.cursor/rules`)
 * are roadmap.
 */
import { join } from 'node:path';
import type { Bucket } from '../types.js';
import { emptyBucket } from '../types.js';
import { runtimeById, runtimeHome, type HomeCtx } from '../runtimes.js';
import { exists, readJson } from '../fsread.js';
import { normalizeCursorTransport, buildMcpRecords } from '../mcp.js';
import type { RuntimeAdapter } from './index.js';

const DEF = runtimeById('cursor')!;

interface CursorMcp {
  mcpServers?: Record<string, Record<string, unknown>>;
}

function cursorHome(ctx: HomeCtx): string {
  return runtimeHome(DEF, ctx);
}

export const cursorAdapter: RuntimeAdapter = {
  id: 'cursor',

  detect(ctx) {
    return exists(cursorHome(ctx));
  },

  collectGlobal(ctx, warnings) {
    const bucket: Bucket = emptyBucket();
    const path = join(cursorHome(ctx), 'mcp.json');
    const mcp = readJson<CursorMcp>(path, warnings);
    bucket.mcp.push(
      ...buildMcpRecords(mcp?.mcpServers, normalizeCursorTransport, 'global', { kind: 'user', path }),
    );
    return bucket;
  },

  collectForDirectory(dir, ctx, warnings) {
    const bucket: Bucket = emptyBucket();
    const path = join(dir, '.cursor', 'mcp.json');
    const mcp = readJson<CursorMcp>(path, warnings);
    bucket.mcp.push(
      ...buildMcpRecords(mcp?.mcpServers, normalizeCursorTransport, 'project-scoped', { kind: 'project-local', path }),
    );
    return bucket;
  },
};
