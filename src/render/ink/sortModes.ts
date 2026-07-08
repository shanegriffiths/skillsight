import type { ItemRow } from './rows.js';
import { sortGroupedBy } from './sortRows.js';

/** A comparator over the head rows of grouped units. */
type RowCmp = (a: ItemRow, b: ItemRow) => number;

const byName: RowCmp = (a, b) => a.name.localeCompare(b.name);
/** Combine a primary comparator with a name tie-break. */
const then = (primary: RowCmp): RowCmp => (a, b) => primary(a, b) || byName(a, b);

const STATUS = { enabled: 0, disabled: 1 };
const KIND = { skill: 0, plugin: 1, mcp: 2 };
const SCOPE = { user: 0, project: 1, local: 2 };
const VIS = { on: 0, 'name-only': 1, 'user-only': 2, off: 3 };

// A missing attribute sorts as the "top"/neutral bucket (synthetic group headers
// carry no status/scope/visibility): enabled, on, and — for scope — after the
// known scopes so real-scoped items lead.
export const byEnabled: RowCmp = then((a, b) => STATUS[a.status ?? 'enabled'] - STATUS[b.status ?? 'enabled']);
export const byKind: RowCmp = then((a, b) => KIND[a.kind] - KIND[b.kind]);
export const byScope: RowCmp = then((a, b) => (a.scope ? SCOPE[a.scope] : 3) - (b.scope ? SCOPE[b.scope] : 3));
export const byVisibility: RowCmp = then((a, b) => (a.visibility ? VIS[a.visibility] : 0) - (b.visibility ? VIS[b.visibility] : 0));
export const byReach: RowCmp = then((a, b) => (b.used ?? -1) - (a.used ?? -1));
export const byLocations: RowCmp = then((a, b) => (b.locations?.length ?? -1) - (a.locations?.length ?? -1));

/** A selectable sort: its `label` names the column; `apply` reorders grouped rows. */
export interface SortMode {
  label: string;
  apply(rows: ItemRow[]): ItemRow[];
}

/** A keyed sort — reorders the grouped units by `cmp`. */
const mode = (label: string, cmp: RowCmp): SortMode => ({ label, apply: (rows) => sortGroupedBy(rows, cmp) });
/** The tab's built-in order (rows arrive already ranked/grouped) — identity. */
const native = (label: string): SortMode => ({ label, apply: (rows) => rows });

// `s` cycles these in order, wrapping to the native mode. Labels match the tab's
// columns; each tab lists only the modes its data supports.
export const LEADERBOARD_SORTS: SortMode[] = [
  native('uses'), mode('reach', byReach), mode('name', byName), mode('enabled', byEnabled), mode('visibility', byVisibility), mode('scope', byScope), mode('kind', byKind),
];
export const PROJECT_SORTS: SortMode[] = [
  native('locations'), mode('name', byName), mode('enabled', byEnabled), mode('scope', byScope), mode('kind', byKind),
];
export const USERSCOPE_SORTS: SortMode[] = [
  native('grouped'), mode('name', byName), mode('enabled', byEnabled), mode('visibility', byVisibility), mode('scope', byScope), mode('kind', byKind),
];
