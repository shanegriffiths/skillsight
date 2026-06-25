import type { Bucket, SkillRecord } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { mergeBuckets } from '../../resolve.js';
import { itemRows, type ItemRow } from './rows.js';

/**
 * Build the navigable item list for the Folders column from a folder's
 * project-scoped ∪ local layers. Skills that declare `bundledInPlugin` collapse
 * under a synthetic plugin-group header (`kind: 'plugin'`, `expandState`, `used`
 * carrying the child count, no `record`). Expanded groups reveal their children
 * at `depth: 1`. Standalone skills, the buckets' own plugins, and mcp are leaves.
 */
export function groupedRows(projectScoped: Bucket, local: Bucket, expanded: Set<string>): ItemRow[] {
  const merged = mergeBuckets(projectScoped, local);

  const groups = new Map<string, SkillRecord[]>();
  const standalone: SkillRecord[] = [];
  for (const s of merged.skills) {
    if (s.bundledInPlugin) {
      const arr = groups.get(s.bundledInPlugin);
      if (arr) arr.push(s);
      else groups.set(s.bundledInPlugin, [s]);
    } else {
      standalone.push(s);
    }
  }

  const out: ItemRow[] = [];
  for (const plugin of [...groups.keys()].sort()) {
    const children = groups.get(plugin)!;
    const open = expanded.has(plugin);
    out.push({
      kind: 'plugin',
      name: plugin,
      used: children.length,
      source: null,
      sourceDim: false,
      expandState: open ? 'expanded' : 'collapsed',
    });
    if (open) {
      out.push(...itemRows({ ...emptyBucket(), skills: children }).map((r) => ({ ...r, depth: 1 })));
    }
  }
  out.push(...itemRows({ ...emptyBucket(), skills: standalone }));
  out.push(...itemRows({ ...emptyBucket(), plugins: merged.plugins, mcp: merged.mcp }));
  return out;
}
