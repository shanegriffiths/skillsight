import type { Inventory } from '../types.js';

/** The machine-readable contract (stable schema for the future UI). */
export function renderJson(inv: Inventory): string {
  return JSON.stringify(inv, null, 2);
}
