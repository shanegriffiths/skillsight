/**
 * Alternate screen buffer for the dashboard, so quitting restores the terminal
 * exactly as it was (like vim/htop/less) instead of leaving the last frame
 * above the prompt.
 */

/** Switch to the alternate buffer and home the cursor. */
export const ALT_SCREEN_ENTER = '\x1b[?1049h\x1b[H';
/** Back to the main buffer (its contents and cursor are restored by the terminal). */
export const ALT_SCREEN_LEAVE = '\x1b[?1049l';

export interface Writable {
  write(s: string): boolean;
}

/** Run `body` inside the alternate screen; always leaves it, even on a throw. */
export async function runInAltScreen<T>(out: Writable, body: () => Promise<T>): Promise<T> {
  out.write(ALT_SCREEN_ENTER);
  try {
    return await body();
  } finally {
    out.write(ALT_SCREEN_LEAVE);
  }
}
