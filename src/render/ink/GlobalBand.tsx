import { Box, Text } from 'ink';
import type { Inventory } from '../../types.js';

export function GlobalBand({ inv }: { inv: Inventory }) {
  const g = inv.global;
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
      <Text>
        <Text bold>GLOBAL</Text> <Text dimColor>inherited everywhere</Text>
      </Text>
      <Text>
        {g.skills.length} skills · {g.plugins.length} plugins · {g.mcp.length} mcp
        {'   '}
        <Text dimColor>runtimes: {inv.runtimesDetected.join(', ') || 'none'}</Text>
      </Text>
    </Box>
  );
}
