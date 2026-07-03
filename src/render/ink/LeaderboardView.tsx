import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { ItemTable } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { leaderboard, summaryStats, type SummaryStats } from './stats.js';
import { useListDetail } from './listDetail.js';
import { Badges } from './Badges.js';
import { marksFor } from './runtimeMark.js';
import { Band } from './Band.js';
import { Position } from './Position.js';
import { formatCounts } from '../format.js';

// Header + tab bar + view title + position line + stats band (~5 lines) + footer.
const CHROME = 13;

function StatsBand({ stats }: { stats: SummaryStats }) {
  const providers = stats.perProvider.map((p) => `${p.kind} ${p.skills}`).join(' · ') || 'none';
  return (
    <Band marginTop={1}>
      <Text>
        <Text bold>STATS</Text> {formatCounts(stats.totals)}
      </Text>
      <Text>
        <Text dimColor>by runtime </Text>
        {stats.perRuntime.length === 0 ? (
          <Text dimColor>none</Text>
        ) : (
          stats.perRuntime.map((r, i) => (
            <Text key={r.runtime}>
              {i ? '  ' : ''}
              <Badges marks={marksFor([r.runtime])} /> <Text dimColor>{r.skills}</Text>
            </Text>
          ))
        )}
      </Text>
      <Text dimColor>by source {providers}</Text>
    </Band>
  );
}

export function LeaderboardView({ inv, inputActive = true }: { inv: Inventory; inputActive?: boolean }) {
  const rows = leaderboard(inv);
  const stats = summaryStats(inv);
  const height = Math.max(3, useWindowSize().rows - CHROME);
  const { detail, selected, start, end, onInput } = useListDetail(rows.length, height);

  useInput((input, key) => {
    onInput(input, key);
  }, { isActive: inputActive });

  if (detail) {
    return (
      <Box flexDirection="column">
        <DetailView row={rows[selected]} />
        <Text dimColor>Esc/← back · 1/2/3 or Tab switch · q quit</Text>
      </Box>
    );
  }

  const shown = rows.slice(start, end);

  return (
    <Box flexDirection="column">
      <Text bold>
        leaderboard <Text dimColor>({rows.length}) — skills by runtime reach</Text>
      </Text>
      {rows.length === 0 ? (
        <Text dimColor>no skills</Text>
      ) : (
        <ItemTable rows={shown} showKind={false} showMarks selectedIndex={selected - start} />
      )}
      <Position start={start} end={end} total={rows.length} height={height} />
      <StatsBand stats={stats} />
      <Text dimColor>↑/↓ scroll · Enter detail · 1/2/3 or Tab switch · q quit</Text>
    </Box>
  );
}
