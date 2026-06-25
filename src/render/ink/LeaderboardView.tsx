import { useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { ItemTable } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { leaderboard, summaryStats, type SummaryStats } from './stats.js';
import { useScroll } from './scroll.js';

// Header + tab bar + view title + position line + stats band (~5 lines) + footer.
const CHROME = 12;

function StatsBand({ stats }: { stats: SummaryStats }) {
  const runtimes = stats.perRuntime.map((r) => `${r.runtime} ${r.skills}`).join(' · ') || 'none';
  const providers = stats.perProvider.map((p) => `${p.kind} ${p.skills}`).join(' · ') || 'none';
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text>
        <Text bold>STATS</Text> {stats.totals.skills} skills · {stats.totals.plugins} plugins ·{' '}
        {stats.totals.mcp} mcp
      </Text>
      <Text dimColor>by runtime {runtimes}</Text>
      <Text dimColor>by source {providers}</Text>
    </Box>
  );
}

export function LeaderboardView({ inv }: { inv: Inventory }) {
  const rows = leaderboard(inv);
  const stats = summaryStats(inv);
  const height = Math.max(3, useWindowSize().rows - CHROME);
  const { selected, start, end, moveUp, moveDown } = useScroll(rows.length, height);
  const [detail, setDetail] = useState(false);

  useInput((input, key) => {
    if (detail) {
      if (key.escape || key.leftArrow) setDetail(false);
      return;
    }
    if (key.downArrow || input === 'j') moveDown();
    if (key.upArrow || input === 'k') moveUp();
    if (key.return || key.rightArrow) setDetail(true);
  });

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
        <ItemTable rows={shown} showKind={false} selectedIndex={selected - start} />
      )}
      {rows.length > height ? (
        <Text dimColor>
          {start + 1}–{end} of {rows.length}
        </Text>
      ) : null}
      <StatsBand stats={stats} />
      <Text dimColor>↑/↓ scroll · Enter detail · 1/2/3 or Tab switch · q quit</Text>
    </Box>
  );
}
