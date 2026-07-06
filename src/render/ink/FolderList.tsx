import { Box, Text } from 'ink';
import type { FolderRow } from './tree.js';
import { theme } from './theme.js';

/**
 * The flat project column, boxed to match the item table (header + rule, then
 * one line per project). Each line: the directory name (plus a dim parent hint
 * for duplicate names) with the `+N` delta right-aligned. The cursor row
 * inverts edge-to-edge; while the column is unfocused (`dimmed`) the cursor
 * shows as a `›` marker instead. `selected` is the in-window index.
 */
export function FolderList({
  rows,
  selected,
  dimmed = false,
  width,
}: {
  rows: FolderRow[];
  selected: number;
  dimmed?: boolean;
  width: number;
}) {
  const contentW = Math.max(10, width - 4);
  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Text wrap="truncate-end" dimColor bold>
        PROJECT
      </Text>
      <Text wrap="truncate-end" dimColor>
        {'─'.repeat(contentW)}
      </Text>
      {rows.length === 0 ? <Text dimColor>no folders discovered</Text> : null}
      {rows.map((r, i) => {
        const active = i === selected;
        const globalOnly = r.count === 0;
        const right = r.count > 0 ? `+${r.count}` : '';
        const hint = r.hint ? ` ${r.hint}` : '';
        let left = `${active ? '›' : ' '} ${r.label}`;
        let mid = contentW - left.length - hint.length - right.length;
        if (mid < 1) {
          left = left.slice(0, Math.max(3, contentW - right.length - 2)) + '…';
          mid = Math.max(1, contentW - left.length - right.length);
        }
        if (active && !dimmed) {
          return (
            <Text key={r.nodeId} wrap="truncate-end" inverse bold>
              {`${left}${hint}${' '.repeat(mid)}${right}`}
            </Text>
          );
        }
        return (
          <Text key={r.nodeId} wrap="truncate-end">
            <Text dimColor={dimmed || (globalOnly && !active)}>{left}</Text>
            {hint ? <Text dimColor>{hint}</Text> : null}
            {' '.repeat(mid)}
            <Text color={dimmed ? undefined : theme.accent} dimColor={dimmed}>
              {right}
            </Text>
          </Text>
        );
      })}
    </Box>
  );
}
