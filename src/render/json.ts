import type { Inventory } from '../types.js';

/** The machine-readable contract (stable schema for the future UI). */
export function renderJson(inv: Inventory): string {
  // `copies` is internal dedup bookkeeping surfaced only via `show` —
  // stripping it keeps this bulk contract byte-identical to prior releases.
  return JSON.stringify(inv, (key, value) => (key === 'copies' ? undefined : value), 2);
}
