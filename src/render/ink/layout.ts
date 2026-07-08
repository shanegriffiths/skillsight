/**
 * Rows to leave unused at the very bottom of the terminal.
 *
 * Ink repaints the whole screen (`ansiEscapes.clearTerminal`) on every render
 * the moment the rendered output is as tall as the terminal — its renderer
 * treats `outputHeight >= rows` as "fullscreen" and stops using its incremental,
 * flicker-free redraw path. A full-height list that fills the screen exactly
 * therefore flickers hard on every scroll. Budgeting each view one row short of
 * the terminal keeps output strictly below that threshold, so scrolling redraws
 * in place. One row is enough; the constant names the reason.
 */
export const SCREEN_RESERVE = 1;
