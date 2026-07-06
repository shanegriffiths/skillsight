import { useMemo, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { groupKey } from './rows.js';
import { groupedRows } from './grouping.js';
import { ItemTable, TABLE_CHROME } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { useListDetail } from './listDetail.js';
import { Position } from './Position.js';
import { HEADER_BOX_HEIGHT } from './HeaderBox.js';
import { theme } from './theme.js';

// Header box + table chrome + position line + footer.
const CHROME = HEADER_BOX_HEIGHT + TABLE_CHROME + 1 + 1;

export function GlobalView({ inv, inputActive = true }: { inv: Inventory; inputActive?: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = useMemo(() => groupedRows(inv.global, emptyBucket(), expanded), [inv.global, expanded]);
  const size = useWindowSize();
  const height = Math.max(3, size.rows - CHROME);
  const { detail, selected, start, end, onInput } = useListDetail(rows.length, height);

  useInput((input, key) => {
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
        <Text dimColor>Esc/← back · 1/2/3 or Tab switch · q quit</Text>
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
      <Text dimColor>↑/↓ move · Enter expand/detail · 1/2/3 or Tab switch · q quit</Text>
    </Box>
  );
}
