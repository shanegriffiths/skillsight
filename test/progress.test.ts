import { describe, it, expect, vi } from 'vitest';
import { startProgress } from '../src/progress.js';

function fakeStream(isTTY: boolean) {
  const chunks: string[] = [];
  return {
    isTTY,
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
    chunks,
  };
}

describe('startProgress', () => {
  it('on a TTY, shows the label at once, ticks with elapsed seconds, and clears the line on stop', () => {
    vi.useFakeTimers();
    const out = fakeStream(true);
    const p = startProgress('checking claude.ai connectors', out, { intervalMs: 100 });
    expect(out.chunks.join('')).toContain('checking claude.ai connectors');
    vi.advanceTimersByTime(1100);
    expect(out.chunks.at(-1)).toMatch(/checking claude\.ai connectors.*1s/);
    p.stop();
    expect(out.chunks.at(-1)).toBe('\r\x1b[K');
    vi.advanceTimersByTime(500);
    expect(out.chunks.at(-1)).toBe('\r\x1b[K'); // no ticks after stop
    vi.useRealTimers();
  });

  it('writes nothing when the stream is not a TTY', () => {
    const out = fakeStream(false);
    const p = startProgress('scanning', out);
    p.stop();
    expect(out.chunks).toEqual([]);
  });
});
