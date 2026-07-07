import type { Bucket, Scope, SkillRecord, PluginRecord, McpRecord, Runtime, SkillVisibility } from '../../types.js';

export type ItemKind = 'skill' | 'plugin' | 'mcp';

/** SCOPE column — user (everywhere) / project (committed) / local (machine-personal). */
export type ItemScope = 'user' | 'project' | 'local';

/** VISIBILITY column (skills only) — mirrors the /skills menu labels. */
export type ItemVisibility = 'on' | 'name-only' | 'user-only' | 'off';

/** STATUS column — plain enablement, orthogonal to visibility. */
export type ItemStatus = 'enabled' | 'disabled';

export interface ItemRow {
  kind: ItemKind;
  name: string;
  /** usedBy count for skills (incl. 0); null when not applicable (plugins, mcp). */
  used: number | null;
  /** Where it lives: owner/repo, marketplace repo, transport kind, or provider kind. */
  source: string | null;
  /** True when `source` is a fallback (provider/transport kind) and should render dim. */
  sourceDim: boolean;
  /** Runtimes to letter: a skill's usedBy, or a plugin/mcp's single declaring runtime. Absent on synthetic group headers. */
  usedRuntimes?: Runtime[];
  /** The underlying record, so a cursored row can open its detail. Absent on synthetic group-header rows. */
  record?: SkillRecord | PluginRecord | McpRecord;
  /** Indent depth; `1` for a plugin group's child skills. */
  depth?: number;
  /** Present only on plugin-group header rows. */
  expandState?: 'collapsed' | 'expanded';
  /** Expansion key for group headers (the plugin id); display `name` may be shorter. */
  groupId?: string;
  /** True for a skill parked by Claude Code visibility (`name-only` / `user-invocable-only`): still available, reduced/zero context cost. */
  parked?: boolean;
  scope?: ItemScope;
  /** Absent for plugins/mcp (rendered as a dim placeholder). */
  visibility?: ItemVisibility;
  /** Absent on synthetic group headers with no record. */
  status?: ItemStatus;
  /** True when a plugin row is a per-folder enablement override of an inherited plugin. */
  override?: boolean;
  /** Leaderboard: present in the inherited global layer (lives in every project). */
  everywhere?: boolean;
  /** Leaderboard: project folder paths where this item appears in a delta. */
  locations?: string[];
}

/** The expansion/identity key of a row: group id when present, else the name. */
export function groupKey(row: ItemRow): string {
  return row.groupId ?? row.name;
}

function displayScope(s: Scope): ItemScope {
  if (s === 'global') return 'user';
  if (s === 'local') return 'local';
  return 'project';
}

function displayVisibility(v: SkillVisibility | undefined): ItemVisibility {
  if (v === 'user-invocable-only') return 'user-only';
  return v ?? 'on';
}

/**
 * The repo a skill was installed from — its lock `source` (hub skills) or
 * marketplace repo (plugin-bundled). `null` when it has neither (a machine-local
 * skill): such a skill has no install unit to group under. The single definition
 * of "source", shared by the row's SOURCE cell and the group-by-source logic.
 */
export function skillSource(s: SkillRecord): string | null {
  return s.provider.source ?? s.provider.marketplaceRepo ?? null;
}

function skillRow(s: SkillRecord): ItemRow {
  const parked = s.visibility === 'name-only' || s.visibility === 'user-invocable-only';
  const source = skillSource(s);
  return {
    kind: 'skill',
    name: s.name,
    used: s.usedBy.length,
    source: source ?? s.provider.kind,
    sourceDim: !source,
    record: s,
    usedRuntimes: s.usedBy,
    ...(parked ? { parked: true } : {}),
    scope: displayScope(s.scope),
    visibility: displayVisibility(s.visibility),
    status: s.enabled ? 'enabled' : 'disabled',
  };
}

function pluginRow(p: PluginRecord): ItemRow {
  return {
    kind: 'plugin',
    name: p.name,
    used: null,
    source: p.marketplaceRepo ?? p.marketplace,
    sourceDim: !p.marketplaceRepo,
    record: p,
    usedRuntimes: p.runtime ? [p.runtime] : [],
    // An override row shows the layer that flipped it (project/local); a plain
    // plugin shows its install scope (user/project).
    scope: p.override ?? (p.scope === 'project' ? 'project' : 'user'),
    status: p.enabled ? 'enabled' : 'disabled',
    ...(p.override ? { override: true } : {}),
  };
}

function mcpRow(m: McpRecord): ItemRow {
  return {
    kind: 'mcp',
    name: m.name,
    used: null,
    source: m.transport.kind,
    sourceDim: true,
    record: m,
    usedRuntimes: m.runtime ? [m.runtime] : [],
    scope: displayScope(m.scope),
    status: m.enabled ? 'enabled' : 'disabled',
  };
}

export function itemRows(b: Bucket): ItemRow[] {
  return [...b.skills.map(skillRow), ...b.plugins.map(pluginRow), ...b.mcp.map(mcpRow)];
}

export type ItemSort = 'used' | 'name';

/** Sort a copy of `rows`: `used` desc (null last) then name; `name` alphabetical. */
export function sortItemRows(rows: ItemRow[], mode: ItemSort): ItemRow[] {
  const byName = (a: ItemRow, b: ItemRow) => a.name.localeCompare(b.name);
  if (mode === 'name') return [...rows].sort(byName);
  return [...rows].sort((a, b) => (b.used ?? -1) - (a.used ?? -1) || byName(a, b));
}
