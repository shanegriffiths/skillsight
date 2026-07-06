/**
 * The single source of truth for runtime → letter mark. Pure data + functions,
 * no React — so tests never need Ink. Bounded to the 6 detected ("deep") runtimes;
 * everything else has no mark (callers render a neutral dim '·' / nothing).
 *
 * Letters are forced apart because claude-code / codex / cursor all start with
 * "C". Rendered as plain text — identity is the letter alone, no color.
 */
import type { Runtime } from '../../types.js';

export interface RuntimeMark {
  id: Runtime;
  /** Single ASCII cell. */
  letter: string;
}

/** Canonical strip order — mirrors DEEP_RUNTIMES so letters read like the filter chips. */
const MARKS: RuntimeMark[] = [
  { id: 'claude-code', letter: 'C' },
  { id: 'codex', letter: 'X' },
  { id: 'hermes-agent', letter: 'H' },
  { id: 'gemini-cli', letter: 'G' },
  { id: 'cursor', letter: 'U' },
  { id: 'opencode', letter: 'O' },
];

const BY_ID = new Map(MARKS.map((m) => [m.id, m]));
const ORDER = new Map(MARKS.map((m, i) => [m.id, i]));

export const MARK_COUNT = MARKS.length;

export function runtimeMark(id: Runtime): RuntimeMark | undefined {
  return BY_ID.get(id);
}

/** usedBy ∩ detected six, deduped, in canonical order. */
export function marksFor(usedBy: readonly Runtime[]): RuntimeMark[] {
  const seen = new Set<Runtime>();
  const out: RuntimeMark[] = [];
  for (const id of usedBy) {
    const m = BY_ID.get(id);
    if (m && !seen.has(id)) {
      seen.add(id);
      out.push(m);
    }
  }
  return out.sort((a, b) => ORDER.get(a.id)! - ORDER.get(b.id)!);
}

/** Space-joined letter strip, e.g. `"C X H"`; `''` when nothing matches. */
export function lettersFor(usedBy: readonly Runtime[]): string {
  return marksFor(usedBy)
    .map((m) => m.letter)
    .join(' ');
}

/** How many usedBy runtimes fall outside the six (the dim "+N" remainder in detail). */
export function otherCount(usedBy: readonly Runtime[]): number {
  return usedBy.filter((id) => !BY_ID.has(id)).length;
}
