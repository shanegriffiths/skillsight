import { Box, Text } from 'ink';
import type { ItemRow } from './rows.js';

const KIND_W = 6;
const USED_W = 4;
const SOURCE_W = 22;

function HeaderRow({ showKind }: { showKind: boolean }) {
  return (
    <Box>
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

function Row({ row, showKind }: { row: ItemRow; showKind: boolean }) {
  const used = row.used === null ? '—' : row.used === 0 ? '·' : String(row.used);
  const usedDim = row.used === null || row.used === 0;
  return (
    <Box>
      {showKind ? (
        <Box width={KIND_W} marginRight={1}>
          <Text dimColor>{row.kind}</Text>
        </Box>
      ) : null}
      <Box flexGrow={1} marginRight={1}>
        <Text wrap="truncate-end">{row.name}</Text>
      </Box>
      <Box width={USED_W} marginRight={1} justifyContent="flex-end">
        <Text dimColor={usedDim}>{used}</Text>
      </Box>
      <Box width={SOURCE_W}>
        <Text wrap="truncate-end" dimColor={row.sourceDim}>
          {row.source ?? ''}
        </Text>
      </Box>
    </Box>
  );
}

export function ItemTable({ rows, showKind = true }: { rows: ItemRow[]; showKind?: boolean }) {
  return (
    <Box flexDirection="column">
      <HeaderRow showKind={showKind} />
      {rows.map((r, i) => (
        <Row key={i} row={r} showKind={showKind} />
      ))}
    </Box>
  );
}
