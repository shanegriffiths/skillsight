import { Box, Text } from 'ink';
import terminalLink from 'terminal-link';
import type { ItemRow } from './rows.js';
import { detailFields, type DetailField } from './detail.js';
import { RuntimeLetters } from './RuntimeLetters.js';
import { marksFor, otherCount } from './runtimeMark.js';

function FieldValue({ f }: { f: DetailField }) {
  if (f.runtimes && f.runtimes.length > 0) {
    return <RuntimeLetters marks={marksFor(f.runtimes)} plus={otherCount(f.runtimes)} />;
  }
  const value = f.link ? terminalLink(f.value, f.value, { fallback: (t) => t }) : f.value;
  return (
    <Text wrap="truncate-end" dimColor={f.dim}>
      {value}
    </Text>
  );
}

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
            <FieldValue f={f} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
