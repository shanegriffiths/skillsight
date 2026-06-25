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

// Header + tab bar + global band + position line + footer + margins (heuristic).
const CHROME = 11;

const FOOTER: Record<string, string> = {
  folders: '↑/↓ navigate · Enter open folder · 1/2/3 or Tab switch · q quit',
  items: '↑/↓ move · → expand/open · ← back · Enter open · Esc folders · q quit',
  detail: 'Esc/← back · 1/2/3 or Tab switch · q quit',
};

function toAction(input: string, key: { upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean; return: boolean; escape: boolean }): NavAction | null {
  if (key.downArrow || input === 'j') return 'down';
  if (key.upArrow || input === 'k') return 'up';
  if (key.return) return 'enter';
  if (key.rightArrow) return 'right';
  if (key.leftArrow) return 'left';
  if (key.escape) return 'escape';
  return null;
}

export function FoldersView({ inv }: { inv: Inventory }) {
  const folders = inv.folders;
  const [nav, setNav] = useState(initialNav);

  const folderIdx = clampIndex(nav.folder, folders.length);
  const folder = folders[folderIdx];
  const rows = folder ? groupedRows(folder.projectScoped, folder.local, nav.expanded) : [];

  const height = Math.max(3, useWindowSize().rows - CHROME);
  const itemIdx = clampIndex(nav.item, rows.length);
  const { start, end } = scrollWindow(rows.length, height, itemIdx);

  useInput((input, key) => {
    const action = toAction(input, key);
    if (!action) return;
    setNav((s) => folderNav(s, action, { folderCount: folders.length, folderHasItems: rows.length > 0, rows }));
  });

  const detailRow = nav.focus === 'detail' && nav.detailItem !== null ? rows[clampIndex(nav.detailItem, rows.length)] : undefined;

  return (
    <Box flexDirection="column">
      <GlobalBand inv={inv} />
      <Box>
        <FolderList folders={folders} selected={folderIdx} dimmed={nav.focus !== 'folders'} />
        {nav.focus === 'detail' ? (
          <DetailView row={detailRow} />
        ) : (
          <Box flexDirection="column" flexGrow={1}>
            {!folder ? (
              <Text dimColor>select a folder</Text>
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
      <Text dimColor>{FOOTER[nav.focus]}</Text>
    </Box>
  );
}
