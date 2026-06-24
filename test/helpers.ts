import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import type { HomeCtx } from '../src/runtimes.js';

/** Create an isolated temp home root for a test. */
export function makeTempHome(): string {
  return mkdtempSync(join(tmpdir(), 'skillsight-'));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function ctxOf(home: string, env: Record<string, string | undefined> = {}): HomeCtx {
  return { homeRoot: home, env };
}

export function writeFileEnsured(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Create `<skillsDir>/<name>/SKILL.md` and return the skill dir path. */
export function writeSkillDir(
  skillsDir: string,
  name: string,
  opts: { name?: string; description?: string } = {},
): string {
  const dir = join(skillsDir, name);
  const fmName = opts.name ?? name;
  const desc = opts.description ?? `desc for ${name}`;
  writeFileEnsured(join(dir, 'SKILL.md'), `---\nname: ${fmName}\ndescription: ${desc}\n---\nbody\n`);
  return dir;
}

/** Symlink `linkPath` -> `target` (creating parent dirs). */
export function symlinkInto(linkPath: string, target: string): void {
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(target, linkPath);
}
