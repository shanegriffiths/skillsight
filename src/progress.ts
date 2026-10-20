/**
 * A one-line stderr progress indicator for the moments skillsight is busy
 * before it can show anything: the `--live` connector check (several seconds,
 * network-bound) and the initial scan. Only draws on a TTY; silent when piped.
 *
 * The line is drawn immediately, so even a synchronous wait shows the label,
 * and it ticks with elapsed seconds while the event loop is free. `stop()`
 * clears the line so it never lingers in scrollback.
 */

export interface ProgressStream {
  isTTY?: boolean;
  write(s: string): boolean;
}

export interface Progress {
  stop(): void;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const CLEAR = '\r\x1b[K';

export function startProgress(
  label: string,
  stream: ProgressStream,
  opts: { intervalMs?: number } = {},
): Progress {
  if (!stream.isTTY) return { stop() {} };
  const started = Date.now();
  let frame = 0;
  const draw = () => {
    const secs = Math.floor((Date.now() - started) / 1000);
    const elapsed = secs >= 1 ? ` ${secs}s` : '';
    stream.write(`${CLEAR}${FRAMES[frame % FRAMES.length]} ${label}…${elapsed}`);
    frame++;
  };
  draw();
  const timer = setInterval(draw, opts.intervalMs ?? 80);
  // Don't let the spinner alone keep the process alive.
  (timer as { unref?: () => void }).unref?.();
  return {
    stop() {
      clearInterval(timer);
      stream.write(CLEAR);
    },
  };
}
