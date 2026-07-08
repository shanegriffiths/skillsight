/**
 * Claude Code's per-skill usage telemetry, from `~/.claude.json`'s `skillUsage`.
 * Each entry is `{ usageCount, lastUsedAt }`, keyed by the bare skill name
 * (standalone / hub skills) or `plugin:skill` (plugin-bundled). This is Claude
 * Code usage only — no other runtime exposes an equivalent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HomeCtx } from './runtimes.js';

export interface SkillUsage {
  count: number;
  lastUsedAt?: number;
}

/** Parse the raw `skillUsage` object into a map, tolerating absent/garbage entries. */
export function parseSkillUsage(raw: unknown): Map<string, SkillUsage> {
  const out = new Map<string, SkillUsage>();
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const count = (v as { usageCount?: unknown }).usageCount;
    if (typeof count !== 'number') continue;
    const last = (v as { lastUsedAt?: unknown }).lastUsedAt;
    out.set(key, { count, lastUsedAt: typeof last === 'number' ? last : undefined });
  }
  return out;
}

/** The `skillUsage` key for a skill: `plugin:name` when bundled, else the bare name. */
export function usageKey(name: string, bundledInPlugin?: string): string {
  return bundledInPlugin ? `${bundledInPlugin.split('@')[0]}:${name}` : name;
}

/** Read + parse `~/.claude.json`'s `skillUsage`. Empty map when unreadable. */
export function readSkillUsage(ctx: HomeCtx): Map<string, SkillUsage> {
  try {
    const raw = JSON.parse(readFileSync(join(ctx.homeRoot, '.claude.json'), 'utf8')) as { skillUsage?: unknown };
    return parseSkillUsage(raw.skillUsage);
  } catch {
    return new Map();
  }
}
