import type { Bucket, Inventory, Provider, Runtime } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { bucketCounts, mergeBuckets } from '../../resolve.js';
import { itemRows, type ItemRow } from './rows.js';

export interface SummaryStats {
  totals: { skills: number; plugins: number; mcp: number };
  /** Distinct skills each detected runtime uses, highest first. */
  perRuntime: { runtime: Runtime; skills: number }[];
  /** Skill count by provider kind, highest first. */
  perProvider: { kind: Provider['kind']; skills: number }[];
}

/** Dedupe every skill/plugin/mcp across global + all folder layers. */
function universe(inv: Inventory): Bucket {
  return mergeBuckets(inv.global, ...inv.folders.flatMap((f) => [f.projectScoped, f.local]));
}

/** All distinct skills ranked by how many runtimes use them (desc, then name). */
export function leaderboard(inv: Inventory): ItemRow[] {
  const skills = universe(inv).skills;
  return itemRows({ ...emptyBucket(), skills }).sort(
    (a, b) => (b.used ?? 0) - (a.used ?? 0) || a.name.localeCompare(b.name),
  );
}

export function summaryStats(inv: Inventory): SummaryStats {
  const all = universe(inv);
  const totals = bucketCounts(all);

  const perRuntime = inv.runtimesDetected
    .map((runtime) => ({
      runtime,
      skills: all.skills.filter((s) => s.usedBy.includes(runtime)).length,
    }))
    .sort((a, b) => b.skills - a.skills || a.runtime.localeCompare(b.runtime));

  const byKind = new Map<Provider['kind'], number>();
  for (const s of all.skills) byKind.set(s.provider.kind, (byKind.get(s.provider.kind) ?? 0) + 1);
  const perProvider = [...byKind.entries()]
    .map(([kind, skills]) => ({ kind, skills }))
    .sort((a, b) => b.skills - a.skills || a.kind.localeCompare(b.kind));

  return { totals, perRuntime, perProvider };
}
