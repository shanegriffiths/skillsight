import { Box, Text } from 'ink';
import type { FolderRow } from './tree.js';

/**
 * The folder-tree column. Renders pre-windowed `FolderRow[]`: indent by depth,
 * a chevron for nodes with children, the `›` active cursor, and a cyan `+N`
 * aggregate count. `selected` is the in-window index (or out of range when the
 * column is unfocused).
 */
export function FolderList({
  rows,
  selected,
  dimmed = false,
}: {
  rows: FolderRow[];
  selected: number;
  dimmed?: boolean;
}) {
  return (
    <Box flexDirection="column" width={42} marginRight={1}>
      {rows.length === 0 ? <Text dimColor>no folders discovered</Text> : null}
      {rows.map((r, i) => {
        const active = i === selected;
        const chevron = r.hasChildren ? (r.collapsed ? '▸' : '▾') : ' ';
        const indent = '  '.repeat(r.depth);
        const globalOnly = r.count === 0;
        const prefix = `${active ? '›' : ' '} ${indent}${chevron} `;
        return (
          <Text
            key={r.nodeId}
            inverse={active && !dimmed}
            dimColor={dimmed || (globalOnly && !active)}
            wrap="truncate-end"
          >
            {prefix}
            {r.label}
            {r.count > 0 ? <Text color="cyan"> +{r.count}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}
