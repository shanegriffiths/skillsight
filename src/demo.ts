/**
 * Builds a throwaway, realistic-but-fictional home for `skillsight --demo`.
 * Written with plain node:fs (its own tiny helpers) so src/ never imports from
 * test/. The home is wiped and rebuilt each call, so a demo run is deterministic
 * and leaves nothing to accumulate.
 */
import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULT_ROOT = join(tmpdir(), 'skillsight-demo-home');

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Create `<dir>/<name>/SKILL.md` and return the skill directory path. */
function skill(dir: string, name: string, description: string): string {
  write(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`);
  return join(dir, name);
}

function link(from: string, to: string): void {
  mkdirSync(dirname(from), { recursive: true });
  symlinkSync(to, from);
}

const json = (v: unknown): string => JSON.stringify(v, null, 2);

export function buildDemoHome(root: string = DEFAULT_ROOT): string {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  // --- shared-store hub + lock ---
  const hub = join(root, '.agents', 'skills');
  const agentBrowser = skill(hub, 'agent-browser', 'Drive a real browser from the agent.');
  const vercelReact = skill(hub, 'vercel-react-best-practices', 'React and Next.js best practices.');
  const payload = skill(hub, 'payload', 'Work with Payload CMS collections and hooks.');
  write(join(root, '.agents', '.skill-lock.json'), json({
    version: 3,
    skills: {
      'agent-browser': { source: 'vercel-labs/agent-browser', sourceUrl: 'https://github.com/vercel-labs/agent-browser', skillFolderHash: 'demo-agentbrowser' },
      'vercel-react-best-practices': { source: 'vercel-labs/react-best-practices', sourceUrl: 'https://github.com/vercel-labs/react-best-practices', skillFolderHash: 'demo-vercelreact' },
      payload: { source: 'payloadcms/skills', sourceUrl: 'https://github.com/payloadcms/skills', skillFolderHash: 'demo-payload' },
    },
    lastSelectedAgents: ['claude-code', 'codex', 'cursor'],
  }));

  // --- Claude Code (global): two hub links (credit usedBy) + one user skill + a plugin ---
  link(join(root, '.claude', 'skills', 'agent-browser'), agentBrowser);
  link(join(root, '.claude', 'skills', 'vercel-react-best-practices'), vercelReact);
  skill(join(root, '.claude', 'skills'), 'commit-helper', 'Write tidy conventional commits.');
  write(join(root, '.claude', 'settings.json'), json({ enabledPlugins: { 'sentry@studio-marketplace': true } }));

  const sentryCache = join(root, '.claude', 'plugins', 'cache', 'studio', 'sentry', '1.4.0');
  write(join(root, '.claude', 'plugins', 'installed_plugins.json'), json({
    version: 2,
    plugins: { 'sentry@studio-marketplace': [{ scope: 'user', installPath: sentryCache, version: '1.4.0' }] },
  }));
  write(join(root, '.claude', 'plugins', 'known_marketplaces.json'), json({
    'studio-marketplace': { source: { source: 'github', repo: 'getsentry/claude-plugins' } },
  }));
  write(join(sentryCache, '.claude-plugin', 'plugin.json'), json({ name: 'sentry' }));
  skill(join(sentryCache, 'skills'), 'sentry-code-review', 'Review a diff for crash-prone changes.');

  // --- Codex: a hub link (usedBy), a bundled .system skill (runtime-builtin), an MCP with secret-shaped env ---
  link(join(root, '.codex', 'skills', 'agent-browser'), agentBrowser);
  skill(join(root, '.codex', 'skills', '.system'), 'apply-patch', 'Apply a unified diff to the workspace.');
  write(join(root, '.codex', 'config.toml'),
    '[mcp_servers.linear]\n' +
    'command = "npx"\n' +
    'args = ["-y", "linear-mcp"]\n\n' +
    '[mcp_servers.linear.env]\n' +
    'LINEAR_API_KEY = "demo-not-a-real-key"\n');

  // --- Hermes ---
  skill(join(root, '.hermes', 'skills', 'messaging'), 'telegram-digest', 'Summarise a Telegram channel.');

  // --- Cursor: MCP only, with a secret-shaped header ---
  write(join(root, '.cursor', 'mcp.json'), json({
    mcpServers: { figma: { url: 'https://mcp.figma.com/sse', headers: { Authorization: 'Bearer demo-not-a-real-token' } } },
  }));

  // --- Projects ---
  const projects = join(root, 'Developer', 'Projects');

  const acme = join(projects, 'acme-storefront');
  write(join(acme, 'CLAUDE.md'), '# acme-storefront\nStorefront for the demo.\n');
  link(join(acme, '.claude', 'skills', 'payload'), payload);
  write(join(acme, '.mcp.json'), json({
    mcpServers: {
      postgres: {
        type: 'stdio', command: 'npx', args: ['-y', 'postgres-mcp'],
        env: { DATABASE_URL: 'postgres://demo', STRIPE_SECRET_KEY: 'sk_live_demo' },
      },
    },
  }));
  write(join(acme, '.claude', 'settings.json'), json({ enabledPlugins: { 'sentry@studio-marketplace': true } }));

  const folio = join(projects, 'folio-site');
  write(join(folio, 'CLAUDE.md'), '# folio-site\nPersonal portfolio.\n');
  skill(join(folio, '.claude', 'skills'), 'web-design-guidelines', 'House style for layout and type.');

  const pixel = join(projects, 'pixel-pet');
  write(join(pixel, 'CLAUDE.md'), '# pixel-pet\nA small game side-project.\n');

  const orbit = join(projects, 'orbit-dashboard');
  write(join(orbit, 'CLAUDE.md'), '# orbit-dashboard\nAnalytics dashboard.\n');
  link(join(orbit, '.claude', 'skills', 'vercel-react-best-practices'), vercelReact);
  // No CLAUDE.md (or any other marker) in the checkouts: the plain walk can't
  // discover them and they aren't in the .claude.json registry, so they can ONLY
  // be found via worktreesBeside()'s `.git`-pointer gating — making the worktree
  // assertions below a genuine guard on that sibling-expansion code path.
  for (const branch of ['feature-auth', 'spike-charts']) {
    const wt = join(projects, 'orbit-dashboard.worktree', branch);
    write(join(wt, '.git'), `gitdir: ${join(orbit, '.git', 'worktrees', branch)}\n`);
  }

  // --- registry + skill usage (drives discovery + the leaderboard) ---
  write(join(root, '.claude.json'), json({
    projects: {
      [acme]: { enabledMcpjsonServers: ['postgres'] },
      [folio]: {},
      [pixel]: {},
      [orbit]: {},
    },
    skillUsage: {
      'agent-browser': { usageCount: 42, lastUsedAt: 1 },
      'vercel-react-best-practices': { usageCount: 18, lastUsedAt: 1 },
      payload: { usageCount: 7, lastUsedAt: 1 },
      'sentry:sentry-code-review': { usageCount: 5, lastUsedAt: 1 },
    },
  }));

  return root;
}
