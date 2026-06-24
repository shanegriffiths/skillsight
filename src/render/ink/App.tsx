import { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import chokidar from 'chokidar';
import type { Inventory } from '../../types.js';
import { scan, type ScanOptions } from '../../index.js';
import { filterInventory, type FilterOptions } from '../../filter.js';
import { computeWatchPaths } from './watchpaths.js';
import { Header } from './Header.js';
import { GlobalBand } from './GlobalBand.js';
import { FolderList } from './FolderList.js';
import { DetailPane } from './DetailPane.js';

export function App({
  homeRoot,
  opts,
  filter,
  initial,
}: {
  homeRoot: string;
  opts: ScanOptions;
  filter: FilterOptions;
  initial: Inventory;
}) {
  const [raw, setRaw] = useState<Inventory>(initial);
  const [status, setStatus] = useState<'idle' | 'rescanning'>('idle');
  const [selected, setSelected] = useState(0);
  const { exit } = useApp();

  const inv = filterInventory(raw, filter);
  const folders = inv.folders;

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit();
      return;
    }
    if (key.downArrow || input === 'j') setSelected((s) => Math.min(s + 1, Math.max(folders.length - 1, 0)));
    if (key.upArrow || input === 'k') setSelected((s) => Math.max(s - 1, 0));
  });

  useEffect(() => {
    const watcher = chokidar.watch(computeWatchPaths(homeRoot, raw, opts.env ?? process.env), {
      ignoreInitial: true,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const trigger = () => {
      setStatus('rescanning');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setRaw(scan(homeRoot, opts));
        setStatus('idle');
      }, 150);
    };
    watcher.on('all', trigger);
    return () => {
      void watcher.close();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const clamped = Math.min(selected, Math.max(folders.length - 1, 0));

  return (
    <Box flexDirection="column">
      <Header inv={inv} status={status} />
      <GlobalBand inv={inv} />
      <Box>
        <FolderList folders={folders} selected={clamped} />
        <DetailPane folder={folders[clamped]} />
      </Box>
      <Text dimColor>↑/↓ or j/k navigate · q quit</Text>
    </Box>
  );
}
