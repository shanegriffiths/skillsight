/**
 * Small, defensive filesystem helpers shared by adapters.
 *
 * Every read is wrapped so a missing/malformed source degrades to `undefined`
 * (optionally recording a `⚠ unreadable` warning) rather than crashing the scan.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import type { Warning } from './types.js';

export function exists(path: string): boolean {
  return existsSync(path);
}

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** Read + JSON.parse a file. Records a warning on malformed JSON (not on absence). */
export function readJson<T = unknown>(path: string, warnings?: Warning[]): T | undefined {
  const raw = readText(path);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    warnings?.push({ path, reason: 'unreadable: malformed JSON' });
    return undefined;
  }
}

export interface DirEntry {
  name: string;
  isSymlink: boolean;
  isDir: boolean;
}

/**
 * A deterministic content hash of a skill folder (sorted relative paths +
 * contents). Byte-identical folders produce the same hash; a diverged file
 * changes it. Used to give path-only skills (project-local copies) a
 * content-based identity so identical copies dedupe. `undefined` when the folder
 * is missing/empty. Large files (>1 MB) fold in their size, not their bytes.
 */
export function hashSkillFolder(dir: string): string | undefined {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) files.push(p);
    }
  };
  try {
    walk(dir);
  } catch {
    return undefined;
  }
  if (files.length === 0) return undefined;
  files.sort();
  const h = createHash('sha1');
  for (const f of files) {
    h.update(relative(dir, f));
    h.update('\0');
    try {
      const st = statSync(f);
      if (st.size > 1_000_000) h.update(`size:${st.size}`);
      else h.update(readFileSync(f));
    } catch {
      /* unreadable file — its path alone still contributes */
    }
    h.update('\0');
  }
  return h.digest('hex');
}

/** List a directory's entries with type info. Returns [] when unreadable. */
export function readDirEntries(path: string): DirEntry[] {
  try {
    return readdirSync(path, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isSymlink: d.isSymbolicLink(),
      // for symlinks, isDirectory() reflects the link target after stat; keep raw
      isDir: d.isDirectory(),
    }));
  } catch {
    return [];
  }
}
