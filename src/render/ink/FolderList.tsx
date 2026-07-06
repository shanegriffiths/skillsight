import { Box, Text } from 'ink';
import type { FolderRow } from './tree.js';
import { icons } from './icons.js';
import { theme } from './theme.js';

/**
 * The project column, boxed to match the item table (header + rule, then one
 * line per row). Plain projects are flat leaves; a repo with worktrees is an
 * expandable parent (chevron) nesting a dim `worktrees` group and its checkouts
 * beneath it. Each line shows its OWN `+N` delta right-aligned. The cursor row
 * inverts edge-to-edge; while unfocused (`dimmed`) the selection stays bright
 * (bold, undimmed) while its siblings fade. `selected` is the in-window index.
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
        const isWorktrees = r.kind === 'worktrees';
        const globalOnly = r.count === 0 && r.kind === 'project' && !r.hasChildren;
        const chevron = r.hasChildren ? (r.collapsed ? '▸ ' : '▾ ') : '';
        const indent = '  '.repeat(r.depth);
        const glyph = isWorktrees ? icons.worktrees : icons.folder;
        const iconPart = glyph ? `${glyph} ` : '';
        const hint = r.hint ? ` ${r.hint}` : '';
        const right = r.count > 0 ? `+${r.count}` : '';

        // No cursor glyph — the full-row highlight (or, when unfocused, the
        // undimmed selection) carries selection, so content sits flush left.
        let left = `${indent}${chevron}${iconPart}${r.label}`;
        const rightBlock = hint.length + right.length;
        // Cap `left` so left + a ≥1 gap + rightBlock never exceeds contentW
        // (else Ink's truncate-end would eat the trailing count).
        const maxLeft = Math.max(3, contentW - rightBlock - 1);
        if (left.length > maxLeft) left = left.slice(0, maxLeft - 1) + '…';
        const mid = Math.max(1, contentW - left.length - rightBlock);

        if (active && !dimmed) {
          return (
            <Text key={r.nodeId} wrap="truncate-end" inverse bold>
              {`${left}${hint}${' '.repeat(mid)}${right}`}
            </Text>
          );
        }
        const labelDim = dimmed ? !active : isWorktrees || (globalOnly && !active);
        return (
          <Text key={r.nodeId} wrap="truncate-end">
            <Text dimColor={labelDim} bold={dimmed && active}>
              {left}
            </Text>
            {hint ? <Text dimColor>{hint}</Text> : null}
            {' '.repeat(mid)}
            <Text color={dimmed ? undefined : theme.accent} dimColor={dimmed && !active}>
              {right}
            </Text>
          </Text>
        );
      })}
    </Box>
  );
}
