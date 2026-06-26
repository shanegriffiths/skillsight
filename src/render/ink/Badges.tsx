import { Text } from 'ink';
import type { RuntimeMark } from './runtimeMark.js';

/**
 * A packed strip of reverse-video runtime badges: each mark is a single hue-filled
 * cell with a contrast letter, packed with no separators (color boundaries divide
 * them). An optional dim `+N` trails the strip (the detail "used by" remainder).
 * Renders nothing when there is nothing to show.
 */
export function Badges({ marks, plus }: { marks: RuntimeMark[]; plus?: number }) {
  if (marks.length === 0 && !plus) return null;
  return (
    <Text>
      {marks.map((m, i) => (
        <Text key={i} backgroundColor={m.bg} color={m.fg}>
          {m.letter}
        </Text>
      ))}
      {plus ? <Text dimColor>{marks.length ? ' ' : ''}+{plus}</Text> : null}
    </Text>
  );
}
