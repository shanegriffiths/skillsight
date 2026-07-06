import { Text } from 'ink';
import type { RuntimeMark } from './runtimeMark.js';

/**
 * A plain spaced strip of runtime letters (`C X H`) — no color, no background;
 * the letter alone carries identity. An optional dim `+N` trails the strip (the
 * detail "used by" remainder). Renders nothing when there is nothing to show.
 */
export function RuntimeLetters({ marks, plus }: { marks: RuntimeMark[]; plus?: number }) {
  if (marks.length === 0 && !plus) return null;
  return (
    <Text>
      {marks.map((m) => m.letter).join(' ')}
      {plus ? <Text dimColor>{marks.length ? ' ' : ''}+{plus}</Text> : null}
    </Text>
  );
}
