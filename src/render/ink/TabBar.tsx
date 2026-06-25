import { Box, Text } from 'ink';

export type TabId = 'folders' | 'global' | 'leaderboard';

const TABS: { id: TabId; key: string; label: string }[] = [
  { id: 'folders', key: '1', label: 'Folders' },
  { id: 'global', key: '2', label: 'Global' },
  { id: 'leaderboard', key: '3', label: 'Leaderboard' },
];

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
