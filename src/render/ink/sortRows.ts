import type { ItemRow } from './rows.js';

const byName = (a: ItemRow, b: ItemRow) => a.name.localeCompare(b.name);

/**
 * Reorder a grouped row list by `cmp` without breaking its group structure. The
 * input is the output of `groupedRows`/`groupBySource`: a flat list where a group
 * header (`expandState` set) is immediately followed by its `depth: 1` children,
 * and everything else is a top-level leaf.
 *
 * We partition into units — a header plus its contiguous children, or a lone leaf
 * — sort each group's children by name, then sort the units by `cmp(head)`, then
 * flatten. So a group floats to its head's slot with its children ordered inside;
 * leaves interleave. `cmp` compares the head rows. Pure; never mutates input.
 */
export function sortGroupedBy(rows: ItemRow[], cmp: (a: ItemRow, b: ItemRow) => number): ItemRow[] {
  const units: ItemRow[][] = [];
  for (const r of rows) {
    const unit = units[units.length - 1];
    // A depth-1 child belongs to the open unit; anything else starts a new one.
    if (r.depth === 1 && unit) unit.push(r);
    else units.push([r]);
  }

  for (const unit of units) {
    if (unit.length > 1) {
      const [head, ...children] = unit;
      children.sort(byName);
      unit.splice(0, unit.length, head!, ...children);
    }
  }
  units.sort((a, b) => cmp(a[0]!, b[0]!));
  return units.flat();
}

/** Alphabetise a grouped row list — units by head name, children by name. */
export function sortGroupedByName(rows: ItemRow[]): ItemRow[] {
  return sortGroupedBy(rows, byName);
}
