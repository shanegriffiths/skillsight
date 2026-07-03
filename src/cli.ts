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
 */
import { homedir } from 'node:os';
import { scan } from './index.js';
import type { Kind } from './types.js';
import { filterInventory } from './filter.js';
import { renderJson } from './render/json.js';
import { renderPlain } from './render/plain.js';
import { runtimeById } from './runtimes.js';

export interface Args {
  watch: boolean;
  json: boolean;
  report: boolean;
  full: boolean;
  provenance: boolean;
  global: boolean;
  noWalk: boolean;
  help: boolean;
  dir?: string;
  runtimes: string[];
  kinds: Kind[];
  /** Non-fatal parse problems, printed as `warning:` on stderr. */
  issues: string[];
  /** Fatal parse problems, printed as `error:` on stderr; exit 1. */
  errors: string[];
}

export type Mode = 'json' | 'dashboard' | 'report';

const KINDS: Kind[] = ['skill', 'plugin', 'mcp'];
const KIND_SET = new Set<string>(KINDS);

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
  --runtime <id...>               filter to runtimes (e.g. --runtime claude-code codex)
  --kind <skill|plugin|mcp...>    filter by kind
  --provenance                    (report) expand provider + "used by" per item
  --no-walk                       registry only (skip the filesystem walk)
  --help

When output is piped or redirected (non-TTY), skillsight prints the plain report.`;

/**
 * Choose the output mode. `--json` always wins; an explicit `watch`/`--report`
 * forces that mode; otherwise the dashboard is the default on a TTY and the
 * plain report is used when output is non-interactive.
 */
export function decideMode(
  args: { json: boolean; watch: boolean; report: boolean },
  isTTY: boolean,
): Mode {
  if (args.json) return 'json';
  if (args.watch) return 'dashboard';
  if (args.report) return 'report';
  return isTTY ? 'dashboard' : 'report';
}

function isFlag(s: string | undefined): boolean {
  return s !== undefined && s.startsWith('-');
}

export function parseArgs(argv: string[]): Args {
  const a: Args = {
    watch: false, json: false, report: false, full: false, provenance: false,
    global: false, noWalk: false, help: false, runtimes: [], kinds: [],
    issues: [], errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case 'watch': a.watch = true; break;
      case '--json': a.json = true; break;
      case '--report': a.report = true; break;
      case '--full': a.full = true; break;
      case '--provenance': a.provenance = true; break;
      case '--global': a.global = true; break;
      case '--no-walk': a.noWalk = true; break;
      case '--help': case '-h': a.help = true; break;
      case '--dir':
        if (i + 1 < argv.length && !isFlag(argv[i + 1])) a.dir = argv[++i];
        else a.errors.push('--dir requires a path');
        break;
      case '--runtime':
        while (i + 1 < argv.length && !isFlag(argv[i + 1])) {
          const id = argv[++i]!;
          a.runtimes.push(id);
          if (!runtimeById(id)) a.issues.push(`unknown runtime: ${id}`);
        }
        break;
      case '--kind':
        while (i + 1 < argv.length && !isFlag(argv[i + 1])) {
          for (const k of argv[++i]!.split(',')) {
            if (KIND_SET.has(k)) a.kinds.push(k as Kind);
            else a.issues.push(`unknown kind: ${k} (expected skill|plugin|mcp)`);
          }
        }
        break;
      default:
        a.issues.push(`unknown option: ${arg}`);
    }
  }
  return a;
}

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

  const homeRoot = process.env.SKILLSIGHT_HOME || homedir();
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
