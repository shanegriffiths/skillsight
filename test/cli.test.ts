import { describe, it, expect } from 'vitest';
import { decideMode, parseArgs, resolveScan } from '../src/cliArgs.js';

const flags = (o: Partial<{ json: boolean; watch: boolean; report: boolean; show: boolean }> = {}) => ({
  json: false,
  watch: false,
  report: false,
  show: false,
  ...o,
});

describe('decideMode — dashboard is the default', () => {
  it('bare command opens the dashboard on a TTY', () => {
    expect(decideMode(flags(), true)).toBe('dashboard');
  });

  it('bare command falls back to the plain report when non-TTY (piped/CI)', () => {
    expect(decideMode(flags(), false)).toBe('report');
  });

  it('--json always wins, regardless of TTY', () => {
    expect(decideMode(flags({ json: true }), true)).toBe('json');
    expect(decideMode(flags({ json: true }), false)).toBe('json');
    expect(decideMode(flags({ json: true, watch: true, report: true }), true)).toBe('json');
  });

  it('explicit watch forces the dashboard even when non-TTY', () => {
    expect(decideMode(flags({ watch: true }), false)).toBe('dashboard');
  });

  it('--report forces the plain report even on a TTY', () => {
    expect(decideMode(flags({ report: true }), true)).toBe('report');
  });

  it('watch wins over --report when both are given', () => {
    expect(decideMode(flags({ watch: true, report: true }), false)).toBe('dashboard');
  });

  it('show wins mode selection, even with --json', () => {
    expect(decideMode(flags({ json: true, show: true }), true)).toBe('show');
    expect(decideMode(flags({ show: true }), false)).toBe('show');
  });
});

describe('parseArgs hardening', () => {
  it('--dir does not swallow a following flag; missing path is a fatal error', () => {
    const a = parseArgs(['--dir', '--json']);
    expect(a.dir).toBeUndefined();
    expect(a.json).toBe(true); // --json parsed as its own flag
    expect(a.errors).toEqual(['--dir requires a path']);
    expect(parseArgs(['--dir']).errors).toEqual(['--dir requires a path']);
    expect(parseArgs(['--dir', '/tmp/x']).dir).toBe('/tmp/x');
  });

  it('--home takes a path and errors when missing, like --dir', () => {
    expect(parseArgs(['--home', '/other/home']).home).toBe('/other/home');
    expect(parseArgs(['--home', '--json']).home).toBeUndefined();
    expect(parseArgs(['--home', '--json']).errors).toEqual(['--home requires a path']);
    expect(parseArgs(['--home']).errors).toEqual(['--home requires a path']);
  });

  it('unknown tokens produce warnings, not silence', () => {
    const a = parseArgs(['--repot', 'stray']);
    expect(a.issues).toEqual(['unknown option: --repot', 'unknown option: stray']);
    expect(a.report).toBe(false);
  });

  it('invalid --kind values warn and are dropped (filter behavior unchanged)', () => {
    const a = parseArgs(['--kind', 'skil,mcp']);
    expect(a.kinds).toEqual(['mcp']);
    expect(a.issues).toEqual(['unknown kind: skil (expected skill|plugin|mcp)']);
  });

  it('unknown --runtime ids warn but are still applied', () => {
    const a = parseArgs(['--runtime', 'bogus', 'claude-code']);
    expect(a.runtimes).toEqual(['bogus', 'claude-code']);
    expect(a.issues).toEqual(['unknown runtime: bogus']);
  });

  it('clean invocations carry no issues or errors', () => {
    const a = parseArgs(['--report', '--kind', 'skill', '--runtime', 'codex']);
    expect(a.issues).toEqual([]);
    expect(a.errors).toEqual([]);
  });

  it('parses --demo as a boolean flag with no issues', () => {
    expect(parseArgs(['--demo']).demo).toBe(true);
    expect(parseArgs([]).demo).toBe(false);
    expect(parseArgs(['--demo']).issues).toEqual([]);
  });

  it('parses show with a ref', () => {
    const a = parseArgs(['show', 'obsidian-cli']);
    expect(a.show).toBe(true);
    expect(a.showRef).toBe('obsidian-cli');
    expect(a.errors).toEqual([]);
  });

  it('show without a ref is a fatal error', () => {
    const a = parseArgs(['show']);
    expect(a.errors).toContain('show requires a <ref> (item name or id prefix)');
  });
});

describe('resolveScan', () => {
  it('--demo targets the prebuilt fixture with an empty env and forced walk', () => {
    const t = resolveScan(parseArgs(['--demo']), { CLAUDE_CONFIG_DIR: '/real/leak' }, { osHome: '/real/home', demoHome: '/tmp/demo' });
    expect(t.homeRoot).toBe('/tmp/demo');
    expect(t.scanOpts).toEqual({ walk: true, env: {} });
  });

  it('without --demo, --home beats SKILLSIGHT_HOME beats OS home; walk/dir preserved', () => {
    expect(resolveScan(parseArgs([]), {}, { osHome: '/os' }).homeRoot).toBe('/os');
    expect(resolveScan(parseArgs([]), { SKILLSIGHT_HOME: '/env' }, { osHome: '/os' }).homeRoot).toBe('/env');
    expect(resolveScan(parseArgs(['--home', '/flag']), { SKILLSIGHT_HOME: '/env' }, { osHome: '/os' }).homeRoot).toBe('/flag');
    expect(resolveScan(parseArgs(['--no-walk', '--dir', '/d']), {}, { osHome: '/os' }).scanOpts).toEqual({ walk: false, dir: '/d' });
  });

  it('--demo with no demoHome falls back to normal resolution (defensive)', () => {
    expect(resolveScan(parseArgs(['--demo']), {}, { osHome: '/os' }).homeRoot).toBe('/os');
  });

  it('--demo overrides explicit --home/--dir/--no-walk flags', () => {
    const t = resolveScan(parseArgs(['--demo', '--home', '/x', '--no-walk']), {}, { osHome: '/os', demoHome: '/tmp/demo' });
    expect(t).toEqual({ homeRoot: '/tmp/demo', scanOpts: { walk: true, env: {} } });
  });
});
