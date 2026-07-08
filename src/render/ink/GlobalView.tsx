import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { groupKey } from './rows.js';
import { groupedRows } from './grouping.js';
import { ItemTable, TABLE_CHROME } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { useListDetail } from './listDetail.js';
import { useItemSort } from './useItemSort.js';
import { USERSCOPE_SORTS } from './sortModes.js';
import { Position } from './Position.js';
import { HEADER_BOX_HEIGHT } from './HeaderBox.js';
import { FILTER_BAR_HEIGHT } from './FilterBar.js';
import { SCREEN_RESERVE } from './layout.js';
import { theme } from './theme.js';

// Header box + bottom filter bar + table chrome + position line (key hints are
// in the header now, not a bottom footer).
const CHROME = HEADER_BOX_HEIGHT + FILTER_BAR_HEIGHT + TABLE_CHROME + 1;

export function GlobalView({ inv, inputActive = true, onControls, onSort }: { inv: Inventory; inputActive?: boolean; onControls?: (text: string) => void; onSort?: (label: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sort = useItemSort(USERSCOPE_SORTS);
  const base = useMemo(() => groupedRows(inv.global, emptyBucket(), expanded), [inv.global, expanded]);
  const rows = sort.apply(base);
  const size = useWindowSize();
  const height = Math.max(3, size.rows - CHROME - SCREEN_RESERVE);
  const { detail, selected, start, end, onInput } = useListDetail(rows.length, height, sort.index);

  const footer = detail
    ? 'Esc/← back · 1/2/3/4 or Tab switch · q quit'
    : '↑/↓ move · Enter expand/detail · 1/2/3/4 or Tab switch · q quit';
  useEffect(() => {
    onControls?.(footer);
  }, [footer, onControls]);
  useEffect(() => {
    onSort?.(sort.label);
  }, [sort.label, onSort]);

  useInput((input, key) => {
    // `s` toggles sort (list mode only); it resets the cursor + detail.
    if (!detail && sort.handleKey(input)) return;
    // Plugin-group headers expand/collapse in place; everything else follows
    // the shared list/detail mapping.
    const row = rows[selected];
    if (!detail && row?.expandState !== undefined && (key.return || key.rightArrow || key.leftArrow)) {
      const id = groupKey(row);
      setExpanded((prev) => {
        const next = new Set(prev);
        const open = key.leftArrow ? false : key.rightArrow ? true : !next.has(id);
        if (open) next.add(id);
        else next.delete(id);
        return next;
      });
      return;
    }
    onInput(input, key);
  }, { isActive: inputActive });

  if (detail) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor={theme.border} paddingX={1}>
          <DetailView row={rows[selected]} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {rows.length === 0 ? (
        <Text dimColor>no global items</Text>
      ) : (
        <ItemTable rows={rows.slice(start, end)} width={size.columns} selectedIndex={selected - start} />
      )}
      <Position start={start} end={end} total={rows.length} height={height} />
    </Box>
  );
}
