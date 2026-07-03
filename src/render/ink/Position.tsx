import { Text } from 'ink';

/** The "X–Y of Z" scroll position line; renders nothing when the list fits. */
export function Position({ start, end, total, height }: { start: number; end: number; total: number; height: number }) {
  if (total <= height) return null;
  return (
    <Text dimColor>
      {start + 1}–{end} of {total}
    </Text>
  );
}
