import { useEffect, useState } from 'react';

/** Clamp an index into `[0, length-1]`; `0` for an empty list. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

/**
 * The visible half-open slice `[start, end)` of `height` rows that keeps
 * `selected` on screen — centred, then clamped so the window never runs past
 * either end. Returns the whole list when it fits.
 */
export function scrollWindow(
  length: number,
  height: number,
  selected: number,
): { start: number; end: number } {
  if (height >= length) return { start: 0, end: Math.max(length, 0) };
  const sel = clampIndex(selected, length);
  const half = Math.floor(height / 2);
  const start = Math.max(0, Math.min(sel - half, length - height));
  return { start, end: start + height };
}

/**
 * Thin React glue over the pure functions above: owns the selected index and
 * derives the visible window. Components consume this; tests cover the pure
 * functions directly.
 */
export function useScroll(length: number, height: number, resetKey?: unknown) {
  const [selected, setSelected] = useState(0);
  // Opt-in: when `resetKey` changes (e.g. a sort toggle reorders the list), send
  // the cursor back to the top. Callers that omit it keep their position.
  useEffect(() => {
    setSelected(0);
  }, [resetKey]);
  const sel = clampIndex(selected, length);
  const moveUp = () => setSelected(() => clampIndex(sel - 1, length));
  const moveDown = () => setSelected(() => clampIndex(sel + 1, length));
  const { start, end } = scrollWindow(length, height, sel);
  // Jump the cursor to an absolute index (used when the `/` filter closes).
  // No clamp here: callers may pass an index valid only after a pending rows
  // rebuild; the render-time clampIndex above corrects any overshoot.
  const select = (i: number) => setSelected(Math.max(0, i));
  return { selected: sel, start, end, moveUp, moveDown, select };
}
