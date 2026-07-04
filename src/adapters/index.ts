/**
 * RuntimeAdapter — the extensibility seam.
 *
 * Each adapter knows how to read one runtime's config into the shared record
 * model. Adapters emit "raw" records (provider best-effort, `usedBy` empty);
 * the resolver dedupes across adapters, canonicalizes `contentId`, and fills
 * `usedBy` from the registry-wide reverse-symlink scan.
 */
import type { Bucket, Runtime, Warning } from '../types.js';
import type { HomeCtx } from '../runtimes.js';

export interface RuntimeAdapter {
  id: Runtime;
  detect(ctx: HomeCtx): boolean;
  collectGlobal(ctx: HomeCtx, warnings: Warning[]): Bucket;
  collectForDirectory(dir: string, ctx: HomeCtx, warnings: Warning[]): Bucket;

  /**
   * Optional post-merge pass over one folder's `effective` bucket, for
   * runtime facts where folder settings re-scope records the folder pass
   * didn't produce (e.g. Claude Code per-folder `skillOverrides` re-resolving
   * a global skill's visibility). Mutates effective records in place; the
   * engine guarantees SKILL records are copies (mergeSkill spreads on insert), but plugin/mcp records are shared references — do not mutate those here.
   */
  refineEffective?(dir: string, effective: Bucket, ctx: HomeCtx): void;
}
