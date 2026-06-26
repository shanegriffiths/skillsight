import { useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Inventory } from '../../types.js';
import { GlobalBand } from './GlobalBand.js';
import { FolderList } from './FolderList.js';
import { ItemTable } from './ItemTable.js';
import { DetailView } from './DetailView.js';
import { groupedRows } from './grouping.js';
import { clampIndex, scrollWindow } from './scroll.js';
import { folderNav, initialNav, type NavAction } from './folderNav.js';
import { buildFolderRows, type SortMode } from './tree.js';

// Header + tab bar + global band + position line + footer + margins (heuristic).
const CHROME = 11;

function toAction(
  input: string,
  key: { upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean; return: boolean; escape: boolean },
): NavAction | null {
  if (key.downArrow || input === 'j') return 'down';
  if (key.upArrow || input === 'k') return 'up';
  if (key.return) return 'enter';
  if (key.rightArrow) return 'right';
  if (key.leftArrow) return 'left';
  if (key.escape) return 'escape';
  return null;
}

export function FoldersView({ inv }: { inv: Inventory }) {
  const [nav, setNav] = useState(initialNav);
  const [sort, setSort] = useState<SortMode>('items');
  const [showHidden, setShowHidden] = useState(false);

  const folderRows = buildFolderRows(inv.folders, inv.homeRoot, { sort, showHidden, collapsed: nav.folderCollapsed });

  const folderIdx = clampIndex(nav.folder, folderRows.length);
  const sel = folderRows[folderIdx];
  const rows = sel?.folder ? groupedRows(sel.folder.projectScoped, sel.folder.local, nav.expanded) : [];

  const height = Math.max(3, useWindowSize().rows - CHROME);
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
    // `folderRows`/`rows` are render-time snapshots; the reducer reads the
    // authoritative `s.folderCollapsed` for collapse state, and `nav.folder`/
    // `nav.item` are re-clamped against fresh rows on the next render — so a
    // stale snapshot from rapid input self-corrects (never crashes).
    setNav((s) => folderNav(s, action, { folderRows, rows }));
  });

  const detailRow =
    nav.focus === 'detail' && nav.detailItem !== null ? rows[clampIndex(nav.detailItem, rows.length)] : undefined;

  const footer =
    nav.focus === 'folders'
      ? `sort: ${sort} · hidden: ${showHidden ? 'on' : 'off'} · ↑/↓ move · →/Enter open · ←/→ collapse/expand · s sort · . hidden · q quit`
      : nav.focus === 'items'
        ? '↑/↓ move · → expand/open · ← back · Enter open · Esc folders · q quit'
        : 'Esc/← back · 1/2/3 or Tab switch · q quit';

  return (
    <Box flexDirection="column">
      <GlobalBand inv={inv} />
      <Box>
        <FolderList
          rows={folderRows.slice(fWin.start, fWin.end)}
          selected={folderIdx - fWin.start}
          dimmed={nav.focus !== 'folders'}
        />
        {nav.focus === 'detail' ? (
          <DetailView row={detailRow} />
        ) : (
          <Box flexDirection="column" flexGrow={1}>
            {!sel ? (
              <Text dimColor>select a folder</Text>
            ) : !sel.folder ? (
              <Text dimColor>{sel.label} — a folder group; open a project inside it</Text>
            ) : rows.length === 0 ? (
              <Text dimColor>global only — adds nothing beyond the inherited layer</Text>
            ) : (
              <>
                <ItemTable rows={rows.slice(start, end)} selectedIndex={nav.focus === 'items' ? itemIdx - start : undefined} />
                {rows.length > height ? (
                  <Text dimColor>
                    {start + 1}–{end} of {rows.length}
                  </Text>
                ) : null}
              </>
            )}
          </Box>
        )}
      </Box>
      <Text dimColor>{footer}</Text>
    </Box>
  );
}
