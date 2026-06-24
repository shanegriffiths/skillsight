/**
 * Tiny, tolerant SKILL.md YAML-frontmatter reader.
 *
 * Per the Claude Code skills spec all frontmatter fields are optional, so this
 * never throws on malformed/absent frontmatter — it returns `{}` and lets the
 * caller fall back (e.g. skill name defaults to the directory name).
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface Frontmatter {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/** Parse the leading `---`-fenced YAML block from a file's contents. */
export function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith('---')) return {};
  // closing fence: a line that is exactly `---`
  const end = content.indexOf('\n---', 3);
  if (end === -1) return {};
  const raw = content.slice(3, end).replace(/^\r?\n/, '');
  try {
    const data = parse(raw);
    return data && typeof data === 'object' ? (data as Frontmatter) : {};
  } catch {
    return {};
  }
}

/** Read + parse a SKILL.md path. Returns `{}` if unreadable. */
export function readFrontmatterFile(path: string): Frontmatter {
  try {
    return parseFrontmatter(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}
