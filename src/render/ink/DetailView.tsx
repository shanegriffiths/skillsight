import { Box, Text } from 'ink';
import type { ItemRow } from './rows.js';
import { detailFields } from './detail.js';

export function DetailView({ row }: { row: ItemRow | undefined }) {
  if (!row) {
    return (
      <Box flexGrow={1}>
        <Text dimColor>nothing selected</Text>
      </Box>
    );
  }
  const fields = detailFields(row);
  const labelW = Math.max(4, ...fields.map((f) => f.label.length));
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold underline>
        {row.name}
      </Text>
      {fields.map((f, i) => (
        <Box key={i}>
          <Box width={labelW + 2}>
            <Text dimColor>{f.label}</Text>
          </Box>
          <Box flexGrow={1}>
            <Text wrap="truncate-end" dimColor={f.dim}>
              {f.value}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
