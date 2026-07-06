/**
 * skillsight CLI entry point.
 *
 * The live Ink dashboard is the default experience on a terminal. The Ink
 * renderer is dynamically imported only on that path, so the plain/--json
 * escapes never pay Ink/React cold-start.
 *
 *   skillsight            -> live dashboard (TTY) / plain report (piped)
 *   skillsight --report   -> plain one-shot report (even on a TTY)
 *   skillsight --json     -> machine-readable
 *   skillsight watch      -> alias for the dashboard
 *
 * Pure argument parsing (`parseArgs`, `decideMode`) lives in ./cliArgs.ts so
 * it can be unit-tested without triggering this module's top-level `main()`.
 */
import { homedir } from 'node:os';
import { scan } from './index.js';
import { filterInventory } from './filter.js';
import { renderJson } from './render/json.js';
import { renderPlain } from './render/plain.js';
import { parseArgs, decideMode } from './cliArgs.js';

const HELP = `skillsight — cross-runtime inventory of agent skills, plugins, and MCP servers

Usage:
  skillsight                      live dashboard (default on a terminal)
  skillsight --report             one-shot plain report
  skillsight --json               machine-readable output
  skillsight watch                alias for the dashboard

Options:
  --report                        plain grouped report instead of the dashboard
  --full                          (report) full effective set per folder
  --global                        (report) only the inherited global layer
  --json                          machine-readable output
  --dir <path>                    inspect a single directory
  --home <path>                   scan a different home root (or set SKILLSIGHT_HOME)
  --runtime <id...>               filter to runtimes (e.g. --runtime claude-code codex)
  --kind <skill|plugin|mcp...>    filter by kind
  --provenance                    (report) expand provider + "used by" per item
  --no-walk                       registry only (skip the filesystem walk)
  --help

When output is piped or redirected (non-TTY), skillsight prints the plain report.`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  for (const w of args.issues) process.stderr.write(`warning: ${w}\n`);
  if (args.errors.length) {
    for (const e of args.errors) process.stderr.write(`error: ${e}\n`);
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    process.stdout.write(HELP + '\n');
    return;
  }

  const homeRoot = args.home || process.env.SKILLSIGHT_HOME || homedir();
  const scanOpts = { walk: !args.noWalk, dir: args.dir };
  const filterOpts = { runtimes: args.runtimes, kinds: args.kinds };
  const mode = decideMode(args, Boolean(process.stdout.isTTY));

  if (mode === 'dashboard') {
    // Dynamically imported so the plain/--json path never loads Ink/React.
    const { runWatch } = await import('./render/ink/index.js');
    await runWatch(homeRoot, scanOpts, filterOpts);
    return;
  }

  const inv = filterInventory(scan(homeRoot, scanOpts), filterOpts);
  if (mode === 'json') {
    process.stdout.write(renderJson(inv) + '\n');
    return;
  }
  process.stdout.write(
    renderPlain(inv, { full: args.full, provenance: args.provenance, globalOnly: args.global }) + '\n',
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`skillsight: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
