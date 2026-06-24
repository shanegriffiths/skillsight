import type { Bucket, SkillRecord, PluginRecord, McpRecord } from '../../types.js';

export type ItemKind = 'skill' | 'plugin' | 'mcp';

export interface ItemRow {
  kind: ItemKind;
  name: string;
  /** usedBy count for skills (incl. 0); null when not applicable (plugins, mcp). */
  used: number | null;
  /** Where it lives: owner/repo, marketplace repo, transport kind, or provider kind. */
  source: string | null;
  /** True when `source` is a fallback (provider/transport kind) and should render dim. */
  sourceDim: boolean;
}

function skillRow(s: SkillRecord): ItemRow {
  return {
    kind: 'skill',
    name: s.name,
    used: s.usedBy.length,
    source: s.provider.source ?? s.provider.kind,
    sourceDim: !s.provider.source,
  };
}

function pluginRow(p: PluginRecord): ItemRow {
  return {
    kind: 'plugin',
    name: p.name,
    used: null,
    source: p.marketplaceRepo ?? p.marketplace,
    sourceDim: !p.marketplaceRepo,
  };
}

function mcpRow(m: McpRecord): ItemRow {
  return {
    kind: 'mcp',
    name: m.name,
    used: null,
    source: m.transport.kind,
    sourceDim: true,
  };
}

export function itemRows(b: Bucket): ItemRow[] {
  return [...b.skills.map(skillRow), ...b.plugins.map(pluginRow), ...b.mcp.map(mcpRow)];
}
