import type { Bucket, SkillRecord } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { mergeBuckets } from '../../resolve.js';
import { itemRows, type ItemRow } from './rows.js';

/**
 * Build the navigable item list for a bucket pair. Skills that declare
 * `bundledInPlugin` collapse under their plugin's row: when the bucket holds a
 * matching PluginRecord (`id === bundledInPlugin`) that record IS the header
 * (its scope/status/source render there, and it is not repeated as a leaf);
 * otherwise a synthetic header (`kind: 'plugin'`, no `record`) stands in.
 * Headers carry `expandState`, `used` = child count, and `groupId` = the plugin
 * id. Expanded groups reveal their children at `depth: 1`. Standalone skills,
 * unmatched plugins, and mcp are leaves.
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

  const pluginsById = new Map(merged.plugins.map((p) => [p.id, p]));
  const grouped = new Set<string>();

  const out: ItemRow[] = [];
  for (const pluginId of [...groups.keys()].sort()) {
    const children = groups.get(pluginId)!;
    const open = expanded.has(pluginId);
    const plugin = pluginsById.get(pluginId);
    if (plugin) grouped.add(pluginId);
    const base: ItemRow = plugin
      ? itemRows({ ...emptyBucket(), plugins: [plugin] })[0]!
      : { kind: 'plugin', name: pluginId.split('@')[0]!, used: null, source: null, sourceDim: false };
    out.push({ ...base, used: children.length, expandState: open ? 'expanded' : 'collapsed', groupId: pluginId });
    if (open) {
      out.push(...itemRows({ ...emptyBucket(), skills: children }).map((r) => ({ ...r, depth: 1 })));
    }
  }
  out.push(...itemRows({ ...emptyBucket(), skills: standalone }));
  out.push(
    ...itemRows({
      ...emptyBucket(),
      plugins: merged.plugins.filter((p) => !grouped.has(p.id)),
      mcp: merged.mcp,
    }),
  );
  return out;
}
