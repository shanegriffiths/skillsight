import { Box, Text } from 'ink';
import type { Inventory, Runtime, Kind } from '../../types.js';
import { TABS, type TabId } from './tabs.js';
import { type Chip, isChipSelected } from './filterChips.js';
import { lettersFor } from './runtimeMark.js';
import { summaryStats } from './stats.js';
import { bucketCounts } from '../../resolve.js';
import { formatCounts } from '../format.js';
import { theme } from './theme.js';

/** Total height of the header box: 5 content lines + 2 border lines. */
export const HEADER_BOX_HEIGHT = 7;

function ChipText({
  chip,
  index,
  selected,
  cursor,
  filtering,
}: {
  chip: Chip;
  index: number;
  selected: boolean;
  cursor: number;
  filtering: boolean;
}) {
  const onCursor = filtering && index === cursor;
  const marker = selected ? '●' : '○';
  return (
    <Text inverse={onCursor} color={selected ? theme.accent : undefined} dimColor={!selected && !onCursor}>
      {`  ${marker} ${chip.id}`}
    </Text>
  );
}

/** The per-tab metadata line: what the active tab is looking at, in counts. */
function MetaLine({ inv, tab }: { inv: Inventory; tab: TabId }) {
  const letters = lettersFor(inv.runtimesDetected);
  const counts = tab === 'leaderboard' ? summaryStats(inv).totals : bucketCounts(inv.global);
  const label = tab === 'leaderboard' ? 'EVERYTHING' : 'GLOBAL';
  const gloss = tab === 'leaderboard' ? 'distinct across the machine' : 'inherited everywhere';
  return (
    <Text>
      <Text bold>{label}</Text> <Text dimColor>{gloss}</Text> · {formatCounts(counts)}
      {'   '}
      <Text dimColor>runtimes:</Text> {letters || <Text dimColor>none</Text>}
    </Text>
  );
}

/**
 * The single framed control surface at the top of the app: title + live status,
 * tab strip, per-tab metadata, and the two filter lines (runtimes, then kinds).
 * Everything that "controls" the view lives inside this one border.
 */
export function HeaderBox({
  inv,
  status,
  tab,
  chips,
  runtimes,
  kinds,
  cursor,
  filtering,
}: {
  inv: Inventory;
  status: 'idle' | 'rescanning';
  tab: TabId;
  chips: Chip[];
  runtimes: Set<Runtime>;
  kinds: Set<Kind>;
  cursor: number;
  filtering: boolean;
}) {
  const runtimeChips = chips.filter((c) => c.kind === 'runtime');
  const kindChips = chips.filter((c) => c.kind === 'kind');
  const active = runtimes.size > 0 || kinds.size > 0;
  const hint = filtering
    ? '←→ move · space toggle · a clear · esc done'
    : active
      ? 'f filter · filtered'
      : 'f filter · showing all';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
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
      <Box>
        {TABS.map((t) => (
          <Box key={t.id} marginRight={2}>
            <Text dimColor>{t.key}</Text>
            <Text inverse={t.id === tab} bold={t.id === tab}>
              {` ${t.label} `}
            </Text>
          </Box>
        ))}
      </Box>
      <MetaLine inv={inv} tab={tab} />
      <Box>
        <Text dimColor>{filtering ? 'FILTER' : 'filter'} </Text>
        <Text dimColor>runtimes{runtimes.size === 0 ? ' (all)' : ''}</Text>
        {runtimeChips.map((c, i) => (
          <ChipText
            key={`r:${c.id}`}
            chip={c}
            index={i}
            selected={isChipSelected(c, runtimes, kinds)}
            cursor={cursor}
            filtering={filtering}
          />
        ))}
      </Box>
      <Box>
        <Text dimColor>{'       '}kinds{kinds.size === 0 ? ' (all)' : ''}</Text>
        {kindChips.map((c, i) => (
          <ChipText
            key={`k:${c.id}`}
            chip={c}
            index={runtimeChips.length + i}
            selected={isChipSelected(c, runtimes, kinds)}
            cursor={cursor}
            filtering={filtering}
          />
        ))}
        <Text dimColor>{'   '}{hint}</Text>
      </Box>
    </Box>
  );
}
