/**
 * Lazy entry for `skillsight watch`. Imported dynamically by cli.ts ONLY on the
 * watch path, so the default report / --json never loads Ink or React.
 *
 * On a TTY it renders the live Ink dashboard; on a non-TTY (CI, pipes) it falls
 * back to printing the plain report and reprinting on each config change.
 */
import { render } from 'ink';
import chokidar from 'chokidar';
import type { Inventory } from '../../types.js';
import { scan, scanFull, type ScanOptions } from '../../index.js';
import { filterInventory, type FilterOptions } from '../../filter.js';
import { renderPlain } from '../plain.js';
import { computeWatchPaths } from './watchpaths.js';
import { App } from './App.js';
import { runInAltScreen } from './altScreen.js';
import { startProgress } from '../../progress.js';
import type { LiveFetch } from '../../liveConnectors.js';

export async function runWatch(
  homeRoot: string,
  opts: ScanOptions,
  filter: FilterOptions,
  /** An in-flight `--live` connector check; the dashboard opens without waiting for it. */
  livePromise?: Promise<LiveFetch>,
): Promise<void> {
  const progress = startProgress(`scanning ${homeRoot}`, process.stderr);
  let initial = scanFull(homeRoot, opts);
  progress.stop();

  if (!process.stdout.isTTY) {
    if (livePromise) {
      const waiting = startProgress('checking claude.ai connectors (claude mcp list)', process.stderr);
      const r = await livePromise;
      waiting.stop();
      if (r.warning) process.stderr.write(`warning: ${r.warning}\n`);
      if (r.connectors) {
        opts = { ...opts, live: { claudeAiConnectors: r.connectors } };
        initial = scanFull(homeRoot, opts); // the first report must already carry them
      }
    }
    const print = (inv: Inventory) =>
      process.stdout.write('\n' + renderPlain(filterInventory(inv, filter), {}) + '\n');
    print(initial.inventory);
    const watcher = chokidar.watch(computeWatchPaths(homeRoot, initial.inventory, opts.env ?? process.env), {
      ignoreInitial: true,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    watcher.on('all', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => print(scan(homeRoot, opts)), 150);
    });
    await new Promise<void>(() => {}); // run until the process is killed
    return;
  }

  // Alternate screen: quitting restores the terminal instead of leaving the
  // last frame above the prompt (like vim/htop/less).
  await runInAltScreen(process.stdout, async () => {
    const { waitUntilExit } = render(
      <App homeRoot={homeRoot} opts={opts} filter={filter} initial={initial.inventory} initialSites={initial.sites} livePromise={livePromise} />,
    );
    await waitUntilExit();
  });
}
