/**
 * Pure resolution for Claude Code per-skill visibility (`skillOverrides`).
 *
 * Keys are skill DIRECTORY names, not frontmatter `name` (verified
 * empirically 2026-07-04: an override keyed by frontmatter name is a no-op —
 * the same identity rule as the Codex `[[skills.config]]` fix). Merge is
 * per-key, higher layer wins: local > project > user. Plugin-bundled skills
 * are exempt; callers skip them.
 */
import type { SkillRecord, SkillVisibility, VisibilitySource, Warning } from '../types.js';

const STATES: readonly string[] = ['on', 'name-only', 'user-invocable-only', 'off'];

export type SkillOverrides = Record<string, SkillVisibility>;

export interface VisibilityLayers {
  user?: SkillOverrides;
  project?: SkillOverrides;
  local?: SkillOverrides;
}

export interface ResolvedVisibility {
  visibility: SkillVisibility;
  source: VisibilitySource;
}

/**
 * Validate a raw `skillOverrides` value from a settings file. Non-object →
 * `{}` + warning. An invalid state is kept as `'on'` (it is still an
 * override entry, just one we can't read) + warning.
 */
export function parseSkillOverrides(raw: unknown, path: string, warnings?: Warning[]): SkillOverrides {
  if (raw === undefined) return {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings?.push({ path, reason: 'invalid skillOverrides (not an object; ignored)' });
    return {};
  }
  const out: SkillOverrides = {};
  for (const [name, state] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof state === 'string' && STATES.includes(state)) {
      out[name] = state as SkillVisibility;
    } else {
      warnings?.push({
        path,
        reason: `invalid skillOverrides state ${JSON.stringify(state)} for "${name}" (treated as "on")`,
      });
      out[name] = 'on';
    }
  }
  return out;
}

/** `local ?? project ?? user` for one dir name; `undefined` when no layer names it. */
export function resolveVisibility(dirName: string, layers: VisibilityLayers): ResolvedVisibility | undefined {
  const local = layers.local?.[dirName];
  if (local !== undefined) return { visibility: local, source: 'local' };
  const project = layers.project?.[dirName];
  if (project !== undefined) return { visibility: project, source: 'project' };
  const user = layers.user?.[dirName];
  if (user !== undefined) return { visibility: user, source: 'user' };
  return undefined;
}

/** SkillRecord fields for a resolved override. `enabled` derives as `visibility !== 'off'`. */
export function visibilityOverlay(r: ResolvedVisibility | undefined): Partial<SkillRecord> | undefined {
  if (!r) return undefined;
  return { visibility: r.visibility, visibilitySource: r.source, enabled: r.visibility !== 'off' };
}
