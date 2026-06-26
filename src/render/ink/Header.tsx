import { Box, Text } from 'ink';
import type { Inventory } from '../../types.js';
import { theme } from './theme.js';

export function Header({ inv, status }: { inv: Inventory; status: 'idle' | 'rescanning' }) {
  return (
    <Box justifyContent="space-between">
      <Text>
        <Text bold>skillsight</Text> <Text dimColor>{inv.homeRoot}</Text>
      </Text>
      <Text>
        {status === 'rescanning' ? (
          <Text color={theme.warn}>● rescanning</Text>
        ) : (
          <Text color={theme.good}>● live</Text>
        )}
        {inv.warnings.length > 0 ? <Text color={theme.warn}> · ⚠ {inv.warnings.length}</Text> : null}
      </Text>
    </Box>
  );
}
