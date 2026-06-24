import { Box, Text } from 'ink';
import type { Bucket, FolderReport } from '../../types.js';
import { itemRows, type ItemRow } from './rows.js';

const KIND_W = 6;
const USED_W = 4;
const SOURCE_W = 22;

function HeaderRow() {
  return (
    <Box>
      <Box width={KIND_W} marginRight={1}>
        <Text dimColor bold>
          KIND
        </Text>
      </Box>
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

function Row({ row }: { row: ItemRow }) {
  const used = row.used === null ? '—' : row.used === 0 ? '·' : String(row.used);
  const usedDim = row.used === null || row.used === 0;
  return (
    <Box>
      <Box width={KIND_W} marginRight={1}>
        <Text dimColor>{row.kind}</Text>
      </Box>
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

function Section({ title, b }: { title: string; b: Bucket }) {
  const rows = itemRows(b);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 20);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        {title} <Text dimColor>({rows.length})</Text>
      </Text>
      <HeaderRow />
      {shown.map((r, i) => (
        <Row key={`${title}-${i}`} row={r} />
      ))}
      {rows.length > shown.length ? (
        <Text dimColor>
          {'  '}…and {rows.length - shown.length} more
        </Text>
      ) : null}
    </Box>
  );
}

export function DetailPane({ folder }: { folder: FolderReport | undefined }) {
  if (!folder) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text dimColor>select a folder</Text>
      </Box>
    );
  }
  const empty = itemRows(folder.projectScoped).length + itemRows(folder.local).length === 0;
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold underline>
        {folder.path}
      </Text>
      {empty ? <Text dimColor>global only — adds nothing beyond the inherited layer</Text> : null}
      <Section title="project-scoped" b={folder.projectScoped} />
      <Section title="local" b={folder.local} />
    </Box>
  );
}
