import { Box, Text } from 'ink';
import type { Inventory } from '../../types.js';
import { Badges } from './Badges.js';
import { marksFor } from './runtimeMark.js';
import { theme } from './theme.js';

export function GlobalBand({ inv }: { inv: Inventory }) {
  const g = inv.global;
  return (
    <Box borderStyle="round" borderColor={theme.border} paddingX={1} flexDirection="column">
      <Text>
        <Text bold>GLOBAL</Text> <Text dimColor>inherited everywhere</Text>
      </Text>
      <Text>
        {g.skills.length} skills · {g.plugins.length} plugins · {g.mcp.length} mcp{'   '}
        <Text dimColor>runtimes: </Text>
        {inv.runtimesDetected.length ? (
          <Badges marks={marksFor(inv.runtimesDetected)} />
        ) : (
          <Text dimColor>none</Text>
        )}
      </Text>
    </Box>
  );
}
