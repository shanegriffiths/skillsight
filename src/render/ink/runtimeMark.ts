/**
 * The single source of truth for runtime → visual mark. Pure data + functions,
 * no React — so tests never need Ink. Bounded to the 6 detected ("deep") runtimes;
 * everything else has no mark (callers render a neutral dim '·' / nothing).
 *
 * Letters are forced apart because claude-code / codex / cursor all start with "C";
 * color carries identity, the letter is the no-color / colorblind tiebreak. `fg` is
 * picked per-hue for contrast against the badge background.
 */
import type { Runtime } from '../../types.js';

export interface RuntimeMark {
  id: Runtime;
  /** Single ASCII cell. */
  letter: string;
  /** Badge background hue (hex; chalk degrades on lesser terminals). */
  bg: string;
  /** Letter color, chosen for contrast against `bg`. */
  fg: 'black' | 'white';
}

/** Canonical strip/badge order — mirrors DEEP_RUNTIMES so badges read like the filter chips. */
const MARKS: RuntimeMark[] = [
  { id: 'claude-code', letter: 'C', bg: '#D97757', fg: 'black' },
  { id: 'codex', letter: 'X', bg: '#10A37F', fg: 'white' },
  { id: 'hermes-agent', letter: 'H', bg: '#06B6D4', fg: 'black' },
  { id: 'gemini-cli', letter: 'G', bg: '#4285F4', fg: 'white' },
  { id: 'cursor', letter: 'U', bg: '#C678DD', fg: 'black' },
  { id: 'opencode', letter: 'O', bg: '#EF4444', fg: 'white' },
];

const BY_ID = new Map(MARKS.map((m) => [m.id, m]));
const ORDER = new Map(MARKS.map((m, i) => [m.id, i]));

export const MARK_COUNT = MARKS.length;

export function runtimeMark(id: Runtime): RuntimeMark | undefined {
  return BY_ID.get(id);
}

/** usedBy ∩ detected six, deduped, in DETECTED_ORDER. */
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

/** How many usedBy runtimes fall outside the six (the dim "+N" remainder in detail). */
export function otherCount(usedBy: readonly Runtime[]): number {
  return usedBy.filter((id) => !BY_ID.has(id)).length;
}
