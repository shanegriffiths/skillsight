import { describe, it, expect } from 'vitest';
import { ALT_SCREEN_ENTER, ALT_SCREEN_LEAVE, runInAltScreen } from '../src/render/ink/altScreen.js';

function fakeOut() {
  const chunks: string[] = [];
  return { write: (s: string) => (chunks.push(s), true), chunks };
}

describe('runInAltScreen', () => {
  it('enters the alternate screen before the body and leaves it after, so nothing stays on the terminal', async () => {
    const out = fakeOut();
    const order: string[] = [];
    await runInAltScreen(out, async () => {
      order.push(`body saw ${out.chunks.length} chunk(s)`);
    });
    expect(out.chunks).toEqual([ALT_SCREEN_ENTER, ALT_SCREEN_LEAVE]);
    expect(order).toEqual(['body saw 1 chunk(s)']);
  });

  it('still leaves the alternate screen when the body throws', async () => {
    const out = fakeOut();
    await expect(runInAltScreen(out, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(out.chunks.at(-1)).toBe(ALT_SCREEN_LEAVE);
  });
});
