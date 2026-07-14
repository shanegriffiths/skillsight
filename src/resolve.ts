/**
 * Resolver: enrich raw adapter records with provenance + `usedBy`, dedupe across
 * runtimes, and merge inheritance layers.
 *
 * `usedBy` (a skill's runtime *reach*) is purely the reverse-symlink scan: the
 * distinct-dir runtimes that symlink the skill. It is NOT invocation count, and
 * hub-direct agents that merely read the whole hub (the lock's
 * `lastSelectedAgents`) are deliberately not folded in — that inflated every hub
 * skill uniformly. Dedup key is the canonical `contentId` (`skillFolderHash` ‖
 * realpath).
 */
import type { Bucket, McpRecord, PluginRecord, Provider, Runtime, SkillRecord, SkillCopy } from './types.js';
import { emptyBucket } from './types.js';
import { type HomeCtx } from './runtimes.js';
import { lookupUsedBy, type SiteIndex } from './symlinks.js';
import { hashSkillFolder } from './fsread.js';
import type { SharedSkill } from './sharedstore.js';
import { usageKey, type SkillUsage } from './skillusage.js';

const PROVIDER_RANK: Record<Provider['kind'], number> = {
  'shared-store': 6,
  plugin: 5,
  'personal-repo': 4,
  'runtime-builtin': 3,
  user: 2,
  'project-local': 1,
};

export interface EnrichContext {
  sharedByRealpath: Map<string, SharedSkill>;
  reverseIndex: SiteIndex;
  usageByKey: Map<string, SkillUsage>;
}

/** Attach Claude Code usage to a skill, matched by name / plugin:name. */
function applyUsage(s: SkillRecord, usageByKey: Map<string, SkillUsage>): void {
  const u = usageByKey.get(usageKey(s.name, s.bundledInPlugin));
  if (u) {
    s.usageCount = u.count;
    s.lastUsedAt = u.lastUsedAt;
  }
}

/** Enrich one adapter's bucket in place; `owner` is the producing runtime. */
export function enrichBucket(bucket: Bucket, owner: Runtime, enr: EnrichContext): Bucket {
  for (const s of bucket.skills) {
    const info = enr.sharedByRealpath.get(s.provider.path);
    if (s.provider.kind === 'shared-store' && info) {
      s.provider.source = info.source;
      s.provider.sourceUrl = info.sourceUrl;
      s.provider.skillFolderHash = info.skillFolderHash;
    }
    s.contentId = info?.skillFolderHash ?? s.contentId;
    // Project-local skills carry no git hash — identify them by content so
    // byte-identical copies across projects dedupe (and their locations union),
    // instead of one path-keyed row per project.
    if (s.provider.kind === 'project-local') {
      s.contentId = hashSkillFolder(s.provider.path) ?? s.contentId;
    }

    const used = new Set<Runtime>(lookupUsedBy(enr.reverseIndex, s.provider.path));
    if (used.size === 0) used.add(owner);
    s.usedBy = [...used].sort();
    applyUsage(s, enr.usageByKey);
  }
  return bucket;
}

/**
 * Every hub skill as a `shared-store` SkillRecord — including hub-direct-only
 * skills that no runtime symlinks (e.g. installed for warp/zed/cline only).
 * No owner fallback: an unused hub skill honestly reports `usedBy: []`.
 */
export function sharedStoreBucket(shared: SharedSkill[], enr: EnrichContext): Bucket {
  const skills: SkillRecord[] = shared.map((info) => {
    const used = new Set<Runtime>(lookupUsedBy(enr.reverseIndex, info.realPath));
    const usage = enr.usageByKey.get(usageKey(info.name)); // hub skills are never plugin-bundled
    return {
      name: info.name,
      description: info.description,
      contentId: info.contentId,
      provider: {
        kind: 'shared-store',
        path: info.realPath,
        source: info.source,
        sourceUrl: info.sourceUrl,
        skillFolderHash: info.skillFolderHash,
      },
      usedBy: [...used].sort(),
      usageCount: usage?.count,
      lastUsedAt: usage?.lastUsedAt,
      enabled: true,
      scope: 'global',
    };
  });
  return { ...emptyBucket(), skills };
}

function mergeSkill(into: Map<string, SkillRecord>, s: SkillRecord): void {
  const existing = into.get(s.contentId);
  if (!existing) {
    into.set(s.contentId, { ...s, usedBy: [...s.usedBy] });
    return;
  }
  const keepNew = PROVIDER_RANK[s.provider.kind] > PROVIDER_RANK[existing.provider.kind];
  const base = keepNew ? { ...s } : existing;
  const loser = keepNew ? existing : s;
  base.usedBy = [...new Set([...existing.usedBy, ...s.usedBy])].sort();
  base.bundledInPlugin ??= keepNew ? existing.bundledInPlugin : s.bundledInPlugin;
  base.description ??= keepNew ? existing.description : s.description;
  base.usageCount ??= keepNew ? existing.usageCount : s.usageCount;
  base.lastUsedAt ??= keepNew ? existing.lastUsedAt : s.lastUsedAt;
  // Retain the merged-away physical path (agent-handoff topology; see show.ts).
  const copies = new Map<string, SkillCopy>();
  for (const c of [
    ...(existing.copies ?? []),
    ...(s.copies ?? []),
    { path: loser.provider.path, providerKind: loser.provider.kind },
  ]) {
    if (c.path !== base.provider.path) copies.set(c.path, c);
  }
  base.copies = copies.size ? [...copies.values()] : undefined;
  into.set(s.contentId, base);
}

/** Merge buckets, deduping skills by contentId, plugins by id, mcp by name+scope+provider path. */
export function mergeBuckets(...buckets: Bucket[]): Bucket {
  const skills = new Map<string, SkillRecord>();
  const plugins = new Map<string, PluginRecord>();
  const mcp = new Map<string, McpRecord>();
  for (const b of buckets) {
    for (const s of b.skills) mergeSkill(skills, s);
    for (const p of b.plugins) plugins.set(p.id, p);
    for (const m of b.mcp) mcp.set(`${m.name} ${m.scope} ${m.provider.path}`, m);
  }
  return {
    skills: [...skills.values()],
    plugins: [...plugins.values()],
    mcp: [...mcp.values()],
  };
}

/** Split a directory bucket into project-scoped vs local layers by record scope. */
export function splitByScope(bucket: Bucket): { projectScoped: Bucket; local: Bucket } {
  const projectScoped = emptyBucket();
  const local = emptyBucket();
  for (const s of bucket.skills) (s.scope === 'local' ? local : projectScoped).skills.push(s);
  for (const p of bucket.plugins) projectScoped.plugins.push(p);
  for (const m of bucket.mcp) (m.scope === 'local' ? local : projectScoped).mcp.push(m);
  return { projectScoped, local };
}

export function bucketCounts(b: Bucket): { skills: number; plugins: number; mcp: number } {
  return { skills: b.skills.length, plugins: b.plugins.length, mcp: b.mcp.length };
}

/** Total record count of a bucket (skills + plugins + mcp). */
export function bucketTotal(b: Bucket): number {
  const c = bucketCounts(b);
  return c.skills + c.plugins + c.mcp;
}
