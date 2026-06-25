import { Box, Text } from 'ink';
import type { Bucket, FolderReport } from '../../types.js';
import { itemRows } from './rows.js';
import { ItemTable } from './ItemTable.js';

function Section({ title, b }: { title: string; b: Bucket }) {
  const rows = itemRows(b);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 20);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        {title} <Text dimColor>({rows.length})</Text>
      </Text>
      <ItemTable rows={shown} />
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
