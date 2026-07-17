import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { ItemTable, TABLE_CHROME, type TableVariant } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { groupKey, type ItemRow } from './rows.js';
import { summaryStats, groupBySource, type SummaryStats } from './stats.js';
import { useListDetail } from './listDetail.js';
import { useItemSort } from './useItemSort.js';
import type { SortMode } from './sortModes.js';
import { RuntimeLetters } from './RuntimeLetters.js';
import { marksFor } from './runtimeMark.js';
import { Band } from './Band.js';
import { Position } from './Position.js';
import { HEADER_BOX_HEIGHT } from './HeaderBox.js';
import { FILTER_BAR_HEIGHT } from './FilterBar.js';
import { SCREEN_RESERVE } from './layout.js';
import { theme } from './theme.js';
import { agentCommand } from './detail.js';
import { useYank } from './useYank.js';
import { gitLink } from '../../git.js';
import { filterItemRows, allItemGroupIds, itemMatchCount, matchesItemRow, searchAction } from './liveFilter.js';
import { useLiveFilter } from './useLiveFilter.js';
import { cursorAfterEscape, revealTarget } from './searchCursor.js';
import { clampIndex } from './scroll.js';

const STATS_BAND_LINES = 5;

/**
 * gitLink is a synchronous fs walk; a path's worktree status is stable for the
 * process lifetime (same trade-off as the mount-time watch set), so cache it.
 */
