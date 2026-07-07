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
import { icons } from './icons.js';
import { theme } from './theme.js';

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
}) {
  const [nav, setNav] = useState(initialNav);
  const [sort, setSort] = useState<SortMode>('items');
  const [showHidden, setShowHidden] = useState(false);

  const folderRows = useMemo(
    () => buildFolderRows(inv.folders, inv.homeRoot, { sort, showHidden, expanded: nav.folderExpanded }),
    [inv.folders, inv.homeRoot, sort, showHidden, nav.folderExpanded],
  );

  // Consume a cross-tab "open this project" request: select the matching folder.
  useEffect(() => {
    if (!pendingFolder) return;
    const idx = folderRows.findIndex((r) => r.nodeId === pendingFolder && r.folder);
    if (idx >= 0) setNav((s) => ({ ...s, folder: idx, focus: 'folders' }));
    onConsumePending?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFolder]);

  const folderIdx = clampIndex(nav.folder, folderRows.length);
  const sel = folderRows[folderIdx];
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

  const size = useWindowSize();
  const rightBudget = Math.max(6, size.rows - RIGHT_FIXED);
  const listHeight = Math.max(3, rightBudget - TABLE_COST);
  const tableW = Math.max(40, size.columns - FOLDER_W - 1);

  const globalsShown = !!selFolder && globalRows.length > 0;
  const projectHasTable = rows.length > 0;

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

  const itemIdx = clampIndex(nav.item, rows.length);
  const gItemIdx = clampIndex(Math.max(0, nav.globalItem), globalRows.length);
  const fWin = scrollWindow(folderRows.length, listHeight, folderIdx);
  const pWin = scrollWindow(rows.length, Math.max(1, pVisible), itemIdx);
  const gWin = scrollWindow(globalRows.length, Math.max(1, gVisible), gItemIdx);

  useInput((input, key) => {
    if (nav.focus === 'folders' && input === 's') {
      setSort((m) => (m === 'items' ? 'name' : 'items'));
      return;
    }
    if (nav.focus === 'folders' && input === '.') {
      setShowHidden((v) => !v);
      return;
    }
    const action = toAction(input, key);
    if (!action) return;
    // `folderRows`/`rows`/`globalRows` are render-time snapshots; the nav indices
    // are re-clamped against fresh rows on the next render — so a stale snapshot
    // from rapid input self-corrects (never crashes).
    setNav((s) => folderNav(s, action, { folderRows, rows, globalRows }));
  }, { isActive: inputActive });

  const detailList = nav.detailFrom === 'globals' ? globalRows : rows;
  const detailRow =
    nav.focus === 'detail' && nav.detailItem !== null
      ? detailList[clampIndex(nav.detailItem, detailList.length)]
      : undefined;

  const globalsFooter =
    nav.globalItem < 0
      ? '→/Enter expand · ↓ enter · ↑/Esc back to items · q quit'
      : '↑/↓ move · → expand/open · ← back · Enter open · Esc header · q quit';
  const footer =
    nav.focus === 'folders'
      ? `hidden: ${showHidden ? 'on' : 'off'} · ↑/↓ move · →/Enter open · ← collapse · . hidden · q quit`
      : nav.focus === 'items'
        ? '↑/↓ move · → expand/open · ← back · Enter open · ↓ globals · Esc folders · q quit'
        : nav.focus === 'globals'
          ? globalsFooter
          : 'Esc/← back · 1/2/3/4 or Tab switch · q quit';
  useEffect(() => {
    onControls?.(footer);
  }, [footer, onControls]);
  useEffect(() => {
    onSort?.(sort);
  }, [sort, onSort]);

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
          rows={folderRows.slice(fWin.start, fWin.end)}
          selected={folderIdx - fWin.start}
          dimmed={nav.focus !== 'folders'}
          width={FOLDER_W}
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
              {rows.length === 0 ? (
                <Text dimColor>
                  {globalsShown
                    ? 'no project-scoped items — inherited globals below'
                    : 'global only — adds nothing beyond the inherited layer'}
                </Text>
              ) : (
                <>
                  <ItemTable
                    rows={rows.slice(pWin.start, pWin.end)}
                    width={tableW}
                    selectedIndex={nav.focus === 'items' ? itemIdx - pWin.start : undefined}
                  />
                  <Position start={pWin.start} end={pWin.end} total={rows.length} height={Math.max(1, pVisible)} />
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
                        rows={globalRows.slice(gWin.start, gWin.end)}
                        width={tableW}
                        selectedIndex={nav.focus === 'globals' && nav.globalItem >= 0 ? gItemIdx - gWin.start : undefined}
                      />
                      <Position start={gWin.start} end={gWin.end} total={globalRows.length} height={Math.max(1, gVisible)} />
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
