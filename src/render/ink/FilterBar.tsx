import { Box, Text } from 'ink';
import type { Runtime, Kind } from '../../types.js';
import { type Chip, isChipSelected } from './filterChips.js';
import { runtimeName } from './runtimeMark.js';
import { theme } from './theme.js';

/** marginTop (spacing above) + global-state line + runtimes line + kinds line. */
export const FILTER_BAR_HEIGHT = 4;

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
  // Runtime chips spell out the full name (room to read); kind chips keep their
  // already-plain id (skill / plugin / mcp).
  const label = chip.kind === 'runtime' ? runtimeName(chip.id) : chip.id;
  return (
    <Text inverse={onCursor} color={selected ? theme.accent : undefined} dimColor={!selected && !onCursor}>
      {`  ${marker} ${label}`}
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

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Global filter state on its own line: the `f` affordance + what's shown,
          or the editing keys once you're in filter mode. */}
      <Text dimColor wrap="truncate-end">
        {filtering ? (
          <>
            <Text bold>FILTER</Text> · ←→ move · space toggle · a clear · esc done
          </>
        ) : (
          <>filter (f) · {active ? 'filtered' : 'showing all'}</>
        )}
      </Text>
      <Box>
        <Text dimColor>{'  '}runtimes{runtimes.size === 0 ? ' (all)' : ''}</Text>
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
        <Text dimColor>{'  '}kinds   {kinds.size === 0 ? ' (all)' : ''}</Text>
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
      </Box>
    </Box>
  );
}
