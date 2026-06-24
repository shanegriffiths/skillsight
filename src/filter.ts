/**
 * Post-scan filtering for `--runtime` and `--kind`. Pure: takes an Inventory,
 * returns a narrowed copy (skills by `usedBy`, plugins by runtime/supports, MCP
 * by producing runtime).
 */
import type { Bucket, Inventory, Kind, Runtime } from './types.js';
import { emptyBucket } from './types.js';

export interface FilterOptions {
  runtimes?: Runtime[];
  kinds?: Kind[];
}

function filterBucket(b: Bucket, runtimeSet?: Set<Runtime>, kindSet?: Set<Kind>): Bucket {
  const out = emptyBucket();
  if (!kindSet || kindSet.has('skill')) {
    out.skills = b.skills.filter((s) => !runtimeSet || s.usedBy.some((r) => runtimeSet.has(r)));
  }
  if (!kindSet || kindSet.has('plugin')) {
    out.plugins = b.plugins.filter(
      (p) =>
        !runtimeSet ||
        (p.runtime !== undefined && runtimeSet.has(p.runtime)) ||
        p.supportsRuntimes.some((r) => runtimeSet.has(r)),
    );
  }
  if (!kindSet || kindSet.has('mcp')) {
    out.mcp = b.mcp.filter((m) => !runtimeSet || (m.runtime !== undefined && runtimeSet.has(m.runtime)));
  }
  return out;
}

export function filterInventory(inv: Inventory, opts: FilterOptions): Inventory {
  const runtimeSet = opts.runtimes?.length ? new Set(opts.runtimes) : undefined;
  const kindSet = opts.kinds?.length ? new Set(opts.kinds) : undefined;
  if (!runtimeSet && !kindSet) return inv;

  return {
    ...inv,
    global: filterBucket(inv.global, runtimeSet, kindSet),
    folders: inv.folders.map((f) => ({
      ...f,
      global: filterBucket(f.global, runtimeSet, kindSet),
      projectScoped: filterBucket(f.projectScoped, runtimeSet, kindSet),
      local: filterBucket(f.local, runtimeSet, kindSet),
      effective: filterBucket(f.effective, runtimeSet, kindSet),
    })),
  };
}
