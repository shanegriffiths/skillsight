import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { itemRows } from './rows.js';
import { ItemTable } from './ItemTable.js';
import { useScroll } from './scroll.js';

// Header + tab bar + view title + position line + footer + margins.
const CHROME = 8;

export function GlobalView({ inv }: { inv: Inventory }) {
  const rows = itemRows(inv.global);
  const height = Math.max(3, useWindowSize().rows - CHROME);
  const { selected, start, end, moveUp, moveDown } = useScroll(rows.length, height);

  useInput((input, key) => {
    if (key.downArrow || input === 'j') moveDown();
    if (key.upArrow || input === 'k') moveUp();
  });

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
    </Box>
  );
}
