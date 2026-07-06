import type { Bucket, Inventory, PluginRecord, Provider, Runtime, SkillRecord } from '../../types.js';
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

/** Stable identity of an item across folders (skills by contentId, plugins by id, mcp by name). */
function itemKey(r: ItemRow): string {
  if (r.kind === 'skill') return `skill:${(r.record as SkillRecord).contentId}`;
  if (r.kind === 'plugin') return `plugin:${(r.record as PluginRecord).id}`;
  return `mcp:${r.name}`;
}

/**
 * Every distinct skill/plugin/mcp, deduped across global + all folder deltas,
 * each enriched with `everywhere` (present in the inherited global layer) and
 * the `locations` (folder paths) it lives in. `used`/`usedBy` is unioned via
 * `universe()`. Unsorted — callers pick the ordering.
 */
function enrichedItems(inv: Inventory): ItemRow[] {
  const rows = itemRows(universe(inv));
  const globalKeys = new Set(itemRows(inv.global).map(itemKey));
  const locations = new Map<string, Set<string>>();
  for (const f of inv.folders) {
    for (const r of [...itemRows(f.projectScoped), ...itemRows(f.local)]) {
      const k = itemKey(r);
      (locations.get(k) ?? locations.set(k, new Set()).get(k)!).add(f.path);
    }
  }
  return rows.map((r): ItemRow => {
    const k = itemKey(r);
    return { ...r, everywhere: globalKeys.has(k), locations: [...(locations.get(k) ?? [])].sort() };
  });
}

const byName = (a: ItemRow, b: ItemRow) => a.name.localeCompare(b.name);

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

/** Everything ranked by usage (runtime reach) desc, then name — the Leaderboard tab. */
export function leaderboard(inv: Inventory): ItemRow[] {
  return enrichedItems(inv).sort((a, b) => (b.used ?? -1) - (a.used ?? -1) || byName(a, b));
}

/**
 * Project-scoped items (never global) ranked by installed footprint — how many
 * projects each lives in — then usage, then name. The "Installed" tab: what
 * you've added per-project and where.
 */
export function installed(inv: Inventory): ItemRow[] {
  return enrichedItems(inv)
    .filter((r) => !r.everywhere)
    .sort(
      (a, b) =>
        (b.locations?.length ?? 0) - (a.locations?.length ?? 0) ||
        (b.used ?? -1) - (a.used ?? -1) ||
        byName(a, b),
    );
}

export function summaryStats(inv: Inventory): SummaryStats {
  return statsOf(universe(inv), inv.runtimesDetected);
}

export function leaderboardStats(inv: Inventory): { rows: ItemRow[]; stats: SummaryStats } {
  return { rows: leaderboard(inv), stats: statsOf(universe(inv), inv.runtimesDetected) };
}
