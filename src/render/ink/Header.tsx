import { Box, Text } from 'ink';
import type { Inventory } from '../../types.js';

export function Header({ inv, status }: { inv: Inventory; status: 'idle' | 'rescanning' }) {
  return (
    <Box justifyContent="space-between">
      <Text>
        <Text bold>skillsight</Text> <Text dimColor>{inv.homeRoot}</Text>
      </Text>
      <Text>
        {status === 'rescanning' ? (
          <Text color="yellow">● rescanning</Text>
        ) : (
          <Text color="green">● live</Text>
        )}
        {inv.warnings.length > 0 ? <Text color="yellow"> · ⚠ {inv.warnings.length}</Text> : null}
      </Text>
    </Box>
  );
}
