/**
 * Shared skill-directory scanning + provider classification, reused by every
 * adapter that surfaces native skills (Claude Code, Codex, Hermes, Gemini, …).
 */
import { join, relative, isAbsolute } from 'node:path';
import type { Provider, Scope, SkillRecord } from './types.js';
import { sharedHubDir, type HomeCtx } from './runtimes.js';
import { realpathSafe } from './symlinks.js';
import { readDirEntries, isDir } from './fsread.js';
import { readFrontmatterFile } from './frontmatter.js';

/** True when `p` is `dir` or lives under it. */
export function isInside(p: string, dir: string): boolean {
  const rel = relative(dir, p);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Classify a skill's provider from where its real content lives. */
export function providerForRealpath(real: string, ctx: HomeCtx, scope: Scope): Provider {
  if (isInside(real, realpathSafe(sharedHubDir(ctx)))) return { kind: 'shared-store', path: real };
  const personal = realpathSafe(join(ctx.homeRoot, 'Developer', 'Skills'));
  if (isInside(real, personal)) return { kind: 'personal-repo', path: real };
  return { kind: scope === 'global' ? 'user' : 'project-local', path: real };
}

/**
 * Scan a skills directory. Each child entry is a skill dir (possibly a symlink
 * into the hub); content is read through the link via realpath.
 */
export function scanSkillsDir(dir: string, ctx: HomeCtx, scope: Scope): SkillRecord[] {
  const out: SkillRecord[] = [];
  for (const e of readDirEntries(dir)) {
    if (e.name.startsWith('.')) continue;
    if (!e.isDir && !e.isSymlink) continue;
    const linkPath = join(dir, e.name);
    const real = realpathSafe(linkPath);
    if (!isDir(real)) continue;
    const fm = readFrontmatterFile(join(linkPath, 'SKILL.md'));
    out.push({
      name: typeof fm.name === 'string' ? fm.name : e.name,
      description: typeof fm.description === 'string' ? fm.description : undefined,
      contentId: real,
      provider: providerForRealpath(real, ctx, scope),
      usedBy: [],
      enabled: true,
      scope,
    });
  }
  return out;
}
