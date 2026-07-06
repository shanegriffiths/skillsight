import { Box, Text } from 'ink';
import type { ItemRow } from './rows.js';
import { lettersFor } from './runtimeMark.js';
import { theme } from './theme.js';

/**
 * Bordered item table with real column rules. Every line is a single manually
 * padded string (cells joined by ` │ `, a `─┼─` rule under the header) so the
 * grid is exact and the cursor row can invert edge-to-edge.
 *
 * Variants: `state` (NAME/KIND/SCOPE/VISIBILITY/STATUS/SOURCE/RUNTIMES — the
 * folders + global tabs) and `leaderboard` (NAME/USED/RUNTIMES — reach).
 * Narrow panes shed SOURCE, then RUNTIMES, then SCOPE before crushing NAME.
 */
export type TableVariant = 'state' | 'leaderboard';

/** Lines of vertical chrome the table adds around its rows: border 2 + header + rule. */
export const TABLE_CHROME = 4;

interface Seg {
  text: string;
  color?: string;
  dim?: boolean;
  bold?: boolean;
}

interface Col {
  header: string;
  width: number;
  align?: 'right';
  cell: (row: ItemRow) => Seg;
}

const SEP = ' │ ';
const MIN_NAME = 14;

function pad(text: string, width: number, align?: 'right'): string {
  const t = text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
  const fill = ' '.repeat(width - t.length);
  return align === 'right' ? fill + t : t + fill;
}

function nameSeg(row: ItemRow, dimParked: boolean): Seg {
  const isGroup = row.expandState !== undefined;
  const marker = row.expandState === 'expanded' ? '▾' : row.expandState === 'collapsed' ? '▸' : '';
  const suffix = row.override ? ' (override)' : '';
  const label = isGroup ? `${marker} ${row.name} (${row.used})` : `${row.depth ? '  ' : ''}${row.name}${suffix}`;
  // Dim parked skills only where the VISIBILITY column explains why (the state table);
  // on the ranked tabs it just reads as unexplained grey.
  return { text: label, bold: isGroup, dim: dimParked && !!row.parked };
}

function visibilitySeg(row: ItemRow): Seg {
  if (!row.visibility) return { text: row.record || row.expandState !== undefined ? '—' : '', dim: true };
  const color =
    row.visibility === 'off' ? theme.bad : row.visibility === 'on' ? theme.good : theme.warn;
  return { text: row.visibility, color, dim: row.visibility === 'on' };
}

function statusSeg(row: ItemRow): Seg {
  if (!row.status) return { text: '' };
  return row.status === 'disabled'
    ? { text: 'disabled', color: theme.bad }
    : { text: 'enabled', color: theme.good, dim: true };
}

function usedSeg(row: ItemRow): Seg {
  if (row.expandState !== undefined) return { text: '' }; // group header — count is in the name
  if (row.used === null) return { text: '—', dim: true };
  if (row.used === 0) return { text: '·', dim: true };
  return { text: String(row.used) };
}

function locationsSeg(row: ItemRow): Seg {
  if (row.expandState !== undefined) return { text: '' };
  if (row.everywhere) return { text: 'global', color: theme.good, dim: true };
  const n = row.locations?.length ?? 0;
  return n > 0 ? { text: String(n) } : { text: '·', dim: true };
}

/** Resolve the column set for a variant into exact widths summing to `contentW`. */
function columnsFor(variant: TableVariant, contentW: number): Col[] {
  const cols: Col[] =
    variant === 'leaderboard'
      ? [
          { header: 'NAME', width: 0, cell: (r) => nameSeg(r, false) },
          { header: 'KIND', width: 6, cell: (r) => ({ text: r.expandState !== undefined ? '' : r.kind, dim: true }) },
          { header: 'LOCATIONS', width: 9, cell: locationsSeg },
          { header: 'USED', width: 4, align: 'right', cell: usedSeg },
          { header: 'RUNTIMES', width: 11, cell: (r) => ({ text: lettersFor(r.usedRuntimes ?? []) }) },
        ]
      : [
          { header: 'NAME', width: 0, cell: (r) => nameSeg(r, true) },
          { header: 'KIND', width: 6, cell: (r) => ({ text: r.kind, dim: true }) },
          { header: 'SCOPE', width: 7, cell: (r) => ({ text: r.scope ?? '', dim: true }) },
          { header: 'VISIBILITY', width: 10, cell: visibilitySeg },
          { header: 'STATUS', width: 8, cell: statusSeg },
          { header: 'SOURCE', width: 22, cell: (r) => ({ text: r.source ?? '', dim: r.sourceDim }) },
          { header: 'RUNTIMES', width: 11, cell: (r) => ({ text: lettersFor(r.usedRuntimes ?? []) }) },
        ];

  // Shed trailing-priority columns until NAME keeps a readable width (only those present).
  const shedOrder = ['SOURCE', 'RUNTIMES', 'SCOPE', 'LOCATIONS', 'KIND'];
  const fits = (cs: Col[]) =>
    contentW - cs.reduce((sum, c) => sum + c.width, 0) - SEP.length * (cs.length - 1) >= MIN_NAME;
  let active = cols;
  for (const name of shedOrder) {
    if (fits(active)) break;
    active = active.filter((c) => c.header !== name);
  }
  const fixed = active.reduce((sum, c) => sum + c.width, 0) + SEP.length * (active.length - 1);
  return active.map((c) => (c.header === 'NAME' ? { ...c, width: Math.max(MIN_NAME, contentW - fixed) } : c));
}

// One leading space, carried INSIDE the row/header text so the cursor row's
// inverse background wraps around the left of the first column (the icon/name).
const PAD = ' ';

function RowLine({ row, cols, active }: { row: ItemRow; cols: Col[]; active: boolean }) {
  if (active) {
    // The cursor row inverts edge-to-edge; per-cell colors yield to legibility.
    const line = cols.map((c) => pad(c.cell(row).text, c.width, c.align)).join(SEP);
    return (
      <Text wrap="truncate-end" inverse bold>
        {PAD}
        {line}
      </Text>
    );
  }
  return (
    <Text wrap="truncate-end">
      {PAD}
      {cols.map((c, i) => {
        const seg = c.cell(row);
        return (
          <Text key={c.header}>
            {i > 0 ? <Text dimColor>{SEP}</Text> : null}
            <Text color={seg.color} dimColor={seg.dim} bold={seg.bold}>
              {pad(seg.text, c.width, c.align)}
            </Text>
          </Text>
        );
      })}
    </Text>
  );
}

export function ItemTable({
  rows,
  variant = 'state',
  selectedIndex,
  width,
}: {
  rows: ItemRow[];
  variant?: TableVariant;
  /** Index (within `rows`) of the highlighted row; omit for no cursor (e.g. an unfocused preview). */
  selectedIndex?: number;
  /** Total outer width of the table box (border + padding included). */
  width: number;
}) {
  const contentW = Math.max(MIN_NAME + 8, width - 4 - PAD.length);
  const cols = columnsFor(variant, contentW);
  const header = cols.map((c) => pad(c.header, c.width, c.align)).join(SEP);
  const rule = cols.map((c) => '─'.repeat(c.width)).join('─┼─');
  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Text wrap="truncate-end" dimColor bold>
        {PAD}
        {header}
      </Text>
      <Text wrap="truncate-end" dimColor>
        {PAD}
        {rule}
      </Text>
      {rows.map((r, i) => (
        <RowLine key={i} row={r} cols={cols} active={i === selectedIndex} />
      ))}
    </Box>
  );
}
