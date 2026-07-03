import { Box } from 'ink';
import type { ReactNode } from 'react';
import { theme } from './theme.js';

/** The bordered band chrome shared by GLOBAL and STATS. */
export function Band({ children, marginTop }: { children: ReactNode; marginTop?: number }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} marginTop={marginTop}>
      {children}
    </Box>
  );
}
