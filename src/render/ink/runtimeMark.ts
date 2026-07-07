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

/**
 * Human-readable names for the detected six — used where there's room to spell
 * them out (the detail pane's `used by`, the filter chips), as opposed to the
 * compact letter marks that belong in dense tables and status lines.
 */
const NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'hermes-agent': 'Hermes',
  'gemini-cli': 'Gemini',
  cursor: 'Cursor',
  opencode: 'OpenCode',
};

/** Display name for a runtime: a curated name, else the id title-cased. */
export function runtimeName(id: Runtime): string {
  return NAMES[id] ?? id.split('-').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ');
}

/**
 * Comma-joined full runtime names, deduped, detected six first in canonical
 * strip order and everything else after in given order; `'none'` when empty.
 */
export function namesFor(usedBy: readonly Runtime[]): string {
  const seen = new Set<Runtime>();
  const ids: Runtime[] = [];
  for (const id of usedBy) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  ids.sort((a, b) => (ORDER.get(a) ?? Infinity) - (ORDER.get(b) ?? Infinity));
  return ids.length ? ids.map(runtimeName).join(', ') : 'none';
}

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
