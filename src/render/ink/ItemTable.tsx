import { Box, Text } from 'ink';
import type { ItemRow } from './rows.js';

const CURSOR_W = 2;
const KIND_W = 6;
const USED_W = 4;
const SOURCE_W = 22;

function HeaderRow({ showKind, withCursor }: { showKind: boolean; withCursor: boolean }) {
  return (
    <Box>
      {withCursor ? <Box width={CURSOR_W} /> : null}
      {showKind ? (
        <Box width={KIND_W} marginRight={1}>
          <Text dimColor bold>
            KIND
          </Text>
        </Box>
      ) : null}
      <Box flexGrow={1} marginRight={1}>
        <Text dimColor bold>
          NAME
        </Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor bold>
          USED
        </Text>
      </Box>
      <Box width={SOURCE_W}>
        <Text dimColor bold>
          SOURCE
        </Text>
      </Box>
    </Box>
  );
}

function Row({
  row,
  showKind,
  withCursor,
  active,
}: {
  row: ItemRow;
  showKind: boolean;
  withCursor: boolean;
  active: boolean;
}) {
  const isGroup = row.expandState !== undefined;
  const marker = row.expandState === 'expanded' ? '▾' : row.expandState === 'collapsed' ? '▸' : '';
  const label = isGroup ? `${marker} ${row.name} (${row.used})` : row.depth ? `  ${row.name}` : row.name;
  const used = isGroup ? '' : row.used === null ? '—' : row.used === 0 ? '·' : String(row.used);
  const usedDim = row.used === null || row.used === 0;
  const source = isGroup ? '' : row.source ?? '';
  return (
    <Box>
      {withCursor ? (
        <Box width={CURSOR_W}>
          <Text color="cyan" bold>
            {active ? '›' : ' '}
          </Text>
        </Box>
      ) : null}
      {showKind ? (
        <Box width={KIND_W} marginRight={1}>
          <Text dimColor>{row.kind}</Text>
        </Box>
      ) : null}
      <Box flexGrow={1} marginRight={1}>
        <Text wrap="truncate-end" inverse={active} bold={active || isGroup}>
          {label}
        </Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor={usedDim}>{used}</Text>
      </Box>
      <Box width={SOURCE_W}>
        <Text wrap="truncate-end" dimColor={row.sourceDim}>
          {source}
        </Text>
      </Box>
    </Box>
  );
}

export function ItemTable({
  rows,
  showKind = true,
  selectedIndex,
}: {
  rows: ItemRow[];
  showKind?: boolean;
  /** Index (within `rows`) of the highlighted row; omit for no cursor (e.g. an unfocused preview). */
  selectedIndex?: number;
}) {
  const withCursor = selectedIndex !== undefined;
  return (
    <Box flexDirection="column">
      <HeaderRow showKind={showKind} withCursor={withCursor} />
      {rows.map((r, i) => (
        <Row key={i} row={r} showKind={showKind} withCursor={withCursor} active={i === selectedIndex} />
      ))}
    </Box>
  );
}
