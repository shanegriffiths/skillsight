import { useEffect, useMemo, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import chokidar from 'chokidar';
import type { Inventory, Runtime, Kind } from '../../types.js';
import { scan, type ScanOptions } from '../../index.js';
import { filterInventory, type FilterOptions } from '../../filter.js';
import { computeWatchPaths } from './watchpaths.js';
import { clampIndex } from './scroll.js';
import { chips as buildChips, toggleChip } from './filterChips.js';
import { HeaderBox } from './HeaderBox.js';
import { FilterBar } from './FilterBar.js';
import { tabForKey, nextTab, type TabId } from './tabs.js';
import { FoldersView } from './FoldersView.js';
import { GlobalView } from './GlobalView.js';
import { RankedView } from './RankedView.js';
import { leaderboard, installed } from './stats.js';

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
  // The active view reports its per-focus key hints up here (via onControls) so
  // they render under the wordmark instead of a bottom footer.
  const [controls, setControls] = useState('');
  // The active view reports its sort mode up here so the app-level filter box
  // shows it (the control lives with each view; the display is shared).
  const [sortLabel, setSortLabel] = useState('');
  // A project path requested from a ranked tab's detail; FoldersView selects it then clears this.
  const [pendingFolder, setPendingFolder] = useState<string | null>(null);
  const { exit } = useApp();

  const openProject = (path: string) => {
    setPendingFolder(path);
    setTab('folders');
  };

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
      <HeaderBox inv={inv} status={status} tab={tab} controls={controls} />
      <FilterBar chips={chipList} runtimes={runtimes} kinds={kinds} cursor={safeCursor} filtering={filtering} sortLabel={sortLabel} />
      {tab === 'folders' ? (
        <FoldersView inv={inv} inputActive={!filtering} pendingFolder={pendingFolder} onConsumePending={() => setPendingFolder(null)} onControls={setControls} onSort={setSortLabel} />
      ) : null}
      {tab === 'installed' ? <RankedView inv={inv} rows={installed(inv)} inputActive={!filtering} nativeSortLabel="footprint" onOpenProject={openProject} onControls={setControls} onSort={setSortLabel} /> : null}
      {tab === 'global' ? <GlobalView inv={inv} inputActive={!filtering} onControls={setControls} onSort={setSortLabel} /> : null}
      {tab === 'leaderboard' ? <RankedView inv={inv} rows={leaderboard(inv)} showStats inputActive={!filtering} nativeSortLabel="reach" onOpenProject={openProject} onControls={setControls} onSort={setSortLabel} /> : null}
    </Box>
  );
}
