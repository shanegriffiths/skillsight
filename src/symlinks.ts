/**
 * Symlink resolution + the reverse-symlink index that powers `usedBy`.
 *
 * Runtimes that keep their own skills directory (Claude Code, Codex, Gemini,
 * OpenCode, Copilot, Windsurf, …) surface a shared skill by symlinking their
 * `<home>/skills/<name>` entry into the `~/.agents/skills` hub. Resolving those
 * links back to real content tells us exactly which runtimes consume each skill.
 *
 * Hub-direct universal agents (whose `globalSkillsDir` *is* the hub) are skipped
 * here — we can't distinguish their presence from the hub merely existing — and
 * are instead credited via the lock file's `lastSelectedAgents` in the resolver.
 */
import { readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { Runtime } from './types.js';
import { KNOWN_RUNTIMES, globalSkillsDir, sharedHubDir, type HomeCtx } from './runtimes.js';

/** `fs.realpath`, falling back to the input path when it can't be resolved. */
export function realpathSafe(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Map: real content path -> set of runtime ids whose distinct skills dir points
 * at it. Keyed by realpath so callers look up via a skill's resolved location.
 */
export function buildReverseSymlinkIndex(ctx: HomeCtx): Map<string, Set<Runtime>> {
  const hub = realpathSafe(sharedHubDir(ctx));
  const index = new Map<string, Set<Runtime>>();

  for (const def of KNOWN_RUNTIMES) {
    const dir = globalSkillsDir(def, ctx);
    // Skip agents whose global skills dir is the hub itself.
    if (realpathSafe(dir) === hub) continue;

    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue; // runtime not present
    }

    for (const name of names) {
      if (name.startsWith('.')) continue;
      const real = realpathSafe(join(dir, name));
      let set = index.get(real);
      if (!set) {
        set = new Set();
        index.set(real, set);
      }
      set.add(def.id);
    }
  }

  return index;
}

/** Runtimes referencing the content at `realPath`, sorted for stable output. */
export function lookupUsedBy(index: Map<string, Set<Runtime>>, realPath: string): Runtime[] {
  const set = index.get(realPath);
  return set ? [...set].sort() : [];
}
