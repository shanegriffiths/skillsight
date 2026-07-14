/**
 * `skillsight show <ref>` — the agent-handoff read model.
 *
 * Resolves a name / id-prefix ref against a fresh scan and assembles the
 * versioned ShowRecord: every physical copy (dedup survivors + merged-away
 * paths), symlink sites, pure-fs git worktree grouping, and same-name
 * collisions. Read-only by design: skillsight reports topology; the agent
 * executes mutations. See docs/superpowers/specs/2026-07-14-agent-handoff-show-design.md.
 */
import { createRequire } from 'node:module';
import type { Bucket, Inventory, Kind, McpRecord, PluginRecord, Provider, SkillRecord } from './types.js';
import { scanFull, type ScanOptions } from './index.js';
import { lookupSites, type SiteIndex, type SymlinkSite } from './symlinks.js';
import { gitLink, type GitLink } from './git.js';
import { renderShowPanel } from './render/show.js';

const VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

export type ShowHit =
  | { kind: 'skill'; record: SkillRecord }
  | { kind: 'plugin'; record: PluginRecord }
  | { kind: 'mcp'; record: McpRecord };

export interface ShowCopy {
  path: string;
  /** Layers containing this physical copy: 'global' or a project folder path. */
  folders: string[];
  providerKind: Provider['kind'];
  git: GitLink | null;
}

export interface ShowCandidate {
  name: string;
  kind: Kind;
  id: string;
  folders: string[];
}

export interface ShowRecord {
  schemaVersion: 1;
  scanTime: string; // Inventory.generatedAt
  skillsightVersion: string; // package.json version
  homeRoot: string;
  kind: Kind;
  item: SkillRecord | PluginRecord | McpRecord; // full ids; internal `copies` stripped
  copies: ShowCopy[]; // skills: every physical copy INCLUDING provider.path; mcp: declaring configs; plugins: []
  sites: SymlinkSite[];
  collisions: ShowCandidate[]; // same name, different identity
}

export type RefResolution =
  | { status: 'found'; hit: ShowHit }
  | { status: 'not-found'; suggestions: string[] }
  | { status: 'ambiguous'; candidates: ShowCandidate[] };

export interface ShowIO {
  out: (s: string) => void;
  err: (s: string) => void;
  isTTY: boolean;
  json: boolean;
}

interface Layer {
  folder: string;
  bucket: Bucket;
}

function layers(inv: Inventory): Layer[] {
  return [
    { folder: 'global', bucket: inv.global },
    ...inv.folders.flatMap((f) => [
      { folder: f.path, bucket: f.projectScoped },
      { folder: f.path, bucket: f.local },
    ]),
  ];
}

interface Entry {
  key: string;
  kind: Kind;
  name: string;
  id: string;
  folder: string;
  hit: ShowHit;
}

/** One Entry per record occurrence, walking global first then each folder's projectScoped/local layers. */
function entries(inv: Inventory): Entry[] {
  const out: Entry[] = [];
  for (const layer of layers(inv)) {
    for (const s of layer.bucket.skills) {
      out.push({
        key: `skill:${s.contentId}`,
        kind: 'skill',
        name: s.name,
        id: s.contentId,
        folder: layer.folder,
        hit: { kind: 'skill', record: s },
      });
    }
    for (const p of layer.bucket.plugins) {
      out.push({
        key: `plugin:${p.id}`,
        kind: 'plugin',
        name: p.name,
        id: p.id,
        folder: layer.folder,
        hit: { kind: 'plugin', record: p },
      });
    }
    for (const m of layer.bucket.mcp) {
      out.push({
        key: `mcp:${m.name}`,
        kind: 'mcp',
        name: m.name,
        id: m.name,
        folder: layer.folder,
        hit: { kind: 'mcp', record: m },
      });
    }
  }
  return out;
}

/** Identity groups: first-seen (global-first) Entry per key + sorted unique folders. */
function grouped(inv: Inventory): Map<string, { first: Entry; folders: string[] }> {
  const acc = new Map<string, { first: Entry; folders: Set<string> }>();
  for (const e of entries(inv)) {
    let g = acc.get(e.key);
    if (!g) {
      g = { first: e, folders: new Set() };
      acc.set(e.key, g);
    }
    g.folders.add(e.folder);
  }
  const out = new Map<string, { first: Entry; folders: string[] }>();
  for (const [key, g] of acc) out.set(key, { first: g.first, folders: [...g.folders].sort() });
  return out;
}

function keyOf(hit: ShowHit): string {
  if (hit.kind === 'skill') return `skill:${hit.record.contentId}`;
  if (hit.kind === 'plugin') return `plugin:${hit.record.id}`;
  return `mcp:${hit.record.name}`;
}

