/**
 * Pure CLI argument parsing — no I/O, no process.exit, safe to import from
 * tests without triggering a real scan (see src/cli.ts for the executable
 * entry point that consumes these).
 */
import type { Kind } from './types.js';
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
