import { describe, it, expect } from 'vitest';
import { decideMode, parseArgs } from '../src/cliArgs.js';

const flags = (o: Partial<{ json: boolean; watch: boolean; report: boolean }> = {}) => ({
  json: false,
  watch: false,
  report: false,
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
});
