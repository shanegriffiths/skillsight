import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { ItemTable, TABLE_CHROME } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import type { ItemRow } from './rows.js';
import { summaryStats, type SummaryStats } from './stats.js';
import { useListDetail } from './listDetail.js';
import { RuntimeLetters } from './RuntimeLetters.js';
import { marksFor } from './runtimeMark.js';
import { Band } from './Band.js';
import { Position } from './Position.js';
import { HEADER_BOX_HEIGHT } from './HeaderBox.js';
import { FILTER_BAR_HEIGHT } from './FilterBar.js';
import { theme } from './theme.js';

const STATS_BAND_LINES = 5;

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

/** Where a ranked item lives: "everywhere" for a global item, else its project list. */
function Locations({ row, homeRoot }: { row: ItemRow | undefined; homeRoot: string }) {
  if (!row) return null;
  const locs = row.locations ?? [];
  return (
    <Box flexDirection="column" marginTop={1}>
      {row.everywhere ? (
        <Text>
          <Text bold>lives in</Text> <Text color={theme.good}>every project</Text>{' '}
          <Text dimColor>— inherited from the user-scope (global) layer</Text>
        </Text>
      ) : locs.length ? (
        <>
          <Text>
            <Text bold>lives in</Text> <Text dimColor>({locs.length} project{locs.length === 1 ? '' : 's'})</Text>
          </Text>
          {locs.map((p) => (
            <Text key={p} dimColor wrap="truncate-end">
              {'  '}
              {p.replace(homeRoot, '~')}
            </Text>
          ))}
        </>
      ) : (
        <Text dimColor>not currently installed in any project</Text>
      )}
    </Box>
  );
}

/**
 * The shared ranked-list tab body used by both Leaderboard (everything, by
 * usage) and Installed (project-scoped, by footprint). Rows are pre-ranked by
 * the caller; this owns the table, scroll, detail pane, and (optionally) the
 * skills-by-reach stats band.
 */
export function RankedView({
  inv,
  rows,
  showStats = false,
  inputActive = true,
}: {
  inv: Inventory;
  rows: ItemRow[];
  showStats?: boolean;
  inputActive?: boolean;
}) {
  const size = useWindowSize();
  const chrome = HEADER_BOX_HEIGHT + FILTER_BAR_HEIGHT + TABLE_CHROME + 1 + 1 + (showStats ? STATS_BAND_LINES : 0);
  const height = Math.max(3, size.rows - chrome);
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
        <Locations row={rows[selected]} homeRoot={inv.homeRoot} />
        <Text dimColor>Esc/← back · 1/2/3/4 or Tab switch · q quit</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {rows.length === 0 ? (
        <Text dimColor>nothing to show</Text>
      ) : (
        <ItemTable rows={rows.slice(start, end)} variant="leaderboard" width={size.columns} selectedIndex={selected - start} />
      )}
      <Position start={start} end={end} total={rows.length} height={height} />
      {showStats ? <StatsBand stats={summaryStats(inv)} /> : null}
      <Text dimColor>↑/↓ move · Enter detail · 1/2/3/4 or Tab switch · q quit</Text>
    </Box>
  );
}
