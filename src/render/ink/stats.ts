import type { Bucket, Inventory, Provider, Runtime } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { bucketCounts, mergeBuckets } from '../../resolve.js';
import { itemRows, sortItemRows, type ItemRow } from './rows.js';

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

function leaderboardRows(all: Bucket): ItemRow[] {
  // Delegates to the shared 'used' comparator (kills the divergent `?? 0` clone —
  // identical output for skill rows, whose `used` is never null).
  return sortItemRows(itemRows({ ...emptyBucket(), skills: all.skills }), 'used');
}

function statsOf(all: Bucket, runtimesDetected: Runtime[]): SummaryStats {
  const totals = bucketCounts(all);
  const perRuntime = runtimesDetected
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

/** All distinct skills ranked by how many runtimes use them (desc, then name). */
export function leaderboard(inv: Inventory): ItemRow[] {
  return leaderboardRows(universe(inv));
}

export function summaryStats(inv: Inventory): SummaryStats {
  return statsOf(universe(inv), inv.runtimesDetected);
}

/** Rows + stats from ONE universe merge (LeaderboardView calls this per render). */
export function leaderboardStats(inv: Inventory): { rows: ItemRow[]; stats: SummaryStats } {
  const all = universe(inv);
  return { rows: leaderboardRows(all), stats: statsOf(all, inv.runtimesDetected) };
}
