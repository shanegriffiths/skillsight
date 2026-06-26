/**
 * Pure model for the dashboard filter bar: the chip list (detected runtimes,
 * then kinds) and immutable toggling of the two filter sets. The component and
 * App wiring stay thin; this is the testable core.
 */
import type { Runtime, Kind } from '../../types.js';

export type Chip = { kind: 'runtime'; id: Runtime } | { kind: 'kind'; id: Kind };

const KINDS: Kind[] = ['skill', 'plugin', 'mcp'];

/** Linear chip list: detected runtimes (given order) first, then skill/plugin/mcp. */
export function chips(detected: Runtime[]): Chip[] {
  return [
    ...detected.map((id): Chip => ({ kind: 'runtime', id })),
    ...KINDS.map((id): Chip => ({ kind: 'kind', id })),
  ];
}

/** Is this chip currently selected, given the two filter sets? */
export function isChipSelected(c: Chip, runtimes: ReadonlySet<Runtime>, kinds: ReadonlySet<Kind>): boolean {
  return c.kind === 'runtime' ? runtimes.has(c.id) : kinds.has(c.id);
}

/** Flip the chip in its own dimension; returns NEW sets (immutable). */
export function toggleChip(
  c: Chip,
  runtimes: ReadonlySet<Runtime>,
  kinds: ReadonlySet<Kind>,
): { runtimes: Set<Runtime>; kinds: Set<Kind> } {
  const rt = new Set(runtimes);
  const kd = new Set(kinds);
  if (c.kind === 'runtime') {
    if (rt.has(c.id)) rt.delete(c.id);
    else rt.add(c.id);
  } else {
    if (kd.has(c.id)) kd.delete(c.id);
    else kd.add(c.id);
  }
  return { runtimes: rt, kinds: kd };
}
