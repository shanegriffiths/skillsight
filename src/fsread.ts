/**
 * Small, defensive filesystem helpers shared by adapters.
 *
 * Every read is wrapped so a missing/malformed source degrades to `undefined`
 * (optionally recording a `⚠ unreadable` warning) rather than crashing the scan.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
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
