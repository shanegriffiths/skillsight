import { useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { itemRows, sortItemRows, type ItemSort } from './rows.js';
import { ItemTable } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { useListDetail } from './listDetail.js';
import { Position } from './Position.js';

// Header + tab bar + view title + position line + footer + margins.
const CHROME = 9;

export function GlobalView({ inv, inputActive = true }: { inv: Inventory; inputActive?: boolean }) {
  const [sort, setSort] = useState<ItemSort>('used');
  const rows = sortItemRows(itemRows(inv.global), sort);
  const height = Math.max(3, useWindowSize().rows - CHROME);
  const { detail, selected, start, end, onInput } = useListDetail(rows.length, height);

  useInput((input, key) => {
    if (!detail && input === 's') {
      setSort((m) => (m === 'used' ? 'name' : 'used'));
      return;
    }
    onInput(input, key);
  }, { isActive: inputActive });

  if (detail) {
    return (
      <Box flexDirection="column">
        <DetailView row={rows[selected]} />
        <Text dimColor>Esc/← back · 1/2/3 or Tab switch · q quit</Text>
      </Box>
    );
  }

  const shown = rows.slice(start, end);

  return (
    <Box flexDirection="column">
      <Text bold>
        global <Text dimColor>({rows.length}) — inherited everywhere</Text>
      </Text>
      {rows.length === 0 ? (
        <Text dimColor>no global items</Text>
      ) : (
        <ItemTable rows={shown} showMarks selectedIndex={selected - start} />
      )}
      <Position start={start} end={end} total={rows.length} height={height} />
      <Text dimColor>↑/↓ scroll · Enter detail · s sort ({sort}) · 1/2/3 or Tab switch · q quit</Text>
    </Box>
  );
}
