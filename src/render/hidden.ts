// src/render/hidden.ts
/**
 * Shared "hidden folder" predicate — the dashboard's `.`-toggle default and the
 * plain report use the same rule so the two default views agree.
 */
import { relative, sep } from 'node:path';

/** A home-relative path is hidden if any segment starts with '.'. */
export function isHiddenPath(relPath: string): boolean {
  return relPath.split('/').some((seg) => seg.startsWith('.'));
}

/** Absolute-path variant: folders outside `homeRoot` are never hidden. */
export function isHiddenFolder(path: string, homeRoot: string): boolean {
  const rel = relative(homeRoot, path);
  if (!rel || rel.startsWith('..')) return false;
  return isHiddenPath(rel.split(sep).join('/'));
}
