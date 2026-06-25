import { useState } from 'react';
import { Box, useInput } from 'ink';
import type { Inventory } from '../../types.js';
import { GlobalBand } from './GlobalBand.js';
import { FolderList } from './FolderList.js';
import { DetailPane } from './DetailPane.js';

export function FoldersView({ inv }: { inv: Inventory }) {
  const folders = inv.folders;
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.downArrow || input === 'j') {
      setSelected((s) => Math.min(s + 1, Math.max(folders.length - 1, 0)));
    }
    if (key.upArrow || input === 'k') {
      setSelected((s) => Math.max(s - 1, 0));
    }
  });

  const clamped = Math.min(selected, Math.max(folders.length - 1, 0));

  return (
    <Box flexDirection="column">
      <GlobalBand inv={inv} />
      <Box>
        <FolderList folders={folders} selected={clamped} />
        <DetailPane folder={folders[clamped]} />
      </Box>
    </Box>
  );
}
