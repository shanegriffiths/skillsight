import { describe, it, expect } from 'vitest';
import { decideMode } from '../src/cli.js';

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
