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

// Hub + personal-repo realpaths are stable per scan; resolving them per skill
// costs two realpath syscalls each — memoize per HomeCtx.
// NOTE: `~/Developer/Skills` is a personal-repo convention, not a cross-runtime
// standard; other setups classify as user/project-local (see ROADMAP "Beyond v0.2").
const classifierRootsCache = new WeakMap<HomeCtx, { hub: string; personal: string }>();

function classifierRoots(ctx: HomeCtx): { hub: string; personal: string } {
  const hit = classifierRootsCache.get(ctx);
  if (hit) return hit;
  const roots = {
    hub: realpathSafe(sharedHubDir(ctx)),
    personal: realpathSafe(join(ctx.homeRoot, 'Developer', 'Skills')),
  };
  classifierRootsCache.set(ctx, roots);
  return roots;
}

/** Classify a skill's provider from where its real content lives. */
export function providerForRealpath(real: string, ctx: HomeCtx, scope: Scope): Provider {
  const { hub, personal } = classifierRoots(ctx);
  if (isInside(real, hub)) return { kind: 'shared-store', path: real };
  if (isInside(real, personal)) return { kind: 'personal-repo', path: real };
  return { kind: scope === 'global' ? 'user' : 'project-local', path: real };
}

/**
 * Scan a skills directory. Each child entry is a skill dir (possibly a symlink
 * into the hub); content is read through the link via realpath.
 */
export function scanSkillsDir(
  dir: string,
  ctx: HomeCtx,
  scope: Scope,
  /** Enablement by DIRECTORY entry name (e.g. Codex `[[skills.config]]` stores paths, matched by basename). */
  enabledFor?: (dirName: string) => boolean,
): SkillRecord[] {
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
      enabled: enabledFor ? enabledFor(e.name) : true,
      scope,
    });
  }
  return out;
}
