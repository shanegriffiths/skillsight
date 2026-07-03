import { describe, it, expect } from 'vitest';
import { listDetailAction, type ListDetailKey } from '../src/render/ink/listDetail.js';

const keyOf = (over: Partial<ListDetailKey> = {}): ListDetailKey => ({
  escape: false, leftArrow: false, rightArrow: false, upArrow: false, downArrow: false, return: false,
  ...over,
});

describe('listDetailAction — list mode', () => {
  const ctx = { detail: false, rowCount: 5 };
  it('maps movement (arrows + j/k)', () => {
    expect(listDetailAction('', keyOf({ downArrow: true }), ctx)).toEqual({ type: 'down' });
    expect(listDetailAction('j', keyOf(), ctx)).toEqual({ type: 'down' });
    expect(listDetailAction('', keyOf({ upArrow: true }), ctx)).toEqual({ type: 'up' });
    expect(listDetailAction('k', keyOf(), ctx)).toEqual({ type: 'up' });
  });
  it('return/right opens detail when rows exist', () => {
    expect(listDetailAction('', keyOf({ return: true }), ctx)).toEqual({ type: 'openDetail' });
    expect(listDetailAction('', keyOf({ rightArrow: true }), ctx)).toEqual({ type: 'openDetail' });
  });
  it('does NOT open detail on an empty list (CMP-9 guard)', () => {
    expect(listDetailAction('', keyOf({ return: true }), { detail: false, rowCount: 0 })).toEqual({ type: 'none' });
  });
});

describe('listDetailAction — detail mode', () => {
  const ctx = { detail: true, rowCount: 5 };
  it('escape/left closes; everything else is inert', () => {
    expect(listDetailAction('', keyOf({ escape: true }), ctx)).toEqual({ type: 'closeDetail' });
    expect(listDetailAction('', keyOf({ leftArrow: true }), ctx)).toEqual({ type: 'closeDetail' });
    expect(listDetailAction('j', keyOf(), ctx)).toEqual({ type: 'none' });
    expect(listDetailAction('', keyOf({ return: true }), ctx)).toEqual({ type: 'none' });
  });
});
