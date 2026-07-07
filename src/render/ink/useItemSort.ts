import { useState } from 'react';
import type { ItemRow } from './rows.js';
import { sortGroupedByName } from './sortRows.js';

export type SortMode = 'native' | 'name';

/**
 * The item-list sort toggle shared by the ranked + user-scope tabs. Holds a
 * `native | name` mode (starting native — each tab's own ranking), exposes the
 * label to show in the filter box, an `apply` that alphabetises grouped rows in
 * name mode (identity in native), and a `handleKey` that toggles on `s` and
 * reports whether it consumed the key. `mode` doubles as a reset key so the view
 * can send the cursor back to the top on toggle.
 */
export function useItemSort(nativeLabel: string) {
  const [mode, setMode] = useState<SortMode>('native');
  const label = mode === 'native' ? nativeLabel : 'name';
  const apply = (rows: ItemRow[]): ItemRow[] => (mode === 'name' ? sortGroupedByName(rows) : rows);
  const handleKey = (input: string): boolean => {
    if (input !== 's') return false;
    setMode((m) => (m === 'native' ? 'name' : 'native'));
    return true;
  };
  return { mode, label, apply, handleKey };
}
