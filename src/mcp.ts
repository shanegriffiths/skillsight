/**
 * Per-runtime MCP config -> normalized {@link McpTransport}.
 *
 * MCP is skillsight's universal backbone (every runtime has it), so each
 * runtime's idiosyncratic shape is funnelled through one normalized model.
 * Secret-bearing maps (`env`, `headers`) are reduced to **key names only** —
 * values are never read or stored (privacy rule).
 *
 * Documented footguns handled here:
 *  - Gemini:   `httpUrl` = Streamable HTTP, `url` = legacy SSE (inverted vs others)
 *  - OpenCode: `command` is an array; env key is `environment` (not `env`)
 *  - Codex:    headers live in a `http_headers` sub-table; timeouts are in seconds
 *  - Cursor:   remote servers have no `type` discriminator
 */
import type { McpRecord, McpTransport, Provider } from './types.js';

type Raw = Record<string, unknown>;

/**
 * Build {@link McpRecord}s from a `name -> rawServerConfig` map using a runtime's
 * normalizer. `enabledFor` defaults to "enabled unless `enabled: false`".
 */
export function buildMcpRecords(
  servers: Record<string, Raw> | undefined,
  normalize: (raw: Raw) => McpTransport,
  scope: McpRecord['scope'],
  provider: Provider,
  enabledFor: (name: string, raw: Raw) => boolean = (_n, raw) => raw.enabled !== false,
): McpRecord[] {
  if (!servers || typeof servers !== 'object') return [];
  return Object.entries(servers).map(([name, raw]) => ({
    name,
    transport: normalize(raw ?? {}),
    provider: { ...provider },
    scope,
    enabled: enabledFor(name, raw ?? {}),
  }));
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string');
  return out.length ? out : undefined;
}

/** Sorted key names of a record-like value, or undefined when empty/absent. */
function keysOf(v: unknown): string[] | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const keys = Object.keys(v as Raw).sort();
  return keys.length ? keys : undefined;
}

function secToMs(v: unknown): number | undefined {
  return typeof v === 'number' ? v * 1000 : undefined;
}

function msOf(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function prune(t: McpTransport): McpTransport {
  // strip undefined keys so JSON output stays clean
  return JSON.parse(JSON.stringify(t)) as McpTransport;
}

export function normalizeClaudeTransport(raw: Raw): McpTransport {
  const type = asString(raw.type);
  if (type === 'http' || type === 'streamable-http') {
    return prune({ kind: 'http', url: asString(raw.url), headerKeys: keysOf(raw.headers), timeoutMs: msOf(raw.timeout) });
  }
  if (type === 'sse') {
    return prune({ kind: 'sse', url: asString(raw.url), headerKeys: keysOf(raw.headers), timeoutMs: msOf(raw.timeout) });
  }
  if (type === 'ws') {
    return prune({ kind: 'ws', url: asString(raw.url), headerKeys: keysOf(raw.headers), timeoutMs: msOf(raw.timeout) });
  }
  // stdio (explicit type or implied by command)
  return prune({
    kind: 'stdio',
    command: asString(raw.command),
    args: asStringArray(raw.args),
    envKeys: keysOf(raw.env),
    timeoutMs: msOf(raw.timeout),
  });
}

export function normalizeCodexTransport(raw: Raw): McpTransport {
  if (asString(raw.type) === 'http') {
    const envKeys = keysOf(raw.http_headers);
    const bearer = asString(raw.bearer_token_env_var);
    return prune({
      kind: 'http',
      url: asString(raw.url),
      headerKeys: envKeys,
      // a bearer-token env var name is provenance worth surfacing (name only)
      envKeys: bearer ? [bearer] : undefined,
      timeoutMs: secToMs(raw.tool_timeout_sec) ?? secToMs(raw.startup_timeout_sec),
    });
  }
  return prune({
    kind: 'stdio',
    command: asString(raw.command),
    args: asStringArray(raw.args),
    envKeys: keysOf(raw.env),
    cwd: asString(raw.cwd),
    timeoutMs: secToMs(raw.startup_timeout_sec) ?? secToMs(raw.tool_timeout_sec),
  });
}

export function normalizeGeminiTransport(raw: Raw): McpTransport {
  if (asString(raw.httpUrl)) {
    return prune({ kind: 'http', url: asString(raw.httpUrl), headerKeys: keysOf(raw.headers), timeoutMs: msOf(raw.timeout) });
  }
  if (asString(raw.url)) {
    return prune({ kind: 'sse', url: asString(raw.url), headerKeys: keysOf(raw.headers), timeoutMs: msOf(raw.timeout) });
  }
  return prune({
    kind: 'stdio',
    command: asString(raw.command),
    args: asStringArray(raw.args),
    envKeys: keysOf(raw.env),
    cwd: asString(raw.cwd),
    timeoutMs: msOf(raw.timeout),
  });
}

export function normalizeCursorTransport(raw: Raw): McpTransport {
  if (asString(raw.type) === 'stdio' || (asString(raw.command) && !asString(raw.url))) {
    return prune({
      kind: 'stdio',
      command: asString(raw.command),
      args: asStringArray(raw.args),
      envKeys: keysOf(raw.env),
    });
  }
  // remote: Cursor has no type discriminator for http vs sse — assume http
  return prune({
    kind: 'http',
    url: asString(raw.url),
    headerKeys: keysOf(raw.headers),
    note: 'cursor remote server: transport unspecified, assumed http',
  });
}

export function normalizeOpencodeTransport(raw: Raw): McpTransport {
  if (asString(raw.type) === 'remote') {
    return prune({ kind: 'http', url: asString(raw.url), headerKeys: keysOf(raw.headers), timeoutMs: msOf(raw.timeout) });
  }
  // local: command is an ARRAY (command + args); env key is `environment`
  const cmd = asStringArray(raw.command);
  return prune({
    kind: 'stdio',
    command: cmd?.[0],
    args: cmd && cmd.length > 1 ? cmd.slice(1) : undefined,
    envKeys: keysOf(raw.environment),
    cwd: asString(raw.cwd),
    timeoutMs: msOf(raw.timeout),
  });
}

/** Whether a server config marks itself disabled (`enabled: false`). */
export function isExplicitlyDisabled(raw: Raw): boolean {
  return raw.enabled === false;
}
