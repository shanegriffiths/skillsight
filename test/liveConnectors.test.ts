import { describe, it, expect } from 'vitest';
import { parseClaudeMcpList } from '../src/liveConnectors.js';

// A saved copy of real `claude mcp list` output (2026-10-20). Keys and secrets
// never appear in this output; the Firecrawl URL carries a workspace path only.
const SAMPLE = `Checking MCP server health…

claude.ai Claude Docs: https://api.anthropic.com/v1/pages/mcp - ✔ Connected
claude.ai Context7: https://mcp.context7.com/mcp - ✔ Connected
claude.ai Raindrop: https://api.raindrop.io/rest/v2/ai/mcp - ⊘ Disabled for this project (re-enable via /mcp)
claude.ai Gmail: https://gmailmcp.googleapis.com/mcp/v1 - ⊘ Disabled for this project (re-enable via /mcp)
claude.ai Slack: https://mcp.slack.com/mcp - ✗ Needs authentication
claude.ai Notion: https://mcp.notion.com/mcp - ✗ Failed to connect
plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ✔ Connected
atuin: atuin mcp - ✔ Connected
`;

describe('parseClaudeMcpList', () => {
  it('keeps only claude.ai connectors, with url and a normalized state', () => {
    const out = parseClaudeMcpList(SAMPLE);
    expect(out.map((c) => c.name)).toEqual([
      'claude.ai Claude Docs',
      'claude.ai Context7',
      'claude.ai Raindrop',
      'claude.ai Gmail',
      'claude.ai Slack',
      'claude.ai Notion',
    ]);
    const by = Object.fromEntries(out.map((c) => [c.name, c]));
    expect(by['claude.ai Context7']).toEqual({ name: 'claude.ai Context7', url: 'https://mcp.context7.com/mcp', state: 'connected' });
    expect(by['claude.ai Raindrop']!.state).toBe('disabled');
    expect(by['claude.ai Slack']!.state).toBe('needs-auth');
    expect(by['claude.ai Notion']!.state).toBe('failed');
  });

  it('returns an empty list for empty or unrelated output', () => {
    expect(parseClaudeMcpList('')).toEqual([]);
    expect(parseClaudeMcpList('No MCP servers configured.\n')).toEqual([]);
  });
});
