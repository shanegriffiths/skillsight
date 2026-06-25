import { useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { itemRows } from './rows.js';
import { ItemTable } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { useScroll } from './scroll.js';

// Header + tab bar + view title + position line + footer + margins.
const CHROME = 8;

export function GlobalView({ inv }: { inv: Inventory }) {
  const rows = itemRows(inv.global);
  const height = Math.max(3, useWindowSize().rows - CHROME);
  const { selected, start, end, moveUp, moveDown } = useScroll(rows.length, height);
  const [detail, setDetail] = useState(false);

  useInput((input, key) => {
    if (detail) {
      if (key.escape || key.leftArrow) setDetail(false);
      return;
    }
    if (key.downArrow || input === 'j') moveDown();
    if (key.upArrow || input === 'k') moveUp();
    if (key.return || key.rightArrow) setDetail(true);
  });

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
        <ItemTable rows={shown} selectedIndex={selected - start} />
      )}
      {rows.length > height ? (
        <Text dimColor>
          {start + 1}–{end} of {rows.length}
        </Text>
      ) : null}
      <Text dimColor>↑/↓ scroll · Enter detail · 1/2/3 or Tab switch · q quit</Text>
    </Box>
  );
}
