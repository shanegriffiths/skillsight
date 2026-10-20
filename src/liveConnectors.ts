/**
 * `--live`: the one opt-in exception to skillsight's never-spawn rule.
 *
 * claude.ai account connectors (the MCP servers named `claude.ai <Name>`) are
 * fetched by Claude Code from claude.ai at every start and are NOT written to
 * disk, so a pure read can't know which are current. With `--live`, the CLI
 * runs `claude mcp list` ONCE, parses its claude.ai lines, and hands the result
 * to the engine as plain data. The engine and adapters never spawn anything.
 *
 * Per-project on/off state is NOT taken from this run (it reflects the cwd
 * only); the adapter reads it from `~/.claude.json` `projects[dir].disabledMcpServers`.
 */
import { execFileSync } from 'node:child_process';

export type ConnectorState = 'connected' | 'needs-auth' | 'failed' | 'disabled';

export interface ClaudeAiConnector {
  /** As Claude Code names it, e.g. `claude.ai Linear`. */
  name: string;
  url?: string;
  /** Health as `claude mcp list` reported it for the cwd it ran in. */
  state: ConnectorState;
}

/** Data a `--live` run collected before the scan. Absent fields mean "not scanned". */
export interface LiveData {
  claudeAiConnectors?: ClaudeAiConnector[];
}

const LINE = /^(claude\.ai .+?): (.+?) - (.+)$/;

function stateOf(status: string): ConnectorState {
  if (/disabled/i.test(status)) return 'disabled';
  if (/auth/i.test(status)) return 'needs-auth';
  if (/connected/i.test(status)) return 'connected';
  return 'failed';
}

/** Parse `claude mcp list` output, keeping only the claude.ai connector lines. */
export function parseClaudeMcpList(text: string): ClaudeAiConnector[] {
  const out: ClaudeAiConnector[] = [];
  for (const raw of text.split('\n')) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const [, name, target, status] = m as unknown as [string, string, string, string];
    // Strip a trailing transport hint such as `https://… (HTTP)`.
    const url = target.replace(/\s+\([A-Za-z]+\)$/, '');
    out.push({ name, ...(url && url !== 'undefined' ? { url } : {}), state: stateOf(status) });
  }
  return out;
}

export interface LiveFetch {
  connectors?: ClaudeAiConnector[];
  /** Why the fetch produced nothing, for a stderr warning. */
  warning?: string;
}

/**
 * Run `claude mcp list` and parse it. Never throws: a missing binary, timeout,
 * or non-zero exit returns `warning` and no connectors.
 */
export function fetchClaudeAiConnectors(opts: { cwd: string; timeoutMs?: number } = { cwd: process.cwd() }): LiveFetch {
  try {
    const text = execFileSync('claude', ['mcp', 'list'], {
      cwd: opts.cwd,
      encoding: 'utf8',
      timeout: opts.timeoutMs ?? 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { connectors: parseClaudeMcpList(text) };
  } catch (err) {
    const code = (err as { code?: string }).code;
    const reason = code === 'ENOENT' ? '`claude` not found on PATH' : code === 'ETIMEDOUT' ? 'timed out' : (err instanceof Error ? err.message.split('\n')[0] : String(err));
    return { warning: `--live: could not run \`claude mcp list\` (${reason}); connectors not scanned` };
  }
}
