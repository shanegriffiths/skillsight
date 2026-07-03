// test/hidden.test.ts
import { describe, it, expect } from 'vitest';
import { isHiddenPath, isHiddenFolder } from '../src/render/hidden.js';

describe('isHiddenPath', () => {
  it('hides any path with a dot segment', () => {
    expect(isHiddenPath('.config/tool')).toBe(true);
    expect(isHiddenPath('Developer/.secret/x')).toBe(true);
    expect(isHiddenPath('Developer/Projects/app')).toBe(false);
  });
});

describe('isHiddenFolder', () => {
  it('applies the dot-segment rule home-relatively', () => {
    expect(isHiddenFolder('/home/u/.config/tool', '/home/u')).toBe(true);
    expect(isHiddenFolder('/home/u/Developer/app', '/home/u')).toBe(false);
  });
  it('folders outside homeRoot are never hidden', () => {
    expect(isHiddenFolder('/srv/.weird/app', '/home/u')).toBe(false);
  });
});
