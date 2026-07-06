import { Box, Text } from 'ink';
import type { Runtime, Kind } from '../../types.js';
import { type Chip, isChipSelected } from './filterChips.js';
import { theme } from './theme.js';

/** marginTop (spacing above) + runtimes line + kinds line. */
export const FILTER_BAR_HEIGHT = 3;

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

/**
 * The filter control block at the bottom of the app, grouped just under each
 * view's sort/keys footer. Runtimes on one line, kinds on the next; `f` toggles
 * filter mode, then `←/→` move the cursor chip, `space` toggles, `a` clears.
 */
export function FilterBar({
  chips,
  runtimes,
  kinds,
  cursor,
  filtering,
}: {
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
    <Box flexDirection="column" marginTop={1}>
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
