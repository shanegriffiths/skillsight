/**
 * Resolver: enrich raw adapter records with provenance + `usedBy`, dedupe across
 * runtimes, and merge inheritance layers.
 *
 * `usedBy` for shared-store skills combines the reverse-symlink scan (distinct-dir
 * runtimes) with the lock's `lastSelectedAgents` filtered to universal agents
 * (hub-direct runtimes). Dedup key is the canonical `contentId`
 * (`skillFolderHash` ‖ realpath).
 */
import type { Bucket, McpRecord, PluginRecord, Provider, Runtime, SkillRecord } from './types.js';
import { emptyBucket } from './types.js';
import { KNOWN_RUNTIMES, type HomeCtx } from './runtimes.js';
import { lookupUsedBy } from './symlinks.js';
import type { SharedSkill } from './sharedstore.js';

const UNIVERSAL = new Set(KNOWN_RUNTIMES.filter((r) => r.universal).map((r) => r.id));

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
  lastSelectedAgents: string[];
  reverseIndex: Map<string, Set<Runtime>>;
}

function universalUsedBy(lastSelectedAgents: string[]): Runtime[] {
  return lastSelectedAgents.filter((a) => UNIVERSAL.has(a));
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

    const used = new Set<Runtime>(lookupUsedBy(enr.reverseIndex, s.provider.path));
    if (s.provider.kind === 'shared-store') {
      for (const u of universalUsedBy(enr.lastSelectedAgents)) used.add(u);
    }
    if (used.size === 0) used.add(owner);
    s.usedBy = [...used].sort();
  }
  return bucket;
}

function mergeSkill(into: Map<string, SkillRecord>, s: SkillRecord): void {
  const existing = into.get(s.contentId);
  if (!existing) {
    into.set(s.contentId, { ...s, usedBy: [...s.usedBy] });
    return;
  }
  const keepNew = PROVIDER_RANK[s.provider.kind] > PROVIDER_RANK[existing.provider.kind];
  const base = keepNew ? { ...s } : existing;
  base.usedBy = [...new Set([...existing.usedBy, ...s.usedBy])].sort();
  base.bundledInPlugin ??= keepNew ? existing.bundledInPlugin : s.bundledInPlugin;
  base.description ??= keepNew ? existing.description : s.description;
  into.set(s.contentId, base);
}

/** Merge buckets, deduping skills by contentId, plugins by id, mcp by name+scope. */
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