export function resolveRef(inv: Inventory, ref: string): RefResolution {
  const groups = grouped(inv);
  const matched = new Set<string>();

  for (const [key, g] of groups) {
    if (g.first.name === ref) matched.add(key);
  }
  if (ref.length >= 4) {
    for (const [key, g] of groups) {
      if ((g.first.kind === 'skill' || g.first.kind === 'plugin') && g.first.id.startsWith(ref)) {
        matched.add(key);
      }
    }
  }

  if (matched.size === 0) {
    const refLower = ref.toLowerCase();
    const names = new Set<string>();
    for (const g of groups.values()) names.add(g.first.name);
    const suggestions = [...names]
      .filter((n) => n.toLowerCase().includes(refLower))
      .sort()
      .slice(0, 5);
    return { status: 'not-found', suggestions };
  }

  if (matched.size > 1) {
    const candidates = [...matched]
      .map((key) => {
        const g = groups.get(key)!;
        return { name: g.first.name, kind: g.first.kind, id: g.first.id, folders: g.folders };
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return { status: 'ambiguous', candidates };
  }

  const onlyKey = [...matched][0]!;
  return { status: 'found', hit: groups.get(onlyKey)!.first.hit };
}

interface CopyAccum {
  path: string;
  folders: Set<string>;
  providerKind: Provider['kind'];
}

function addCopy(map: Map<string, CopyAccum>, path: string, folder: string, providerKind: Provider['kind']): void {
  let acc = map.get(path);
  if (!acc) {
    acc = { path, folders: new Set(), providerKind };
    map.set(path, acc);
  }
  acc.folders.add(folder);
}

function finalizeCopies(map: Map<string, CopyAccum>): ShowCopy[] {
  return [...map.values()]
    .map((c) => ({ path: c.path, folders: [...c.folders].sort(), providerKind: c.providerKind, git: gitLink(c.path) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Strip the internal dedup-bookkeeping `copies` field a skill record carries. */
function stripInternalCopies(hit: ShowHit): SkillRecord | PluginRecord | McpRecord {
  if (hit.kind === 'skill') {
    const { copies: _internal, ...item } = hit.record;
    return item;
  }
  return hit.record;
}

export function assembleShow(inv: Inventory, sites: SiteIndex, hit: ShowHit): ShowRecord {
  const key = keyOf(hit);
  const sameKey = entries(inv).filter((e) => e.key === key);

  let copies: ShowCopy[] = [];
  let siteList: SymlinkSite[] = [];
  let collisions: ShowCandidate[] = [];

  if (hit.kind === 'skill') {
    const map = new Map<string, CopyAccum>();
    for (const e of sameKey) {
      const rec = e.hit.record as SkillRecord;
      addCopy(map, rec.provider.path, e.folder, rec.provider.kind);
      for (const c of rec.copies ?? []) addCopy(map, c.path, e.folder, c.providerKind);
    }
    copies = finalizeCopies(map);

    const siteMap = new Map<string, SymlinkSite>();
    for (const c of copies) {
      for (const site of lookupSites(sites, c.path)) siteMap.set(site.linkPath, site);
    }
    siteList = [...siteMap.values()].sort((a, b) => a.runtime.localeCompare(b.runtime));
  } else if (hit.kind === 'mcp') {
    const map = new Map<string, CopyAccum>();
    for (const e of sameKey) {
      const rec = e.hit.record as McpRecord;
      addCopy(map, rec.provider.path, e.folder, rec.provider.kind);
    }
    copies = finalizeCopies(map);
  }
  // plugin: copies stays [], sites stays [].

  if (hit.kind !== 'mcp') {
    const groups = grouped(inv);
    const name = hit.record.name;
    collisions = [...groups.entries()]
      .filter(([k, g]) => k !== key && g.first.name === name)
      .map(([, g]) => ({ name: g.first.name, kind: g.first.kind, id: g.first.id, folders: g.folders }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  return {
    schemaVersion: 1,
    scanTime: inv.generatedAt,
    skillsightVersion: VERSION,
    homeRoot: inv.homeRoot,
    kind: hit.kind,
    item: stripInternalCopies(hit),
    copies,
    sites: siteList,
    collisions,
  };
}

export function runShow(homeRoot: string, opts: ScanOptions, ref: string, io: ShowIO): 0 | 1 | 2 {
  const { inventory, sites } = scanFull(homeRoot, opts);
  const res = resolveRef(inventory, ref);

  if (res.status === 'not-found') {
    io.err(`No skill, plugin, or mcp server matches "${ref}".\n`);
    if (res.suggestions.length) io.err(`Did you mean: ${res.suggestions.join(', ')}?\n`);
    return 1;
  }

  if (res.status === 'ambiguous') {
    io.err(`"${ref}" is ambiguous — matches ${res.candidates.length} items:\n`);
    for (const c of res.candidates) {
      io.err(`  ${c.name} · ${c.kind} · ${c.id.slice(0, 12)} · ${c.folders.join(', ')}\n`);
    }
    return 2;
  }

  const rec = assembleShow(inventory, sites, res.hit);
  io.out((io.json || !io.isTTY ? JSON.stringify(rec, null, 2) : renderShowPanel(rec)) + '\n');
  return 0;
}
