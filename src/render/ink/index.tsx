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
import { scan, type ScanOptions } from '../../index.js';
import { filterInventory, type FilterOptions } from '../../filter.js';
import { renderPlain } from '../plain.js';
import { computeWatchPaths } from './watchpaths.js';
import { App } from './App.js';

export async function runWatch(
  homeRoot: string,
  opts: ScanOptions,
  filter: FilterOptions,
): Promise<void> {
  const initial = scan(homeRoot, opts);

  if (!process.stdout.isTTY) {
    const print = (inv: Inventory) =>
      process.stdout.write('\n' + renderPlain(filterInventory(inv, filter), {}) + '\n');
    print(initial);
    const watcher = chokidar.watch(computeWatchPaths(homeRoot, initial, opts.env ?? process.env), {
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

  const { waitUntilExit } = render(<App homeRoot={homeRoot} opts={opts} filter={filter} initial={initial} />);
  await waitUntilExit();
}
