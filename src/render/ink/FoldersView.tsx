import { useMemo, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { FolderList } from './FolderList.js';
import { ItemTable, TABLE_CHROME } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { groupedRows } from './grouping.js';
import { clampIndex, scrollWindow } from './scroll.js';
import { folderNav, initialNav, toAction } from './folderNav.js';
import { buildFolderRows, type SortMode } from './tree.js';
import { Position } from './Position.js';
import { HEADER_BOX_HEIGHT } from './HeaderBox.js';
import { theme } from './theme.js';

// Header box + path line + table chrome + position line + footer.
const CHROME = HEADER_BOX_HEIGHT + 1 + TABLE_CHROME + 1 + 1;
const FOLDER_W = 34;

export function FoldersView({ inv, inputActive = true }: { inv: Inventory; inputActive?: boolean }) {
  const [nav, setNav] = useState(initialNav);
  const [sort, setSort] = useState<SortMode>('items');
  const [showHidden, setShowHidden] = useState(false);

  const folderRows = useMemo(
    () => buildFolderRows(inv.folders, inv.homeRoot, { sort, showHidden }),
    [inv.folders, inv.homeRoot, sort, showHidden],
  );

  const folderIdx = clampIndex(nav.folder, folderRows.length);
  const sel = folderRows[folderIdx];
  const selFolder = sel?.folder ?? null;
  const rows = useMemo(
    () => (selFolder ? groupedRows(selFolder.projectScoped, selFolder.local, nav.expanded) : []),
    [selFolder, nav.expanded],
  );

  const size = useWindowSize();
  const height = Math.max(3, size.rows - CHROME);
  const tableW = Math.max(40, size.columns - FOLDER_W - 1);
  const itemIdx = clampIndex(nav.item, rows.length);
  const fWin = scrollWindow(folderRows.length, height, folderIdx);
  const { start, end } = scrollWindow(rows.length, height, itemIdx);

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
    // `folderRows`/`rows` are render-time snapshots; `nav.folder`/`nav.item`
    // are re-clamped against fresh rows on the next render — so a stale
    // snapshot from rapid input self-corrects (never crashes).
    setNav((s) => folderNav(s, action, { folderRows, rows }));
  }, { isActive: inputActive });

  const detailRow =
    nav.focus === 'detail' && nav.detailItem !== null ? rows[clampIndex(nav.detailItem, rows.length)] : undefined;

  const footer =
    nav.focus === 'folders'
      ? `sort: ${sort} · hidden: ${showHidden ? 'on' : 'off'} · ↑/↓ move · →/Enter open · s sort · . hidden · q quit`
      : nav.focus === 'items'
        ? '↑/↓ move · → expand/open · ← back · Enter open · Esc folders · q quit'
        : 'Esc/← back · 1/2/3 or Tab switch · q quit';

  const path = selFolder ? selFolder.path.replace(inv.homeRoot, '~') : null;

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
              <Text dimColor>path </Text>
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
          ) : rows.length === 0 ? (
            <Text dimColor>global only — adds nothing beyond the inherited layer</Text>
          ) : (
            <>
              <ItemTable
                rows={rows.slice(start, end)}
                width={tableW}
                selectedIndex={nav.focus === 'items' ? itemIdx - start : undefined}
              />
              <Position start={start} end={end} total={rows.length} height={height} />
            </>
          )}
        </Box>
      </Box>
      <Text dimColor>{footer}</Text>
    </Box>
  );
}
