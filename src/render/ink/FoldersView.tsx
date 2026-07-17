import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { emptyBucket } from '../../types.js';
import { bucketTotal } from '../../resolve.js';
import { FolderList } from './FolderList.js';
import { ItemTable, TABLE_CHROME } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { groupedRows } from './grouping.js';
import { clampIndex, scrollWindow } from './scroll.js';
import { folderNav, initialNav, toAction } from './folderNav.js';
import { buildFolderRows, type SortMode } from './tree.js';
import { Position } from './Position.js';
import { HEADER_BOX_HEIGHT } from './HeaderBox.js';
import { FILTER_BAR_HEIGHT } from './FilterBar.js';
import { SCREEN_RESERVE } from './layout.js';
import { icons } from './icons.js';
import { theme } from './theme.js';
import type { ItemRow } from './rows.js';
import { agentCommand } from './detail.js';
import { useYank } from './useYank.js';
import {
  filterItemRows,
  filterFolderRows,
  allItemGroupIds,
  expandAllFolders,
  itemMatchCount,
  folderMatchCount,
  searchAction,
} from './liveFilter.js';
import { useLiveFilter } from './useLiveFilter.js';
import { cursorAfterEscape, revealTarget, folderCursorAfterEscape, revealFolderTarget } from './searchCursor.js';

// Fixed vertical chrome around the right column's content: header box + filter
// bar + the path line (key hints moved up into the header).
const RIGHT_FIXED = HEADER_BOX_HEIGHT + FILTER_BAR_HEIGHT + 1;
// One table's own chrome: border + header + rule (TABLE_CHROME) plus a position line.
const TABLE_COST = TABLE_CHROME + 1;
// A touch wider when glyphs are on, to offset the icon cell each row spends.
const FOLDER_W = icons.enabled ? 36 : 34;

/** Split a row budget between the two stacked tables — the focused one gets ~⅔. */
function splitHeight(total: number, focusGlobals: boolean): { p: number; g: number } {
  const t = Math.max(6, total);
  const big = Math.max(3, Math.round((t * 2) / 3));
  const small = Math.max(3, t - big);
  return focusGlobals ? { p: small, g: big } : { p: big, g: small };
}

