/**
 * The shared `~/.agents` store — the canonical skill hub managed by Vercel's
 * `skills` CLI (`npx skills`). This is the spine the whole inventory dedupes
 * against: runtimes symlink into `~/.agents/skills`, and `.skill-lock.json`
 * (schema v3) records each skill's origin repo + git tree hash.
 *
 * Skills present in the hub but absent from the lock are still reported (they
 * just carry no lock-derived provenance).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Warning } from './types.js';
import { sharedHubDir, sharedLockPath, type HomeCtx } from './runtimes.js';
import { readFrontmatterFile } from './frontmatter.js';
import { realpathSafe } from './symlinks.js';

/** A per-skill entry in `.skill-lock.json` (v3). */
export interface LockEntry {
  source?: string;
  sourceType?: string;
  sourceUrl?: string;
  skillPath?: string;
  skillFolderHash?: string;
  installedAt?: string;
  updatedAt?: string;
  ref?: string;
  pluginName?: string;
}

export interface SkillLock {
  version?: number;
  skills?: Record<string, LockEntry>;
  /** Top-level (global) — which agent types the user last selected on install. */
  lastSelectedAgents?: string[];
  dismissed?: Record<string, unknown>;
}

export interface SharedSkill {
  name: string;
  description?: string;
  /** realpath of the skill dir within the hub. */
  realPath: string;
  /** `skillFolderHash` from the lock if present, else `realPath`. */
  contentId: string;
  source?: string;
  sourceUrl?: string;
  skillFolderHash?: string;
}

export interface SharedStoreResult {
  skills: SharedSkill[];
  lastSelectedAgents: string[];
  warnings: Warning[];
}

/** Read + parse `.skill-lock.json`. Returns `undefined` (with a warning) on error. */
export function readSkillLock(ctx: HomeCtx, warnings: Warning[]): SkillLock | undefined {
  const path = sharedLockPath(ctx);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return undefined; // no lock file — fine, hub may still have content
  }
  try {
    return JSON.parse(raw) as SkillLock;
  } catch {
    warnings.push({ path, reason: 'unreadable: malformed .skill-lock.json' });
    return undefined;
  }
}

/** Walk `~/.agents/skills/*` and enrich each skill from the lock file. */
export function collectSharedStore(ctx: HomeCtx): SharedStoreResult {
  const warnings: Warning[] = [];
  const hub = sharedHubDir(ctx);
  const lock = readSkillLock(ctx, warnings);

  let names: string[];
  try {
    names = readdirSync(hub);
  } catch {
    return { skills: [], lastSelectedAgents: lock?.lastSelectedAgents ?? [], warnings };
  }

  const skills: SharedSkill[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const dir = join(hub, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }

    const realPath = realpathSafe(dir);
    const fm = readFrontmatterFile(join(dir, 'SKILL.md'));
    const entry = lock?.skills?.[name];
    const skillFolderHash = entry?.skillFolderHash;

    skills.push({
      name: typeof fm.name === 'string' ? fm.name : name,
      description: typeof fm.description === 'string' ? fm.description : undefined,
      realPath,
      contentId: skillFolderHash ?? realPath,
      source: entry?.source,
      sourceUrl: entry?.sourceUrl,
      skillFolderHash,
    });
  }

  return { skills, lastSelectedAgents: lock?.lastSelectedAgents ?? [], warnings };
}
