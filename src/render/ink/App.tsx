import { useEffect, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import chokidar from 'chokidar';
import type { Inventory } from '../../types.js';
import { scan, type ScanOptions } from '../../index.js';
import { filterInventory, type FilterOptions } from '../../filter.js';
import { computeWatchPaths } from './watchpaths.js';
import { Header } from './Header.js';
import { TabBar, type TabId } from './TabBar.js';
import { FoldersView } from './FoldersView.js';
import { GlobalView } from './GlobalView.js';
import { LeaderboardView } from './LeaderboardView.js';

const TABS: TabId[] = ['folders', 'global', 'leaderboard'];

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
  const [tab, setTab] = useState<TabId>('folders');
  const { exit } = useApp();

  const inv = filterInventory(raw, filter);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    if (input === '1') setTab('folders');
    if (input === '2') setTab('global');
    if (input === '3') setTab('leaderboard');
    if (key.tab && !key.shift) setTab((t) => TABS[(TABS.indexOf(t) + 1) % TABS.length]!);
    if (key.tab && key.shift) setTab((t) => TABS[(TABS.indexOf(t) + TABS.length - 1) % TABS.length]!);
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

  return (
    <Box flexDirection="column">
      <Header inv={inv} status={status} />
      <TabBar active={tab} />
      {tab === 'folders' ? <FoldersView inv={inv} /> : null}
      {tab === 'global' ? <GlobalView inv={inv} /> : null}
      {tab === 'leaderboard' ? <LeaderboardView inv={inv} /> : null}
    </Box>
  );
}
