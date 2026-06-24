/**
 * skillsight CLI entry point.
 *
 * The Ink renderer (M7) is dynamically imported only on the `watch` path so the
 * default report / --json never pays Ink/React cold-start.
 */
import { homedir } from 'node:os';
import { scan } from './index.js';
import type { Kind } from './types.js';
import { filterInventory } from './filter.js';
import { renderJson } from './render/json.js';
import { renderPlain } from './render/plain.js';

interface Args {
  watch: boolean;
  json: boolean;
  full: boolean;
  provenance: boolean;
  global: boolean;
  noWalk: boolean;
  help: boolean;
  dir?: string;
  runtimes: string[];
  kinds: Kind[];
}

const KINDS: Kind[] = ['skill', 'plugin', 'mcp'];

const HELP = `skillsight — cross-runtime inventory of agent skills, plugins, and MCP servers

Usage:
  skillsight [options]            grouped report: global once, then per-folder deltas
  skillsight watch                live dashboard (re-renders on config change)

Options:
  --full                          full effective set per folder (not just deltas)
  --json                          machine-readable output
  --global                        only the inherited global layer
  --dir <path>                    inspect a single directory
  --runtime <id...>               filter to runtimes (e.g. --runtime claude-code codex)
  --kind <skill|plugin|mcp...>    filter by kind
  --provenance                    expand provider + "used by" per item
  --no-walk                       registry only (skip the filesystem walk)
  --help                          show this help`;

function isFlag(s: string | undefined): boolean {
  return s !== undefined && s.startsWith('-');
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    watch: false, json: false, full: false, provenance: false,
    global: false, noWalk: false, help: false, runtimes: [], kinds: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case 'watch': a.watch = true; break;
      case '--json': a.json = true; break;
      case '--full': a.full = true; break;
      case '--provenance': a.provenance = true; break;
      case '--global': a.global = true; break;
      case '--no-walk': a.noWalk = true; break;
      case '--help': case '-h': a.help = true; break;
      case '--dir': a.dir = argv[++i]; break;
      case '--runtime':
        while (i + 1 < argv.length && !isFlag(argv[i + 1])) a.runtimes.push(argv[++i]!);
        break;
      case '--kind':
        while (i + 1 < argv.length && !isFlag(argv[i + 1])) {
          for (const k of argv[++i]!.split(',')) {
            if ((KINDS as string[]).includes(k)) a.kinds.push(k as Kind);
          }
        }
        break;
    }
  }
  return a;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP + '\n');
    return;
  }

  const homeRoot = process.env.SKILLSIGHT_HOME || homedir();

  if (args.watch) {
    // Dynamically imported so the default/--json path never loads Ink/React.
    const { runWatch } = await import('./render/ink/index.js');
    await runWatch(
      homeRoot,
      { walk: !args.noWalk, dir: args.dir },
      { runtimes: args.runtimes, kinds: args.kinds },
    );
    return;
  }

  const raw = scan(homeRoot, { walk: !args.noWalk, dir: args.dir });
  const inv = filterInventory(raw, { runtimes: args.runtimes, kinds: args.kinds });

  if (args.json) {
    process.stdout.write(renderJson(inv) + '\n');
    return;
  }
  process.stdout.write(
    renderPlain(inv, { full: args.full, provenance: args.provenance, globalOnly: args.global }) + '\n',
  );
}

void main();
