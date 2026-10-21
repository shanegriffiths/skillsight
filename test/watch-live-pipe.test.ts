import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

/**
 * `skillsight watch --live` with stdout piped (non-TTY) prints the plain report
 * once, then reprints on config changes. The FIRST report must already include
 * the connectors the live check returned — nothing may trigger a later rescan.
 */
describe('watch --live on a pipe', () => {
  it('first printed report already lists the live connectors', async () => {
    const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const child = spawn(tsx, ['src/cli.ts', 'watch', '--live', '--demo'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    let out = '';
    const first = await new Promise<string>((resolve, reject) => {
      let settle: ReturnType<typeof setTimeout> | undefined;
      const giveUp = setTimeout(() => reject(new Error(`no report within 20s; got:\n${out}`)), 20_000);
      child.stdout.on('data', (d) => {
        out += String(d);
        if (settle) clearTimeout(settle);
        settle = setTimeout(() => { clearTimeout(giveUp); resolve(out); }, 400); // report finished streaming
      });
      child.on('error', reject);
    });
    child.kill('SIGTERM');
    expect(first).toContain('claude.ai Linear');
    expect(first).not.toContain('connectors: not scanned');
  }, 30_000);
});
