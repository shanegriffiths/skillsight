/**
 * The shared flat-list-with-detail interaction (Global + Leaderboard tabs):
 * j/k/arrows move, Enter/→ opens the detail pane, Esc/← closes it. The pure
 * mapper is tested directly; the hook is thin glue over useScroll.
 */
import { useEffect, useState } from 'react';
import type { Key } from 'ink';
import { useScroll } from './scroll.js';

export type ListDetailKey = Pick<Key, 'escape' | 'leftArrow' | 'rightArrow' | 'upArrow' | 'downArrow' | 'return'>;

export type ListDetailAction =
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'openDetail' }
  | { type: 'closeDetail' }
  | { type: 'none' };

export function listDetailAction(
  input: string,
  key: ListDetailKey,
  ctx: { detail: boolean; rowCount: number },
): ListDetailAction {
  if (ctx.detail) {
    if (key.escape || key.leftArrow) return { type: 'closeDetail' };
    return { type: 'none' };
  }
  if (key.downArrow || input === 'j') return { type: 'down' };
  if (key.upArrow || input === 'k') return { type: 'up' };
  if ((key.return || key.rightArrow) && ctx.rowCount > 0) return { type: 'openDetail' };
  return { type: 'none' };
}

export function useListDetail(rowCount: number, height: number, resetKey?: unknown) {
  const { selected, start, end, moveUp, moveDown } = useScroll(rowCount, height, resetKey);
  const [detail, setDetail] = useState(false);
  // Close the detail pane when the list is reset (e.g. a sort toggle).
  useEffect(() => {
    setDetail(false);
  }, [resetKey]);

  const onInput = (input: string, key: ListDetailKey): boolean => {
    const action = listDetailAction(input, key, { detail, rowCount });
    switch (action.type) {
      case 'down': moveDown(); return true;
      case 'up': moveUp(); return true;
      case 'openDetail': setDetail(true); return true;
      case 'closeDetail': setDetail(false); return true;
      default: return false;
    }
  };

  return { detail, selected, start, end, onInput };
}
