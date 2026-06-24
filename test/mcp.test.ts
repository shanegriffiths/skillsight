import { describe, it, expect } from 'vitest';
import {
  normalizeClaudeTransport,
  normalizeCodexTransport,
  normalizeGeminiTransport,
  normalizeCursorTransport,
  normalizeOpencodeTransport,
} from '../src/mcp.js';

describe('MCP normalization (secrets reduced to key names only)', () => {
  it('Claude: stdio + http + sse + ws', () => {
    expect(normalizeClaudeTransport({ type: 'stdio', command: 'npx', args: ['-y', 'pkg'], env: { TOKEN: 'secret', X: '1' } }))
      .toEqual({ kind: 'stdio', command: 'npx', args: ['-y', 'pkg'], envKeys: ['TOKEN', 'X'] });
    expect(normalizeClaudeTransport({ type: 'http', url: 'https://h/mcp', headers: { Authorization: 'Bearer x' }, timeout: 5000 }))
      .toEqual({ kind: 'http', url: 'https://h/mcp', headerKeys: ['Authorization'], timeoutMs: 5000 });
    expect(normalizeClaudeTransport({ type: 'sse', url: 'https://h/sse' }).kind).toBe('sse');
    expect(normalizeClaudeTransport({ type: 'ws', url: 'wss://h' }).kind).toBe('ws');
    // command-only implies stdio
    expect(normalizeClaudeTransport({ command: 'foo' }).kind).toBe('stdio');
  });

  it('Codex: stdio (seconds->ms) and http (header sub-table + bearer env var)', () => {
    expect(normalizeCodexTransport({ command: 'npx', args: ['x'], startup_timeout_sec: 120, env: { A: '1' } }))
      .toEqual({ kind: 'stdio', command: 'npx', args: ['x'], envKeys: ['A'], timeoutMs: 120000 });
    expect(normalizeCodexTransport({ type: 'http', url: 'https://n/mcp', http_headers: { Authorization: 'Bearer x' }, bearer_token_env_var: 'NEON_KEY' }))
      .toEqual({ kind: 'http', url: 'https://n/mcp', headerKeys: ['Authorization'], envKeys: ['NEON_KEY'] });
  });

  it('Gemini: httpUrl=>http, url=>sse (inverted), command=>stdio', () => {
    expect(normalizeGeminiTransport({ httpUrl: 'https://h/mcp' }).kind).toBe('http');
    expect(normalizeGeminiTransport({ httpUrl: 'https://h/mcp' }).url).toBe('https://h/mcp');
    expect(normalizeGeminiTransport({ url: 'https://h/sse' }).kind).toBe('sse');
    expect(normalizeGeminiTransport({ command: 'gemini-mcp', args: ['--x'] }).kind).toBe('stdio');
  });

  it('Cursor: stdio vs typeless remote (assumed http with note)', () => {
    expect(normalizeCursorTransport({ type: 'stdio', command: 'c', args: ['a'] }).kind).toBe('stdio');
    const remote = normalizeCursorTransport({ url: 'https://c/mcp', headers: { Authorization: 'x' } });
    expect(remote.kind).toBe('http');
    expect(remote.headerKeys).toEqual(['Authorization']);
    expect(remote.note).toMatch(/assumed http/);
  });

  it('OpenCode: local command-array split + environment key; remote', () => {
    expect(normalizeOpencodeTransport({ type: 'local', command: ['bun', 'x', 'srv'], environment: { KEY: 'v' } }))
      .toEqual({ kind: 'stdio', command: 'bun', args: ['x', 'srv'], envKeys: ['KEY'] });
    expect(normalizeOpencodeTransport({ type: 'remote', url: 'https://o/mcp', headers: { Authorization: 'x' } }))
      .toEqual({ kind: 'http', url: 'https://o/mcp', headerKeys: ['Authorization'] });
  });

  it('never leaks secret values for any runtime', () => {
    const all = [
      normalizeClaudeTransport({ type: 'http', url: 'u', headers: { Authorization: 'Bearer SECRET' } }),
      normalizeCodexTransport({ type: 'http', url: 'u', http_headers: { Authorization: 'Bearer SECRET' } }),
      normalizeGeminiTransport({ command: 'c', env: { TOKEN: 'SECRET' } }),
      normalizeOpencodeTransport({ type: 'local', command: ['c'], environment: { TOKEN: 'SECRET' } }),
    ];
    expect(JSON.stringify(all)).not.toMatch(/SECRET/);
  });
});
