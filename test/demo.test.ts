import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { makeTempHome, cleanup } from './helpers.js';
import { buildDemoHome } from '../src/demo.js';
import { scan } from '../src/index.js';

let home = '';
afterEach(() => { if (home) cleanup(home); home = ''; });

describe('buildDemoHome', () => {
  it('produces a fixture that scans into a rich, leak-proof inventory', () => {
    home = makeTempHome();
    const root = buildDemoHome(join(home, 'demo'));
    const inv = scan(root, { walk: true, env: {} });

    // multiple runtimes detected
    for (const r of ['claude-code', 'codex', 'hermes-agent', 'cursor']) {
      expect(inv.runtimesDetected).toContain(r);
    }

    // a shared-store skill used by more than one runtime
    const ab = inv.global.skills.find((s) => s.name === 'agent-browser')!;
    expect(ab).toBeDefined();
    expect(ab.provider.kind).toBe('shared-store');
    expect(ab.usedBy.length).toBeGreaterThanOrEqual(2);

    // a plugin resolved
    expect(inv.global.plugins.some((p) => p.id === 'sentry@studio-marketplace')).toBe(true);

    // provider variety in the global layer: shared-store, user, runtime-builtin
    const gProviders = new Set(inv.global.skills.map((s) => s.provider.kind));
    expect(gProviders.has('shared-store')).toBe(true);
    expect(gProviders.has('user')).toBe(true);
    expect(gProviders.has('runtime-builtin')).toBe(true);

    // a project-local skill in folio-site
    const folio = inv.folders.find((f) => f.path.endsWith('folio-site'))!;
    expect(folio).toBeDefined();
    const wdg = folio.projectScoped.skills.find((s) => s.name === 'web-design-guidelines')!;
    expect(wdg).toBeDefined();
    expect(wdg.provider.kind).toBe('project-local');

    // the git worktree checkouts were discovered
    const paths = inv.folders.map((f) => f.path);
    expect(paths.some((p) => p.endsWith(join('orbit-dashboard.worktree', 'feature-auth')))).toBe(true);
    expect(paths.some((p) => p.endsWith(join('orbit-dashboard.worktree', 'spike-charts')))).toBe(true);

    // secrets never leak: values absent, key names present
    const blob = JSON.stringify(inv);
    expect(blob).not.toContain('sk_live_demo');
    expect(blob).not.toContain('demo-not-a-real-key');
    expect(blob).not.toContain('demo-not-a-real-token');
    expect(blob).toContain('STRIPE_SECRET_KEY');
    expect(blob).toContain('LINEAR_API_KEY');
  });
});
