/**
 * Shared skill-directory scanning + provider classification, reused by every
 * adapter that surfaces native skills (Claude Code, Codex, Hermes, Gemini, …).
 */
import { join, relative, isAbsolute } from 'node:path';
import type { Provider, Scope, SkillRecord } from './types.js';
import { sharedHubDir, type HomeCtx } from './runtimes.js';
import { realpathSafe } from './symlinks.js';
import { readDirEntries, isDir, exists } from './fsread.js';
import { readFrontmatterFile } from './frontmatter.js';

/** True when `p` is `dir` or lives under it. */
export function isInside(p: string, dir: string): boolean {
  const rel = relative(dir, p);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// Hub + personal-repo realpaths are stable per scan; resolving them per skill
// costs two realpath syscalls each — memoize per HomeCtx.
// NOTE: `~/Developer/Skills` is a personal-repo convention, not a cross-runtime
// standard; other setups classify as user/project-local (configurable path is planned).
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
 * Scan a project's shared agent hub (`<project>/.agents/skills`) — the
 * cross-runtime skill store that every `universal` runtime reads *directly* at
 * project scope (the folder-scoped mirror of the global `~/.agents/skills` hub).
 *
 * Every universal skill-adapter (Codex, Gemini, OpenCode) calls this for its
 * folder pass. The resolver dedupes the identical physical skills across those
 * adapters by `contentId` and unions their `usedBy` (each contributes itself via
 * the owner fallback), so a bare project-hub skill honestly reports every
 * detected universal runtime that can reach it — not just one. Skills a runtime
 * already symlinks into the hub via its own project dir dedupe to the same
 * record, so calling this alongside a `.codex/skills`-style scan never double-lists.
 */
export function scanProjectHub(dir: string, ctx: HomeCtx): SkillRecord[] {
  return scanSkillsDir(join(dir, '.agents', 'skills'), ctx, 'project-scoped');
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
  /**
   * Extra record fields by DIRECTORY entry name (e.g. Claude Code
   * `skillOverrides` visibility). Merged last, so it may override `enabled`.
   */
  overlay?: (dirName: string) => Partial<SkillRecord> | undefined,
): SkillRecord[] {
  const out: SkillRecord[] = [];
  for (const e of readDirEntries(dir)) {
    if (e.name.startsWith('.')) continue;
    if (!e.isDir && !e.isSymlink) continue;
    const linkPath = join(dir, e.name);
    const real = realpathSafe(linkPath);
    if (!isDir(real)) continue;
    // A directory is a skill only if it carries a SKILL.md; a support dir
    // (references/, assets/, …) is not.
    if (!exists(join(linkPath, 'SKILL.md'))) continue;
    const fm = readFrontmatterFile(join(linkPath, 'SKILL.md'));
    out.push({
      name: typeof fm.name === 'string' ? fm.name : e.name,
      description: typeof fm.description === 'string' ? fm.description : undefined,
      contentId: real,
      provider: providerForRealpath(real, ctx, scope),
      usedBy: [],
      enabled: enabledFor ? enabledFor(e.name) : true,
      scope,
      ...overlay?.(e.name),
    });
  }
  return out;
}
