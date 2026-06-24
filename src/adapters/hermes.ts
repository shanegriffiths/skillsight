/**
 * Hermes (Kit) adapter (deep).
 *
 * `~/.hermes` (env: `HERMES_HOME`). Skills are organized two levels deep —
 * `skills/<domain>/<skill>/SKILL.md` — where domain dirs often hold only a
 * `DESCRIPTION.md` (skipped). A few domains carry a top-level `SKILL.md`. The
 * config's `mcp_servers` is empty in practice, so MCP is not surfaced from here.
 */
import { join } from 'node:path';
import type { Bucket, SkillRecord } from '../types.js';
import { emptyBucket } from '../types.js';
import { runtimeById, runtimeHome, type HomeCtx } from '../runtimes.js';
import { exists, readDirEntries } from '../fsread.js';
import { realpathSafe } from '../symlinks.js';
import { providerForRealpath } from '../skillscan.js';
import { readFrontmatterFile } from '../frontmatter.js';
import type { RuntimeAdapter } from './index.js';

const DEF = runtimeById('hermes-agent')!;

function hermesHome(ctx: HomeCtx): string {
  return runtimeHome(DEF, ctx);
}

function skillAt(path: string, fallbackName: string, ctx: HomeCtx, scope: SkillRecord['scope']): SkillRecord {
  const real = realpathSafe(path);
  const fm = readFrontmatterFile(join(path, 'SKILL.md'));
  return {
    name: typeof fm.name === 'string' ? fm.name : fallbackName,
    description: typeof fm.description === 'string' ? fm.description : undefined,
    contentId: real,
    provider: providerForRealpath(real, ctx, scope),
    usedBy: [],
    enabled: true,
    scope,
  };
}

/** Walk `<skillsDir>/<domain>/<skill>/SKILL.md` (depth 2), plus domain-level skills. */
function walkHermesSkills(skillsDir: string, ctx: HomeCtx, scope: SkillRecord['scope']): SkillRecord[] {
  const out: SkillRecord[] = [];
  for (const domain of readDirEntries(skillsDir)) {
    if (domain.name.startsWith('.') || (!domain.isDir && !domain.isSymlink)) continue;
    const domainPath = join(skillsDir, domain.name);

    // a domain dir may itself be a skill
    if (exists(join(domainPath, 'SKILL.md'))) {
      out.push(skillAt(domainPath, domain.name, ctx, scope));
    }

    for (const skill of readDirEntries(domainPath)) {
      if (skill.name.startsWith('.') || (!skill.isDir && !skill.isSymlink)) continue;
      const skillPath = join(domainPath, skill.name);
      if (!exists(join(skillPath, 'SKILL.md'))) continue; // skip DESCRIPTION.md-only entries
      out.push(skillAt(skillPath, skill.name, ctx, scope));
    }
  }
  return out;
}

export const hermesAdapter: RuntimeAdapter = {
  id: 'hermes-agent',

  detect(ctx) {
    return exists(hermesHome(ctx));
  },

  collectGlobal(ctx) {
    const bucket: Bucket = emptyBucket();
    bucket.skills.push(...walkHermesSkills(join(hermesHome(ctx), 'skills'), ctx, 'global'));
    return bucket;
  },

  collectForDirectory(dir, ctx) {
    const bucket: Bucket = emptyBucket();
    bucket.skills.push(...walkHermesSkills(join(dir, '.hermes', 'skills'), ctx, 'project-scoped'));
    return bucket;
  },
};