export function FoldersView({
  inv,
  inputActive = true,
  pendingFolder = null,
  onConsumePending,
  onControls,
  onSort,
  onSearchActive,
  yankJson,
}: {
  inv: Inventory;
  inputActive?: boolean;
  /** A project path requested from a ranked tab; select it, then clear via onConsumePending. */
  pendingFolder?: string | null;
  onConsumePending?: () => void;
  /** Report the current per-focus key hints up to the header. */
  onControls?: (text: string) => void;
  /** Report the folder-column sort label up to the app-level filter box. */
  onSort?: (label: string) => void;
  /** Report the `/` box's open state up so App suspends its global keys. */
  onSearchActive?: (active: boolean) => void;
  /** Builds the full agent-handoff JSON for `Y` yank, from the raw inventory. */
  yankJson?: (row: ItemRow) => string | undefined;
}) {
  const [nav, setNav] = useState(initialNav);
  const [sort, setSort] = useState<SortMode>('items');
  const [showHidden, setShowHidden] = useState(false);
  const search = useLiveFilter();
  // The pane that owns the open box. Focus can't move while the box is open,
  // so a single live query suffices; the pane tag routes keys and rendering.
  const [searchPane, setSearchPane] = useState<'folders' | 'items' | 'globals'>('folders');
  const searching = search.open && search.query.length > 0;
  const paneSearch = (pane: 'folders' | 'items' | 'globals') => search.open && searchPane === pane;

  const folderRows = useMemo(
    () => buildFolderRows(inv.folders, inv.homeRoot, { sort, showHidden, expanded: nav.folderExpanded }),
    [inv.folders, inv.homeRoot, sort, showHidden, nav.folderExpanded],
  );

  const buildFolders = (exp: ReadonlySet<string>) =>
    buildFolderRows(inv.folders, inv.homeRoot, { sort, showHidden, expanded: exp });
  const fullFolderRows = searching && searchPane === 'folders' ? expandAllFolders(buildFolders) : folderRows;
  const shownFolderRows =
    searching && searchPane === 'folders' ? filterFolderRows(fullFolderRows, search.query, inv.homeRoot) : folderRows;

  // Consume a cross-tab "open this project" request: select the matching folder.
  useEffect(() => {
    if (!pendingFolder) return;
    const idx = shownFolderRows.findIndex((r) => r.nodeId === pendingFolder && r.folder);
    if (idx >= 0) setNav((s) => ({ ...s, folder: idx, focus: 'folders' }));
    onConsumePending?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFolder]);

  const folderIdx = clampIndex(nav.folder, shownFolderRows.length);
  const sel = shownFolderRows[folderIdx];
  const selFolder = sel?.folder ?? null;
  const rows = useMemo(
    () => (selFolder ? groupedRows(selFolder.projectScoped, selFolder.local, nav.expanded) : []),
    [selFolder, nav.expanded],
  );
  // The inherited layer is machine-wide (`Inventory.global`); each folder's own
  // `global` bucket is intentionally empty (see index.ts). Show it for any real
  // folder — same grouping/columns as the delta table.
  const globalRows = useMemo(
    () => (selFolder ? groupedRows(inv.global, emptyBucket(), nav.globalExpanded) : []),
    [selFolder, inv.global, nav.globalExpanded],
  );

  const buildItems = (exp: Set<string>) =>
    selFolder ? groupedRows(selFolder.projectScoped, selFolder.local, exp) : [];
  const buildGlobals = (exp: Set<string>) => (selFolder ? groupedRows(inv.global, emptyBucket(), exp) : []);
  const itemsAll = searching && searchPane === 'items' ? buildItems(new Set(allItemGroupIds(rows))) : rows;
  const shownRows = searching && searchPane === 'items' ? filterItemRows(itemsAll, search.query) : rows;
  const globalsAll = searching && searchPane === 'globals' ? buildGlobals(new Set(allItemGroupIds(globalRows))) : globalRows;
  const shownGlobalRows = searching && searchPane === 'globals' ? filterItemRows(globalsAll, search.query) : globalRows;

  const size = useWindowSize();
  const rightBudget = Math.max(6, size.rows - RIGHT_FIXED - SCREEN_RESERVE);
  const listHeight = Math.max(3, rightBudget - TABLE_COST - (paneSearch('folders') ? 1 : 0));
  const tableW = Math.max(40, size.columns - FOLDER_W - 1);

  const globalsShown = !!selFolder && shownGlobalRows.length > 0;
  const projectHasTable = shownRows.length > 0;

  // Divide the right column's vertical budget across the project table, the
  // globals header line, and (when open) the globals table.
  let pVisible = 0;
  let gVisible = 0;
  if (!globalsShown) {
    pVisible = rightBudget - TABLE_COST;
  } else if (!nav.globalsOpen) {
    pVisible = projectHasTable ? rightBudget - 1 - TABLE_COST : 0;
  } else if (projectHasTable) {
    const split = splitHeight(rightBudget - 1 - TABLE_COST * 2, nav.focus === 'globals');
    pVisible = split.p;
    gVisible = split.g;
  } else {
    gVisible = rightBudget - 1 - 1 - TABLE_COST; // header + "no items" note + globals table chrome
  }
  pVisible = Math.max(pVisible, projectHasTable ? 3 : 0);
  gVisible = Math.max(gVisible, nav.globalsOpen ? 3 : 0);

  const itemIdx = clampIndex(nav.item, shownRows.length);
  const gItemIdx = clampIndex(Math.max(0, nav.globalItem), shownGlobalRows.length);
  const fWin = scrollWindow(shownFolderRows.length, listHeight, folderIdx);
  const pWin = scrollWindow(shownRows.length, Math.max(1, pVisible - (paneSearch('items') ? 1 : 0)), itemIdx);
  const gWin = scrollWindow(shownGlobalRows.length, Math.max(1, gVisible - (paneSearch('globals') ? 1 : 0)), gItemIdx);

  const detailList = nav.detailFrom === 'globals' ? shownGlobalRows : shownRows;
  const detailRow =
    nav.focus === 'detail' && nav.detailItem !== null
      ? detailList[clampIndex(nav.detailItem, detailList.length)]
      : undefined;
  const yank = useYank();

  useInput((input, key) => {
    if (search.open) {
      const a = searchAction(input, key);
      if (a.type === 'up' || a.type === 'down') {
        const d = a.type === 'down' ? 1 : -1;
        if (searchPane === 'folders') setNav((s) => ({ ...s, folder: clampIndex(s.folder + d, shownFolderRows.length) }));
        else if (searchPane === 'items') setNav((s) => ({ ...s, item: clampIndex(s.item + d, shownRows.length) }));
        else setNav((s) => ({ ...s, globalItem: clampIndex(Math.max(0, s.globalItem) + d, shownGlobalRows.length) }));
        return;
      }
      if (a.type === 'escape') {
        if (searchPane === 'folders') {
          const idx = folderCursorAfterEscape(folderRows, shownFolderRows, folderIdx);
          search.clear();
          setNav((s) => ({ ...s, folder: idx }));
        } else if (searchPane === 'items') {
          const idx = cursorAfterEscape(rows, shownRows, itemIdx);
          search.clear();
          setNav((s) => ({ ...s, item: idx }));
        } else {
          const idx = cursorAfterEscape(globalRows, shownGlobalRows, gItemIdx);
          search.clear();
          setNav((s) => ({ ...s, globalItem: idx }));
        }
        return;
      }
      if (a.type === 'enter') {
        if (searchPane === 'folders') {
          const target = shownFolderRows[folderIdx];
          const r = revealFolderTarget(buildFolders, nav.folderExpanded, shownFolderRows, folderIdx);
          // Zero matches: Enter is a no-op and the box stays open (spec).
          if (!r) return;
          search.clear();
          // Select the revealed folder; a real project with items also opens
          // its table (same as a plain Enter on a folder row today).
          const openItems = !!target?.folder && (target?.count ?? 0) > 0;
          setNav((s) => ({
            ...s,
            folderExpanded: r.expanded,
            folder: r.index,
            ...(openItems ? { focus: 'items' as const, item: 0 } : {}),
          }));
        } else if (searchPane === 'items') {
          const target = shownRows[itemIdx];
          const r = revealTarget(buildItems, nav.expanded, shownRows, itemIdx);
          // Zero matches: Enter is a no-op and the box stays open (spec).
          if (!r) return;
          search.clear();
          const openDetail = target?.expandState === undefined && !!target?.record;
          setNav((s) => ({
            ...s,
            expanded: r.expanded,
            item: r.index,
            ...(openDetail ? { focus: 'detail' as const, detailItem: r.index, detailFrom: 'items' as const } : {}),
          }));
        } else {
          const target = shownGlobalRows[gItemIdx];
          const r = revealTarget(buildGlobals, nav.globalExpanded, shownGlobalRows, gItemIdx);
          // Zero matches: Enter is a no-op and the box stays open (spec).
          if (!r) return;
          search.clear();
          const openDetail = target?.expandState === undefined && !!target?.record;
          setNav((s) => ({
            ...s,
            globalExpanded: r.expanded,
            globalItem: r.index,
            ...(openDetail ? { focus: 'detail' as const, detailItem: r.index, detailFrom: 'globals' as const } : {}),
          }));
        }
        return;
      }
      search.edit(a);
      return;
    }
    if (input === '/' && nav.focus !== 'detail') {
      const pane = nav.focus === 'folders' ? 'folders' : nav.focus === 'items' ? 'items' : 'globals';
      setSearchPane(pane);
      search.start();
      // Searching the globals section implies looking at its rows: open it and
      // move off the header so ↑/↓ and Enter act on rows immediately.
      if (pane === 'globals') setNav((s) => ({ ...s, globalsOpen: true, globalItem: Math.max(0, s.globalItem) }));
      return;
    }
    if (nav.focus === 'folders' && input === 's') {
      setSort((m) => (m === 'items' ? 'name' : 'items'));
      return;
    }
    if (nav.focus === 'folders' && input === '.') {
      setShowHidden((v) => !v);
      return;
    }
    // `y`/`Y` yank the agent handoff (detail focus only, and never on a group header).
    if (nav.focus === 'detail' && detailRow?.record) {
      if (input === 'y') {
        const cmd = agentCommand(detailRow);
        if (cmd) yank.copy(cmd, 'agent cmd');
        return;
      }
      if (input === 'Y') {
        const json = yankJson?.(detailRow);
        if (json) yank.copy(json, 'json record');
        return;
      }
    }
    const action = toAction(input, key);
    if (!action) return;
    // `folderRows`/`rows`/`globalRows` are render-time snapshots; the nav indices
    // are re-clamped against fresh rows on the next render — so a stale snapshot
    // from rapid input self-corrects (never crashes).
    setNav((s) => folderNav(s, action, { folderRows: shownFolderRows, rows: shownRows, globalRows: shownGlobalRows }));
  }, { isActive: inputActive });

  const globalsFooter =
    nav.globalItem < 0
      ? '→/Enter expand · ↓ enter · ↑/Esc back to items · q quit'
      : '↑/↓ move · → expand/open · ← back · Enter open · Esc header · q quit';
  const footer = search.open
    ? 'type to filter · ↑/↓ move · Enter open · Esc clear'
    : nav.focus === 'folders'
      ? `hidden: ${showHidden ? 'on' : 'off'} · ↑/↓ move · →/Enter open · ← collapse · . hidden · / filter · q quit`
      : nav.focus === 'items'
        ? '↑/↓ move · → expand/open · ← back · Enter open · ↓ globals · / filter · Esc folders · q quit'
        : nav.focus === 'globals'
          ? globalsFooter
          : (yank.toast ? `✓ ${yank.toast} · ` : '') + 'y agent cmd · Y json · Esc/← back · 1/2/3/4 or Tab switch · q quit';
  useEffect(() => {
    onControls?.(footer);
  }, [footer, onControls]);
  useEffect(() => {
    onSort?.(sort);
  }, [sort, onSort]);
  useEffect(() => {
    onSearchActive?.(search.open);
    return () => onSearchActive?.(false);
  }, [search.open, onSearchActive]);
  useEffect(() => {
    if (!search.open) return;
    if (searchPane === 'folders') setNav((s) => ({ ...s, folder: 0 }));
    else if (searchPane === 'items') setNav((s) => ({ ...s, item: 0 }));
    else setNav((s) => ({ ...s, globalItem: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.query]);

  // A selected row with no folder is a grouping node (the worktrees group, or a
  // repo whose main checkout wasn't discovered) — it has no item table.
  const isGroup = !!sel && !sel.folder;
  const path = selFolder
    ? selFolder.path.replace(inv.homeRoot, '~')
    : isGroup
      ? sel!.nodeId.replace(inv.homeRoot, '~')
      : null;

  const globalCount = selFolder ? bucketTotal(inv.global) : 0;
  const onGlobalsHeader = nav.focus === 'globals' && nav.globalItem < 0;

  return (
    <Box flexDirection="column">
      <Box>
        <FolderList
          rows={shownFolderRows.slice(fWin.start, fWin.end)}
          selected={folderIdx - fWin.start}
          dimmed={nav.focus !== 'folders'}
          width={FOLDER_W}
          search={paneSearch('folders') ? { query: search.query, count: folderMatchCount(shownFolderRows, fullFolderRows, search.query, inv.homeRoot) } : undefined}
        />
        <Box flexDirection="column" flexGrow={1} marginLeft={1}>
          {path ? (
            <Text wrap="truncate-end">
              {/* Folder glyph in full-strength foreground (dark on a light
                  terminal, light on a dark one) — the washed-out dim read as
                  disabled. The `path ` text fallback stays dim as a meta-label. */}
              {icons.enabled ? <Text>{icons.folder} </Text> : <Text dimColor>path </Text>}
              {path}
            </Text>
          ) : (
            <Text> </Text>
          )}
          {nav.focus === 'detail' ? (
            <Box borderStyle="round" borderColor={theme.border} paddingX={1}>
              <DetailView row={detailRow} />
            </Box>
          ) : !sel ? (
            <Text dimColor>select a folder</Text>
          ) : isGroup ? (
            <Text dimColor>
              {sel!.kind === 'worktrees' ? 'worktree checkouts' : 'worktree repo'} ·{' '}
              {sel!.collapsed ? '→ expand to drill in' : 'select a checkout below to inspect'}
            </Text>
          ) : (
            <>
              {shownRows.length === 0 && !paneSearch('items') ? (
                <Text dimColor>
                  {globalsShown
                    ? 'no project-scoped items — inherited globals below'
                    : 'global only — adds nothing beyond the inherited layer'}
                </Text>
              ) : (
                <>
                  <ItemTable
                    rows={shownRows.slice(pWin.start, pWin.end)}
                    width={tableW}
                    selectedIndex={nav.focus === 'items' ? itemIdx - pWin.start : undefined}
                    search={paneSearch('items') ? { query: search.query, count: itemMatchCount(shownRows, itemsAll) } : undefined}
                  />
                  <Position start={pWin.start} end={pWin.end} total={shownRows.length} height={Math.max(1, pVisible)} />
                </>
              )}
              {globalsShown ? (
                <>
                  <Text wrap="truncate-end" inverse={onGlobalsHeader} bold={nav.focus === 'globals'} dimColor={nav.focus !== 'globals'}>
                    {` ${nav.globalsOpen ? '▾' : '▸'} globals (${globalCount}) — inherited everywhere `}
                  </Text>
                  {nav.globalsOpen ? (
                    <>
                      <ItemTable
                        rows={shownGlobalRows.slice(gWin.start, gWin.end)}
                        width={tableW}
                        selectedIndex={nav.focus === 'globals' && nav.globalItem >= 0 ? gItemIdx - gWin.start : undefined}
                        search={paneSearch('globals') ? { query: search.query, count: itemMatchCount(shownGlobalRows, globalsAll) } : undefined}
                      />
                      <Position start={gWin.start} end={gWin.end} total={shownGlobalRows.length} height={Math.max(1, gVisible)} />
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
