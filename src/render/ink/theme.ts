/**
 * Semantic color tokens for the Ink dashboard — one home for the non-runtime
 * palette so color hierarchy stays consistent. Runtime hues live in runtimeMark.ts.
 */
export const theme = {
  accent: 'cyan', // +N counts, cursor
  good: 'green', // live
  warn: 'yellow', // rescanning / warnings
  border: 'gray', // band borders
} as const;
