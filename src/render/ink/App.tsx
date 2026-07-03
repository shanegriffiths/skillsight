import { useEffect, useMemo, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import chokidar from 'chokidar';
import type { Inventory, Runtime, Kind } from '../../types.js';
import { scan, type ScanOptions } from '../../index.js';
import { filterInventory, type FilterOptions } from '../../filter.js';
import { computeWatchPaths } from './watchpaths.js';
import { clampIndex } from './scroll.js';
import { chips as buildChips, toggleChip } from './filterChips.js';
import { Header } from './Header.js';
import { TabBar } from './TabBar.js';
import { tabForKey, nextTab, type TabId } from './tabs.js';
import { FilterBar } from './FilterBar.js';
import { FoldersView } from './FoldersView.js';
import { GlobalView } from './GlobalView.js';
import { LeaderboardView } from './LeaderboardView.js';

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
  const [runtimes, setRuntimes] = useState<Set<Runtime>>(() => new Set(filter.runtimes ?? []));
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(filter.kinds ?? []));
  const [filtering, setFiltering] = useState(false);
  const [cursor, setCursor] = useState(0);
  const { exit } = useApp();

  const inv = useMemo(
    () => filterInventory(raw, { runtimes: [...runtimes], kinds: [...kinds] }),
    [raw, runtimes, kinds],
  );
  const chipList = useMemo(() => buildChips(raw.runtimesDetected), [raw.runtimesDetected]);
  const safeCursor = clampIndex(cursor, chipList.length);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    if (!filtering && input === 'f') {
      setCursor((c) => clampIndex(c, chipList.length));
      setFiltering(true);
      return;
    }
    const t = tabForKey(input);
    if (t) setTab(t);
    if (key.tab) setTab((cur) => nextTab(cur, key.shift ? -1 : 1));
  });

  useInput(
    (input, key) => {
      if (key.escape || key.return || input === 'f') {
        setFiltering(false);
        return;
      }
      if (key.leftArrow || input === 'h') {
        setCursor((c) => clampIndex(c - 1, chipList.length));
        return;
      }
      if (key.rightArrow || input === 'l') {
        setCursor((c) => clampIndex(c + 1, chipList.length));
        return;
      }
      if (input === ' ') {
        const chip = chipList[safeCursor];
        if (chip) {
          const next = toggleChip(chip, runtimes, kinds);
          setRuntimes(next.runtimes);
          setKinds(next.kinds);
        }
        return;
      }
      if (input === 'a') {
        setRuntimes(new Set());
        setKinds(new Set());
      }
    },
    { isActive: filtering },
  );

  // Watch set is computed once at mount (from the initial scan); folders discovered by
  // later rescans aren't added until restart — a deliberate trade-off vs. re-creating
  // the watcher on every rescan.
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
      <FilterBar chips={chipList} runtimes={runtimes} kinds={kinds} cursor={safeCursor} filtering={filtering} />
      {tab === 'folders' ? <FoldersView inv={inv} inputActive={!filtering} /> : null}
      {tab === 'global' ? <GlobalView inv={inv} inputActive={!filtering} /> : null}
      {tab === 'leaderboard' ? <LeaderboardView inv={inv} inputActive={!filtering} /> : null}
    </Box>
  );
}
