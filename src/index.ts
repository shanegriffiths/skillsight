/**
 * Public engine entry point: `scan(homeRoot, opts) -> Inventory`.
 *
 * Pure and renderer-agnostic. Takes an explicit `homeRoot` (defaults to the OS
 * home; tests pass a fixture root) so it never reaches into the real machine
 * unless asked. Nothing here writes to stdout.
 */
import { homedir } from 'node:os';
import type { FolderReport, Inventory, Runtime, Warning } from './types.js';
import { emptyBucket } from './types.js';
import type { HomeCtx } from './runtimes.js';
import { collectSharedStore } from './sharedstore.js';
import { buildReverseSymlinkIndex } from './symlinks.js';
import { claudeCodeAdapter } from './adapters/claude-code.js';
import { codexAdapter } from './adapters/codex.js';
import { hermesAdapter } from './adapters/hermes.js';
import { geminiAdapter } from './adapters/gemini.js';
import { cursorAdapter } from './adapters/cursor.js';
import { opencodeAdapter } from './adapters/opencode.js';
import type { RuntimeAdapter } from './adapters/index.js';
import { enrichBucket, mergeBuckets, sharedStoreBucket, splitByScope, type EnrichContext } from './resolve.js';
import { discover, groupFor } from './discovery.js';
import type { Bucket } from './types.js';
import type { Runtime as RuntimeId } from './types.js';

/** Tag a single adapter's plugins/mcp with the producing runtime. */
function tagBucket(bucket: Bucket, runtime: RuntimeId): Bucket {
  for (const p of bucket.plugins) p.runtime = runtime;
  for (const m of bucket.mcp) m.runtime = runtime;
  return bucket;
}

/**
 * Registered adapters (deep: claude-code/codex/hermes; best-effort: gemini/cursor/opencode).
 *
 * ORDER MATTERS for skill dedup: `mergeSkill` keeps the first-inserted record
 * on equal provider rank, so claude-code's position at index 0 is what lets
 * its visibility/enabled fields survive when the same content is linked into
 * another runtime's skills dir. Re-check that assumption before reordering.
 */
const ADAPTERS: RuntimeAdapter[] = [
  claudeCodeAdapter,
  codexAdapter,
  hermesAdapter,
  geminiAdapter,
  cursorAdapter,
  opencodeAdapter,
];

export interface ScanOptions {
  /** Walk the filesystem for projects (default true). */
  walk?: boolean;
  /** Inspect a single directory instead of discovering. */
  dir?: string;
  /** Environment for config-home resolution (defaults to process.env). */
  env?: Record<string, string | undefined>;
}

export function scan(homeRoot: string = homedir(), opts: ScanOptions = {}): Inventory {
  const ctx: HomeCtx = { homeRoot, env: opts.env ?? process.env };
  const warnings: Warning[] = [];

  const shared = collectSharedStore(ctx);
  warnings.push(...shared.warnings);
  const enr: EnrichContext = {
    sharedByRealpath: new Map(shared.skills.map((s) => [s.realPath, s])),
    reverseIndex: buildReverseSymlinkIndex(ctx),
  };

  const active = ADAPTERS.filter((a) => a.detect(ctx));
  const detected: Runtime[] = active.map((a) => a.id);

  const global = mergeBuckets(
    ...active.map((a) => tagBucket(enrichBucket(a.collectGlobal(ctx, warnings), a.id, enr), a.id)),
    sharedStoreBucket(shared.skills, enr),
  );

  const dirs = opts.dir ? [opts.dir] : discover(ctx, { walk: opts.walk ?? true });
  const folders: FolderReport[] = dirs.map((dir) => {
    const folderBucket = mergeBuckets(
      ...active.map((a) => tagBucket(enrichBucket(a.collectForDirectory(dir, ctx, warnings), a.id, enr), a.id)),
    );
    const { projectScoped, local } = splitByScope(folderBucket);
    const effective = mergeBuckets(global, folderBucket);
    for (const a of active) a.refineEffective?.(dir, effective, ctx);
    return {
      path: dir,
      group: groupFor(dir, homeRoot),
      runtimes: detected,
      global: emptyBucket(), // inherited layer lives at Inventory.global
      projectScoped,
      local,
      effective,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    homeRoot,
    runtimesDetected: detected,
    warnings,
    global,
    folders,
  };
}

export * from './types.js';
export * from './runtimes.js';
