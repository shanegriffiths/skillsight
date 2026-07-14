/**
 * OSC 52 clipboard write — no subprocess, works over SSH. tmux with
 * `set-clipboard on` (Shane's setup, verified 2026-07-14) forwards it to the
 * outer terminal.
 */
export function osc52(text: string): string {
  return `\u001b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\u0007`;
}

export function copyToClipboard(
  text: string,
  write: (s: string) => void = (s) => process.stdout.write(s),
): void {
  write(osc52(text));
}
