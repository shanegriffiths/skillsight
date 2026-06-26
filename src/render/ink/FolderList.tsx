import { Box, Text } from 'ink';
import type { FolderRow } from './tree.js';
import { Badges } from './Badges.js';
import { marksFor } from './runtimeMark.js';
import { theme } from './theme.js';

/**
 * The folder-tree column. Renders pre-windowed `FolderRow[]`: indent by depth, a
 * chevron for nodes with children, the `›` active cursor, a cyan `+N` aggregate
 * count, and a trailing runtime badge strip (which of the six work in this subtree).
 * The label flexes + truncates so the badges stay visible; badges are hidden while
 * the column is unfocused (`dimmed`). `selected` is the in-window index.
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
        const marks = dimmed ? [] : marksFor(r.runtimes ?? []);
        return (
          <Box key={r.nodeId}>
            <Box flexGrow={1} marginRight={marks.length ? 1 : 0}>
              <Text inverse={active && !dimmed} dimColor={dimmed || (globalOnly && !active)} wrap="truncate-end">
                {prefix}
                {r.label}
                {r.count > 0 ? <Text color={theme.accent}> +{r.count}</Text> : null}
              </Text>
            </Box>
            {marks.length ? <Badges marks={marks} /> : null}
          </Box>
        );
      })}
    </Box>
  );
}
