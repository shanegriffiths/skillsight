import type { ItemRow } from './rows.js';

/**
 * Alphabetise a grouped row list without breaking its group structure. The input
 * is the output of `groupedRows`/`groupBySource`: a flat list where a group
 * header (`expandState` set) is immediately followed by its `depth: 1` children,
 * and everything else is a top-level leaf.
 *
 * We partition into units — a header plus its contiguous children, or a lone leaf
 * — sort each group's children by name, sort the units by their head row's name,
 * then flatten. So a group floats to its own label's alphabetical slot with its
 * children ordered inside; leaves interleave by name. Pure; never mutates input.
 */
export function sortGroupedByName(rows: ItemRow[]): ItemRow[] {
  const byName = (a: ItemRow, b: ItemRow) => a.name.localeCompare(b.name);

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
  units.sort((a, b) => byName(a[0]!, b[0]!));
  return units.flat();
}
