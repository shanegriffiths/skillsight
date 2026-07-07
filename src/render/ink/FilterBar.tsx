import { Box, Text } from 'ink';
import type { Runtime, Kind } from '../../types.js';
import { type Chip, isChipSelected } from './filterChips.js';
import { runtimeMark, runtimeName } from './runtimeMark.js';
import { theme } from './theme.js';

/** Bordered box: top border + 4 rows (sort / filter / runtimes / kinds) + bottom border. */
export const FILTER_BAR_HEIGHT = 6;

/** Label column width: the four labels (sort / filter / runtimes / kinds) align here. */
const LABEL_W = 10;
const cell = (s: string) => s.padEnd(LABEL_W);

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
  // Runtime chips show the letter code + full name — e.g. `(C) Claude Code` —
  // tying the filter to the codes used in the RUNTIMES column. Kind chips keep
  // their already-plain id (skill / plugin / mcp).
  let label: string;
  if (chip.kind === 'runtime') {
    const mark = runtimeMark(chip.id);
    label = mark ? `(${mark.letter}) ${runtimeName(chip.id)}` : runtimeName(chip.id);
  } else {
    label = chip.id;
  }
  return (
    <Text inverse={onCursor} color={selected ? theme.accent : undefined} dimColor={!selected && !onCursor}>
      {`  ${marker} ${label}`}
    </Text>
  );
}

/**
 * The control block below the header. `sort` sits on top (the active tab's mode;
 * `s` toggles it), then `filter` (`f` toggles filter mode), then the runtime and
 * kind chip rows. In filter mode `←/→` move the cursor chip, `space` toggles, `a`
 * clears. `sortLabel` is reported up by the active view.
 */
export function FilterBar({
  chips,
  runtimes,
  kinds,
  cursor,
  filtering,
  sortLabel,
}: {
  chips: Chip[];
  runtimes: Set<Runtime>;
  kinds: Set<Kind>;
  cursor: number;
  filtering: boolean;
  sortLabel: string;
}) {
  const runtimeChips = chips.filter((c) => c.kind === 'runtime');
  const kindChips = chips.filter((c) => c.kind === 'kind');
  const active = runtimes.size > 0 || kinds.size > 0;
  // A fixed 5-col status slot after the label so the chips line up on both rows
  // whether or not the dimension shows "(all)".
  const allSlot = (on: boolean) => (on ? '(all)' : '     ');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
      {/* Sort row: the active tab's sort mode; `s` toggles it. The label reads
          full-strength so the current mode stands out. */}
      <Text wrap="truncate-end">
        <Text dimColor>{cell('sort')}</Text>
        <Text dimColor>(s) · </Text>
        <Text>{sortLabel}</Text>
      </Text>
      {/* Filter row: the label aligns with runtimes/kinds; the value is the `f`
          affordance + what's shown, or the editing keys once in filter mode. */}
      <Text wrap="truncate-end">
        <Text bold={filtering} dimColor={!filtering}>{cell('filter')}</Text>
        <Text dimColor>
          {filtering ? '←→ move · space toggle · a clear · esc done' : `(f) · ${active ? 'filtered' : 'showing all'}`}
        </Text>
      </Text>
      <Box>
        <Text dimColor>{cell('runtimes')}{allSlot(runtimes.size === 0)}</Text>
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
        <Text dimColor>{cell('kinds')}{allSlot(kinds.size === 0)}</Text>
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
