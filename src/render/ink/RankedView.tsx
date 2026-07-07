import { useEffect, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { ItemTable, TABLE_CHROME } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { groupKey, type ItemRow } from './rows.js';
import { summaryStats, groupBySource, type SummaryStats } from './stats.js';
import { useListDetail } from './listDetail.js';
import { useItemSort } from './useItemSort.js';
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

/**
 * Where a ranked item lives. A global item is inherited everywhere (no list). A
 * project-scoped item gets a bordered, navigable table of its projects: ↑/↓ move,
 * Enter/→ jumps to that project on the Folders tab. `sel` is the highlighted row.
 */
function Locations({
  row,
  homeRoot,
  sel,
  navigable,
}: {
  row: ItemRow | undefined;
  homeRoot: string;
  sel: number;
  navigable: boolean;
}) {
  if (!row) return null;
  const locs = row.locations ?? [];
  if (row.everywhere) {
    return (
      <Box marginTop={1}>
        <Text>
          <Text bold>lives in</Text> <Text color={theme.good}>every project</Text>{' '}
          <Text dimColor>— inherited from the user-scope (global) layer</Text>
        </Text>
      </Box>
    );
  }
  if (!locs.length) {
    return (
      <Box marginTop={1}>
        <Text dimColor>not currently installed in any project</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text bold>lives in</Text> <Text dimColor>({locs.length} project{locs.length === 1 ? '' : 's'})</Text>
        {navigable ? <Text dimColor> · ↑/↓ then Enter to open</Text> : null}
      </Text>
      <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
        {locs.map((p, i) => {
          const label = ` ${p.replace(homeRoot, '~')}`;
          return i === sel ? (
            <Text key={p} wrap="truncate-end" inverse bold>
              {label}
            </Text>
          ) : (
            <Text key={p} wrap="truncate-end" dimColor>
              {label}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * The shared ranked-list tab body used by both Leaderboard (everything, by
 * usage) and Project Scope (project-scoped, by footprint). Rows are pre-ranked by
 * the caller; this owns the table, scroll, detail pane (with a navigable
 * project list), and (optionally) the skills-by-reach stats band.
 */
export function RankedView({
  inv,
  rows,
  showStats = false,
  inputActive = true,
  nativeSortLabel,
  onOpenProject,
  onControls,
  onSort,
}: {
  inv: Inventory;
  rows: ItemRow[];
  showStats?: boolean;
  inputActive?: boolean;
  /** Label for this tab's native (pre-ranked) order — e.g. `reach` / `footprint`. */
  nativeSortLabel: string;
  /** Jump to a project folder on the Folders tab (invoked from the detail's project list). */
  onOpenProject?: (path: string) => void;
  /** Report the current key hints up to the header. */
  onControls?: (text: string) => void;
  /** Report the active sort label up to the app-level filter box. */
  onSort?: (label: string) => void;
}) {
  const size = useWindowSize();
  const chrome = HEADER_BOX_HEIGHT + FILTER_BAR_HEIGHT + TABLE_CHROME + 1 + (showStats ? STATS_BAND_LINES : 0);
  const height = Math.max(3, size.rows - chrome);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sort = useItemSort(nativeSortLabel);
  const grouped = sort.apply(groupBySource(rows, expanded));
  const { detail, selected, start, end, onInput } = useListDetail(grouped.length, height, sort.mode);
  const [projSel, setProjSel] = useState(0);

  useEffect(() => {
    onSort?.(sort.label);
  }, [sort.label, onSort]);

  const selRow = grouped[selected];
  const isHeader = selRow?.expandState !== undefined;
  const locs = selRow?.locations ?? [];
  const projNavigable = detail && !isHeader && !selRow?.everywhere && locs.length > 0 && !!onOpenProject;

  // Reset the project cursor whenever the detail target changes / closes.
  useEffect(() => {
    setProjSel(0);
  }, [detail, selected]);

  const footer = detail
    ? 'Esc/← back · 1/2/3/4 or Tab switch · q quit'
    : '↑/↓ move · → expand source · Enter detail · s sort · 1/2/3/4 or Tab · q quit';
  useEffect(() => {
    onControls?.(footer);
  }, [footer, onControls]);

  useInput(
    (input, key) => {
      // `s` toggles this tab's sort (list mode only); it resets the cursor + detail.
      if (!detail && sort.handleKey(input)) return;
      // A source-group header expands/collapses in place (like Folders/User Scope).
      if (!detail && isHeader && (key.return || key.rightArrow || key.leftArrow)) {
        const id = groupKey(selRow!);
        setExpanded((prev) => {
          const next = new Set(prev);
          const open = key.leftArrow ? false : key.rightArrow ? true : !next.has(id);
          if (open) next.add(id);
          else next.delete(id);
          return next;
        });
        return;
      }
      if (projNavigable) {
        if (key.downArrow || input === 'j') return setProjSel((s) => Math.min(s + 1, locs.length - 1));
        if (key.upArrow || input === 'k') return setProjSel((s) => Math.max(s - 1, 0));
        if (key.return || key.rightArrow) return onOpenProject!(locs[Math.min(projSel, locs.length - 1)]!);
        if (key.escape || key.leftArrow) return void onInput(input, key); // close detail
        return;
      }
      onInput(input, key);
    },
    { isActive: inputActive },
  );

  if (detail) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor={theme.border} paddingX={1}>
          <DetailView row={selRow} />
        </Box>
        <Locations row={selRow} homeRoot={inv.homeRoot} sel={Math.min(projSel, Math.max(0, locs.length - 1))} navigable={!!projNavigable} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {grouped.length === 0 ? (
        <Text dimColor>nothing to show</Text>
      ) : (
        <ItemTable rows={grouped.slice(start, end)} variant="leaderboard" width={size.columns} selectedIndex={selected - start} />
      )}
      <Position start={start} end={end} total={grouped.length} height={height} />
      {showStats ? <StatsBand stats={summaryStats(inv)} /> : null}
    </Box>
  );
}
