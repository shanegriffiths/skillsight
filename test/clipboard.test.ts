import { describe, expect, it } from 'vitest';
import { osc52, copyToClipboard } from '../src/render/ink/clipboard.js';

describe('osc52', () => {
  it('base64-encodes into the clipboard escape', () => {
    expect(osc52('hi')).toBe('\u001b]52;c;aGk=\u0007');
  });
  it('copyToClipboard writes through the injected sink', () => {
    let got = '';
    copyToClipboard('hi', (s) => (got = s));
    expect(got).toBe(osc52('hi'));
  });
});