const wtCache = new Map<string, boolean>();
function isWorktreePath(p: string): boolean {
  let v = wtCache.get(p);
  if (v === undefined) {
    v = Boolean(gitLink(p)?.isWorktree);
    wtCache.set(p, v);
  }
  return v;
}

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
  wtMarks,
}: {
  row: ItemRow | undefined;
  homeRoot: string;
  sel: number;
  navigable: boolean;
  /** Paths that are git worktree checkouts, for the dim `(worktree)` suffix. */
  wtMarks: Map<string, boolean>;
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
          const suffix = wtMarks.get(p) ? <Text dimColor> (worktree)</Text> : null;
          return i === sel ? (
            <Text key={p} wrap="truncate-end" inverse bold>
              {label}
              {suffix}
            </Text>
          ) : (
            <Text key={p} wrap="truncate-end" dimColor>
              {label}
              {suffix}
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
  sortModes,
  variant,
  onOpenProject,
  onControls,
  onSort,
  onSearchActive,
  yankJson,
}: {
  inv: Inventory;
  rows: ItemRow[];
  showStats?: boolean;
  inputActive?: boolean;
  /** This tab's sort cycle (native order first) — e.g. Leaderboard vs Project Scope. */
  sortModes: SortMode[];
  /** Column set: `footprint` (Project Scope) or `leaderboard` (state cols + reach). */
  variant: TableVariant;
  /** Jump to a project folder on the Folders tab (invoked from the detail's project list). */
  onOpenProject?: (path: string) => void;
  /** Report the current key hints up to the header. */
  onControls?: (text: string) => void;
  /** Report the active sort label up to the app-level filter box. */
  onSort?: (label: string) => void;
  /** Report the `/` box's open state up so App suspends its global keys. */
  onSearchActive?: (active: boolean) => void;
  /** Builds the full agent-handoff JSON for `Y` yank, from the raw inventory. */
  yankJson?: (row: ItemRow) => string | undefined;
}) {
  const size = useWindowSize();
  const search = useLiveFilter();
  const chrome =
    HEADER_BOX_HEIGHT + FILTER_BAR_HEIGHT + TABLE_CHROME + 1 + (showStats ? STATS_BAND_LINES : 0) + (search.open ? 1 : 0);
  const height = Math.max(3, size.rows - chrome - SCREEN_RESERVE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sort = useItemSort(sortModes);
  const userGrouped = sort.apply(groupBySource(rows, expanded));
  const searching = search.open && search.query.length > 0;
  const expandedAll = searching ? sort.apply(groupBySource(rows, allItemGroupIds(userGrouped))) : userGrouped;
  const grouped = searching ? filterItemRows(expandedAll, search.query) : userGrouped;
  const { detail, selected, start, end, onInput, select, openAt } = useListDetail(grouped.length, height, sort.index);
  const [projSel, setProjSel] = useState(0);
  const yank = useYank();

  useEffect(() => {
    onSort?.(sort.label);
  }, [sort.label, onSort]);
  useEffect(() => {
    onSearchActive?.(search.open);
    return () => onSearchActive?.(false);
  }, [search.open, onSearchActive]);
  useEffect(() => {
    if (!search.open) return;
    // Snap to the first directly-matching row (skip context-only headers).
    const i = grouped.findIndex((r) => matchesItemRow(r, search.query));
    select(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.query]);

  const selRow = grouped[selected];
  const isHeader = selRow?.expandState !== undefined;
  const locs = selRow?.locations ?? [];
  const projNavigable = detail && !isHeader && !selRow?.everywhere && locs.length > 0 && !!onOpenProject;
  const wtMarks = useMemo(() => new Map(locs.map((p) => [p, isWorktreePath(p)])), [locs]);

  // Reset the project cursor whenever the detail target changes / closes.
  useEffect(() => {
    setProjSel(0);
  }, [detail, selected]);

  const footer = search.open
    ? 'type to filter · ↑/↓ move · Enter open · Esc clear'
    : detail
      ? (yank.toast ? `✓ ${yank.toast} · ` : '') + 'y agent cmd · Y json · Esc/← back · 1/2/3/4 or Tab switch · q quit'
      : '↑/↓ move · → expand source · Enter detail · s sort · / filter · 1/2/3/4 or Tab · q quit';
  useEffect(() => {
    onControls?.(footer);
  }, [footer, onControls]);

  useInput(
    (input, key) => {
      if (search.open) {
        const a = searchAction(input, key);
        if (a.type === 'up' || a.type === 'down') {
          onInput(input, key);
          return;
        }
        if (a.type === 'escape') {
          const idx = cursorAfterEscape(userGrouped, grouped, selected);
          search.clear();
          select(idx);
          return;
        }
        if (a.type === 'enter') {
          const target = grouped[clampIndex(selected, grouped.length)];
          const r = revealTarget((exp) => sort.apply(groupBySource(rows, exp)), expanded, grouped, selected);
          // Zero matches: Enter is a no-op and the box stays open (spec).
          if (!r) return;
          search.clear();
          setExpanded(r.expanded);
          if (target?.expandState === undefined && target?.record) openAt(r.index);
          else select(r.index);
          return;
        }
        search.edit(a);
        return;
      }
      if (input === '/' && !detail) {
        search.start();
        return;
      }
      // `s` toggles this tab's sort (list mode only); it resets the cursor + detail.
      if (!detail && sort.handleKey(input)) return;
      // `y`/`Y` yank the agent handoff (detail mode only, and never on a group header).
      if (detail && selRow && !isHeader) {
        if (input === 'y') {
          const cmd = agentCommand(selRow);
          if (cmd) yank.copy(cmd, 'agent cmd');
          return;
        }
        if (input === 'Y') {
          const json = yankJson?.(selRow);
          if (json) yank.copy(json, 'json record');
          return;
        }
      }
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
        <Locations
          row={selRow}
          homeRoot={inv.homeRoot}
          sel={Math.min(projSel, Math.max(0, locs.length - 1))}
          navigable={!!projNavigable}
          wtMarks={wtMarks}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {grouped.length === 0 && !search.open ? (
        <Text dimColor>nothing to show</Text>
      ) : (
        <ItemTable
          rows={grouped.slice(start, end)}
          variant={variant}
          width={size.columns}
          selectedIndex={selected - start}
          search={search.open ? { query: search.query, count: itemMatchCount(grouped, expandedAll) } : undefined}
        />
      )}
      <Position start={start} end={end} total={grouped.length} height={height} />
      {showStats ? <StatsBand stats={summaryStats(inv)} /> : null}
    </Box>
  );
}
