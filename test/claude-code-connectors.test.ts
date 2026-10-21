import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup, writeFileEnsured } from './helpers.js';
import { claudeCodeAdapter } from '../src/adapters/claude-code.js';
import { scan } from '../src/index.js';
import type { HomeCtx } from '../src/runtimes.js';
import type { ClaudeAiConnector } from '../src/liveConnectors.js';

let home = '';
afterEach(() => {
  if (home) cleanup(home);
  home = '';
});

const LIVE: ClaudeAiConnector[] = [
  { name: 'claude.ai Linear', url: 'https://mcp.linear.app/mcp', state: 'connected' },
  { name: 'claude.ai Gmail', url: 'https://gmailmcp.googleapis.com/mcp/v1', state: 'connected' },
  { name: 'claude.ai Slack', url: 'https://mcp.slack.com/mcp', state: 'needs-auth' },
];

function ctxWith(h: string, live?: ClaudeAiConnector[], settings: Record<string, unknown> = {}): { ctx: HomeCtx; proj: string } {
  const proj = join(h, 'proj');
  writeFileEnsured(join(h, '.claude', 'settings.json'), JSON.stringify(settings));
  writeFileEnsured(
    join(h, '.claude.json'),
    JSON.stringify({ projects: { [proj]: { disabledMcpServers: ['claude.ai Gmail'] } } }),
  );
  const ctx: HomeCtx = { homeRoot: h, env: {}, ...(live ? { live: { claudeAiConnectors: live } } : {}) };
  return { ctx, proj };
}

describe('claude-code adapter: live claude.ai connectors', () => {
  it('without live data, no connector rows appear', () => {
    home = makeTempHome();
    const { ctx } = ctxWith(home);
    expect(claudeCodeAdapter.collectGlobal(ctx, []).mcp).toEqual([]);
  });

  it('lists each live connector as a user-scope account MCP row with its url and state', () => {
    home = makeTempHome();
    const { ctx } = ctxWith(home, LIVE);
    const g = claudeCodeAdapter.collectGlobal(ctx, []);
    const linear = g.mcp.find((m) => m.name === 'claude.ai Linear')!;
    expect(linear.scope).toBe('global');
    expect(linear.provider.kind).toBe('account');
    expect(linear.transport).toEqual({ kind: 'http', url: 'https://mcp.linear.app/mcp' });
    expect(linear.enabled).toBe(true);
    expect(linear.account).toEqual({ state: 'connected' });
    const slack = g.mcp.find((m) => m.name === 'claude.ai Slack')!;
    expect(slack.enabled).toBe(true); // available, just needs a sign-in
    expect(slack.account?.state).toBe('needs-auth');
  });

  it('a folder whose ~/.claude.json entry disables a connector gets a disabled override row', () => {
    home = makeTempHome();
    const { ctx, proj } = ctxWith(home, LIVE);
    const f = claudeCodeAdapter.collectForDirectory(proj, ctx, []);
    const gmail = f.mcp.find((m) => m.name === 'claude.ai Gmail')!;
    expect(gmail).toBeDefined();
    expect(gmail.enabled).toBe(false);
    expect(gmail.override).toBe('local');
    expect(gmail.account?.state).toBe('disabled');
    expect(f.mcp.find((m) => m.name === 'claude.ai Linear')).toBeUndefined(); // untouched: no row
  });

  it('disableClaudeAiConnectors:true in user settings drops them all', () => {
    home = makeTempHome();
    const { ctx } = ctxWith(home, LIVE, { disableClaudeAiConnectors: true });
    expect(claudeCodeAdapter.collectGlobal(ctx, []).mcp).toEqual([]);
  });

  it('disableClaudeAiConnectors:true in a project settings file disables every connector in that folder', () => {
    home = makeTempHome();
    const { ctx, proj } = ctxWith(home, LIVE);
    writeFileEnsured(join(proj, '.claude', 'settings.json'), JSON.stringify({ disableClaudeAiConnectors: true }));
    const f = claudeCodeAdapter.collectForDirectory(proj, ctx, []);
    const names = f.mcp.filter((m) => m.provider.kind === 'account').map((m) => m.name).sort();
    expect(names).toEqual(['claude.ai Gmail', 'claude.ai Linear', 'claude.ai Slack']);
    for (const m of f.mcp) {
      expect(m.enabled).toBe(false);
      expect(m.override).toBe('project');
    }
  });

  it('scan() threads live data through and records that connectors were scanned', () => {
    home = makeTempHome();
    const { proj } = ctxWith(home, LIVE);
    const inv = scan(home, { walk: false, dir: proj, env: {}, live: { claudeAiConnectors: LIVE } });
    expect(inv.live).toEqual({ connectors: true });
    expect(inv.global.mcp.map((m) => m.name)).toContain('claude.ai Linear');
    const folder = inv.folders[0]!;
    expect(folder.effective.mcp.find((m) => m.name === 'claude.ai Gmail')!.enabled).toBe(false);
    expect(folder.effective.mcp.find((m) => m.name === 'claude.ai Linear')!.enabled).toBe(true);
  });

  it('scan() without live data reports connectors as not scanned', () => {
    home = makeTempHome();
    ctxWith(home);
    expect(scan(home, { walk: false, env: {} }).live).toEqual({ connectors: false });
  });
});

describe('claude-code adapter: connector health vs enablement', () => {
  it('a connector that failed its health check stays enabled (it is configured) and carries state failed', () => {
    home = makeTempHome();
    const { ctx } = ctxWith(home, [{ name: 'claude.ai Broken', url: 'https://x.example/mcp', state: 'failed' }]);
    const row = claudeCodeAdapter.collectGlobal(ctx, []).mcp.find((m) => m.name === 'claude.ai Broken')!;
    expect(row.enabled).toBe(true);
    expect(row.account?.state).toBe('failed');
  });
});
