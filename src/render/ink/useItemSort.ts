import { useState } from 'react';
import type { ItemRow } from './rows.js';
import type { SortMode } from './sortModes.js';

/**
 * The item-list sort cycle shared by the ranked + user-scope tabs. `s` advances
 * through `modes`, wrapping back to the native mode at index 0. Exposes the
 * active mode's `label` (shown in the filter box) and `apply` (reorders grouped
 * rows), plus a `handleKey` that consumes `s`. `index` doubles as a reset key so
 * the view can send the cursor back to the top on change.
 */
export function useItemSort(modes: SortMode[]) {
  const [index, setIndex] = useState(0);
  const i = index % modes.length;
  const active = modes[i]!;
  const apply = (rows: ItemRow[]): ItemRow[] => active.apply(rows);
  const handleKey = (input: string): boolean => {
    if (input !== 's') return false;
    setIndex((n) => (n + 1) % modes.length);
    return true;
  };
  return { index: i, label: active.label, apply, handleKey };
}
