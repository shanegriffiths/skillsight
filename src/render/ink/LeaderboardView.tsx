import { useMemo } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { ItemTable, TABLE_CHROME } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { leaderboardStats, type SummaryStats } from './stats.js';
import { useListDetail } from './listDetail.js';
import { RuntimeLetters } from './RuntimeLetters.js';
import { marksFor } from './runtimeMark.js';
import { Band } from './Band.js';
import { Position } from './Position.js';
import { HEADER_BOX_HEIGHT } from './HeaderBox.js';
import { theme } from './theme.js';

// Header box + table chrome + position line + stats band (~5 lines) + footer.
const CHROME = HEADER_BOX_HEIGHT + TABLE_CHROME + 1 + 5 + 1;

function StatsBand({ stats }: { stats: SummaryStats }) {
  const providers = stats.perProvider.map((p) => `${p.kind} ${p.skills}`).join(' · ') || 'none';
  return (
    <Band marginTop={1}>
      <Text>
        <Text bold>STATS</Text> <Text dimColor>skills by runtime reach</Text>
      </Text>
      <Text>
        <Text dimColor>by runtime </Text>
        {stats.perRuntime.length === 0 ? (
          <Text dimColor>none</Text>
        ) : (
          stats.perRuntime.map((r, i) => (
            <Text key={r.runtime}>
              {i ? '   ' : ''}
              <RuntimeLetters marks={marksFor([r.runtime])} /> <Text dimColor>{r.skills}</Text>
            </Text>
          ))
        )}
      </Text>
      <Text dimColor>by source {providers}</Text>
    </Band>
  );
}

export function LeaderboardView({ inv, inputActive = true }: { inv: Inventory; inputActive?: boolean }) {
  const { rows, stats } = useMemo(() => leaderboardStats(inv), [inv]);
  const size = useWindowSize();
  const height = Math.max(3, size.rows - CHROME);
  const { detail, selected, start, end, onInput } = useListDetail(rows.length, height);

  useInput((input, key) => {
    onInput(input, key);
  }, { isActive: inputActive });

  if (detail) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor={theme.border} paddingX={1}>
          <DetailView row={rows[selected]} />
        </Box>
        <Text dimColor>Esc/← back · 1/2/3 or Tab switch · q quit</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {rows.length === 0 ? (
        <Text dimColor>no skills</Text>
      ) : (
        <ItemTable rows={rows.slice(start, end)} variant="leaderboard" width={size.columns} selectedIndex={selected - start} />
      )}
      <Position start={start} end={end} total={rows.length} height={height} />
      <StatsBand stats={stats} />
      <Text dimColor>↑/↓ move · Enter detail · 1/2/3 or Tab switch · q quit</Text>
    </Box>
  );
}
