import { Box, Text } from 'ink';
import { TABS, type TabId } from './tabs.js';

export function TabBar({ active }: { active: TabId }) {
  return (
    <Box marginBottom={1}>
      {TABS.map((t) => (
        <Box key={t.id} marginRight={2}>
          <Text dimColor>{t.key}</Text>
          <Text inverse={t.id === active} bold={t.id === active}>
            {` ${t.label} `}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
