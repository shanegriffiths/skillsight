import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { groupKey } from './rows.js';
import type { ItemRow } from './rows.js';
import { groupedRows } from './grouping.js';
import { ItemTable, TABLE_CHROME } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { useListDetail } from './listDetail.js';
import { useItemSort } from './useItemSort.js';
import { USERSCOPE_SORTS } from './sortModes.js';
import { Position } from './Position.js';
import { HEADER_BOX_HEIGHT } from './HeaderBox.js';
import { FILTER_BAR_HEIGHT } from './FilterBar.js';
import { SCREEN_RESERVE } from './layout.js';
import { theme } from './theme.js';
import { agentCommand } from './detail.js';
import { useYank } from './useYank.js';
import { filterItemRows, allItemGroupIds, itemMatchCount, searchAction } from './liveFilter.js';
import { useLiveFilter } from './useLiveFilter.js';
import { cursorAfterEscape, revealTarget } from './searchCursor.js';
import { clampIndex } from './scroll.js';

// Header box + bottom filter bar + table chrome + position line (key hints are
// in the header now, not a bottom footer).
const CHROME = HEADER_BOX_HEIGHT + FILTER_BAR_HEIGHT + TABLE_CHROME + 1;

export function GlobalView({
  inv,
  inputActive = true,
  onControls,
  onSort,
  onSearchActive,
  yankJson,
}: {
  inv: Inventory;
  inputActive?: boolean;
  onControls?: (text: string) => void;
  onSort?: (label: string) => void;
  /** Report the `/` box's open state up so App suspends its global keys. */
  onSearchActive?: (active: boolean) => void;
  /** Builds the full agent-handoff JSON for `Y` yank, from the raw inventory. */
  yankJson?: (row: ItemRow) => string | undefined;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sort = useItemSort(USERSCOPE_SORTS);
  const search = useLiveFilter();
  const base = useMemo(() => groupedRows(inv.global, emptyBucket(), expanded), [inv.global, expanded]);
  const fullRows = sort.apply(base);
  // Fully-expanded base while a query is live, so children of collapsed groups are findable.
  const searching = search.open && search.query.length > 0;
  const expandedAll = searching
    ? sort.apply(groupedRows(inv.global, emptyBucket(), allItemGroupIds(base)))
    : fullRows;
  const rows = searching ? filterItemRows(expandedAll, search.query) : fullRows;
  const size = useWindowSize();
  const height = Math.max(3, size.rows - CHROME - (search.open ? 1 : 0) - SCREEN_RESERVE);
  const { detail, selected, start, end, onInput, select, openAt } = useListDetail(rows.length, height, sort.index);
  const yank = useYank();

  const footer = search.open
    ? 'type to filter · ↑/↓ move · Enter open · Esc clear'
    : detail
      ? (yank.toast ? `✓ ${yank.toast} · ` : '') + 'y agent cmd · Y json · Esc/← back · 1/2/3/4 or Tab switch · q quit'
      : '↑/↓ move · Enter expand/detail · s sort · / filter · 1/2/3/4 or Tab switch · q quit';
  useEffect(() => {
    onControls?.(footer);
  }, [footer, onControls]);
  useEffect(() => {
    onSort?.(sort.label);
  }, [sort.label, onSort]);
  useEffect(() => {
    onSearchActive?.(search.open);
    return () => onSearchActive?.(false);
  }, [search.open, onSearchActive]);
  useEffect(() => {
    if (search.open) select(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.query]);

  useInput((input, key) => {
    if (search.open) {
      const a = searchAction(input, key);
      if (a.type === 'up' || a.type === 'down') {
        onInput(input, key); // arrows map to the normal list moves
        return;
      }
      if (a.type === 'escape') {
        const idx = cursorAfterEscape(fullRows, rows, selected);
        search.clear();
        select(idx);
        return;
      }
      if (a.type === 'enter') {
        const target = rows[clampIndex(selected, rows.length)];
        const r = revealTarget(
          (exp) => sort.apply(groupedRows(inv.global, emptyBucket(), exp)),
          expanded,
          rows,
          selected,
        );
        search.clear();
        if (!r) return;
        setExpanded(r.expanded);
        // Headers and record-less synthetic rows just take the cursor; leaves open detail.
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
    // `s` toggles sort (list mode only); it resets the cursor + detail.
    if (!detail && sort.handleKey(input)) return;
    const row = rows[selected];
    // `y`/`Y` yank the agent handoff (detail mode only, and never on a group header).
    if (detail && row?.record) {
      if (input === 'y') {
        const cmd = agentCommand(row);
        if (cmd) yank.copy(cmd, 'agent cmd');
        return;
      }
      if (input === 'Y') {
        const json = yankJson?.(row);
        if (json) yank.copy(json, 'json record');
        return;
      }
    }
    // Plugin-group headers expand/collapse in place; everything else follows
    // the shared list/detail mapping.
    if (!detail && row?.expandState !== undefined && (key.return || key.rightArrow || key.leftArrow)) {
      const id = groupKey(row);
      setExpanded((prev) => {
        const next = new Set(prev);
        const open = key.leftArrow ? false : key.rightArrow ? true : !next.has(id);
        if (open) next.add(id);
        else next.delete(id);
        return next;
      });
      return;
    }
    onInput(input, key);
  }, { isActive: inputActive });

  if (detail) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor={theme.border} paddingX={1}>
          <DetailView row={rows[selected]} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {rows.length === 0 && !search.open ? (
        <Text dimColor>no global items</Text>
      ) : (
        <ItemTable
          rows={rows.slice(start, end)}
          width={size.columns}
          selectedIndex={selected - start}
          search={search.open ? { query: search.query, count: itemMatchCount(rows, expandedAll) } : undefined}
        />
      )}
      <Position start={start} end={end} total={rows.length} height={height} />
    </Box>
  );
}
