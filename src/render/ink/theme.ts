/**
 * Semantic color tokens for the Ink dashboard — one home for the non-runtime
 * palette so color hierarchy stays consistent. Runtime hues live in runtimeMark.ts.
 */
export const theme = {
  accent: '#B71C1C', // dark red — the prominent emphasis (+N counts, cursor, active tab)
  good: 'green', // live / enabled (semantic — kept green)
  warn: 'yellow', // rescanning / warnings
  border: 'gray', // band borders
  bad: 'red', // off / disabled states
} as const;
