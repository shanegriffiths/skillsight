import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import chokidar from 'chokidar';
import type { Inventory, Runtime, Kind } from '../../types.js';
import { scanFull, type ScanOptions } from '../../index.js';
import type { LiveFetch } from '../../liveConnectors.js';
import type { LiveStatus } from './HeaderBox.js';
import { filterInventory, type FilterOptions } from '../../filter.js';
import { assembleShow, type ShowHit } from '../../show.js';
import type { SiteIndex } from '../../symlinks.js';
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
import { LEADERBOARD_SORTS, PROJECT_SORTS } from './sortModes.js';
import type { ItemRow } from './rows.js';

export function App({
  homeRoot,
  opts,
  filter,
  initial,
  initialSites,
  livePromise,
}: {
  homeRoot: string;
  opts: ScanOptions;
  filter: FilterOptions;
  initial: Inventory;
  initialSites: SiteIndex;
  /** A `--live` connector check still running when the dashboard opened; folded in when it lands. */
  livePromise?: Promise<LiveFetch>;
}) {
  const [raw, setRaw] = useState<Inventory>(initial);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | undefined>(livePromise ? 'checking' : undefined);
  // Scan options for rescans; gains `live` once the background check resolves.
  const scanOpts = useRef<ScanOptions>(opts);
  const [sites, setSites] = useState<SiteIndex>(initialSites);
  const [status, setStatus] = useState<'idle' | 'rescanning'>('idle');
  const [tab, setTab] = useState<TabId>('folders');
  const [runtimes, setRuntimes] = useState<Set<Runtime>>(() => new Set(filter.runtimes ?? []));
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(filter.kinds ?? []));
  const [filtering, setFiltering] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [searchActive, setSearchActive] = useState(false);
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

  // Built from the RAW (unfiltered) inventory so a filtered-out row still yanks
  // its full agent-handoff record.
  const yankJson = (row: ItemRow): string | undefined => {
    if (!row.record) return undefined;
    const hit = { kind: row.kind, record: row.record } as ShowHit;
    return JSON.stringify(assembleShow(raw, sites, hit), null, 2);
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
  }, { isActive: !searchActive });

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

  // Fold the background `--live` result in without blocking first paint: the
  // dashboard opens on the disk-only scan, the header says "checking…", and
  // one rescan with the connectors follows when `claude mcp list` returns.
  useEffect(() => {
    if (!livePromise) return;
    let cancelled = false;
    void livePromise.then((r) => {
      if (cancelled) return;
      if (!r.connectors) {
        setLiveStatus('failed');
        return;
      }
      scanOpts.current = { ...scanOpts.current, live: { claudeAiConnectors: r.connectors } };
      const next = scanFull(homeRoot, scanOpts.current);
      setRaw(next.inventory);
      setSites(next.sites);
      setLiveStatus(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
        const r = scanFull(homeRoot, scanOpts.current);
        setRaw(r.inventory);
        setSites(r.sites);
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
      <HeaderBox inv={inv} status={status} tab={tab} controls={controls} liveStatus={liveStatus} />
      <FilterBar chips={chipList} runtimes={runtimes} kinds={kinds} cursor={safeCursor} filtering={filtering} sortLabel={sortLabel} />
      {tab === 'folders' ? (
        <FoldersView inv={inv} inputActive={!filtering} pendingFolder={pendingFolder} onConsumePending={() => setPendingFolder(null)} onControls={setControls} onSort={setSortLabel} yankJson={yankJson} onSearchActive={setSearchActive} />
      ) : null}
      {tab === 'installed' ? <RankedView inv={inv} rows={installed(inv)} inputActive={!filtering} sortModes={PROJECT_SORTS} variant="footprint" onOpenProject={openProject} onControls={setControls} onSort={setSortLabel} yankJson={yankJson} onSearchActive={setSearchActive} /> : null}
      {tab === 'global' ? <GlobalView inv={inv} inputActive={!filtering} onControls={setControls} onSort={setSortLabel} yankJson={yankJson} onSearchActive={setSearchActive} /> : null}
      {tab === 'leaderboard' ? <RankedView inv={inv} rows={leaderboard(inv)} showStats inputActive={!filtering} sortModes={LEADERBOARD_SORTS} variant="leaderboard" onOpenProject={openProject} onControls={setControls} onSort={setSortLabel} yankJson={yankJson} onSearchActive={setSearchActive} /> : null}
    </Box>
  );
}
