import { describe, it, expect } from 'vitest';
import { clampIndex, scrollWindow } from '../src/render/ink/scroll.js';

describe('clampIndex', () => {
  it('clamps below zero to zero', () => {
    expect(clampIndex(-3, 10)).toBe(0);
  });
  it('clamps above the last index', () => {
    expect(clampIndex(20, 10)).toBe(9);
  });
  it('returns zero for an empty list', () => {
    expect(clampIndex(5, 0)).toBe(0);
  });
});

describe('scrollWindow', () => {
  it('returns the whole list when height covers it', () => {
    expect(scrollWindow(4, 10, 2)).toEqual({ start: 0, end: 4 });
  });
  it('is safe for an empty list', () => {
    expect(scrollWindow(0, 10, 0)).toEqual({ start: 0, end: 0 });
  });
  it('pins to the top when selected is near the start', () => {
    expect(scrollWindow(100, 10, 0)).toEqual({ start: 0, end: 10 });
  });
  it('centres selected in the middle of a long list', () => {
    // half = floor(10/2) = 5, so start = 50 - 5 = 45
    expect(scrollWindow(100, 10, 50)).toEqual({ start: 45, end: 55 });
  });
  it('pins to the bottom when selected is at the end', () => {
    expect(scrollWindow(100, 10, 99)).toEqual({ start: 90, end: 100 });
  });
  it('keeps selected within the returned window', () => {
    for (const sel of [0, 1, 37, 88, 99]) {
      const { start, end } = scrollWindow(100, 12, sel);
      expect(sel).toBeGreaterThanOrEqual(start);
      expect(sel).toBeLessThan(end);
    }
  });
  it('height === length shows everything (boundary of the short-circuit)', () => {
    expect(scrollWindow(5, 5, 3)).toEqual({ start: 0, end: 5 });
  });
});
